import z from "@deepseek-ai/schemastery";
//#region src/config.ts
/** Defaults when nothing is configured. */
const DEFAULT_CONFIG = {
	enabled: true,
	defaultMode: "title"
};
/** The settings namespace the host half registers (kept in lockstep with src/index.ts). */
const SWITCH_SEARCH_SETTINGS_NAMESPACE = "switch-search";
//#endregion
//#region src/index.ts
/** Stable plugin name for the cordis row. */
const name = "dsh-switch-search";
/** Services required before mounting: the web server routes and the trust list. */
const inject = ["webServer", "webRuntime"];
/** Composition-entry schema: what a dsh profile may configure at assembly time. */
const Config = z.object({
	enabled: z.boolean().default(true),
	defaultMode: z.union(["title", "content"]).default("title")
});
/**
* Inline equivalent of the official `installSettingsSection` helper: register
* the namespace through the `settings` service, layer the composition entry as
* `base`, and keep the runtime source live. Same pattern as dsh-thinking-levels.
* @param ctx - host context carrying the settings service.
* @param ns - settings namespace to register.
* @param schema - schemastery schema resolving the namespace value.
* @param entry - composition-entry config used as the `base` layer.
* @param hooks - source sink and change notification.
*/
function installSettingsSection(ctx, ns, schema, entry, hooks) {
	ctx.inject(["settings"], (sctx) => {
		const scope = sctx.settings.register(ns, schema, { base: entry });
		hooks.setSource(() => scope.get());
		hooks.onChange();
		sctx.effect(() => () => {
			hooks.setSource(() => entry);
			hooks.onChange();
		});
		scope.watch(() => hooks.onChange());
	});
}
/** Body size bound of one JSON request (defense against unbounded reads). */
const MAX_BODY_BYTES = 1 << 20;
/** Default maximum sessions returned by one content search. */
const DEFAULT_LIMIT = 20;
/** Event types included when the coarse filter is `all`. */
const ALL_CONTENT_TYPES = [
	"user/message",
	"assistant/message",
	"tool/call",
	"tool/result"
];
/** Coarse filter → raw event types. */
const CONTENT_TYPE_GROUPS = {
	user: ["user/message"],
	reply: ["assistant/message"],
	tool: ["tool/call", "tool/result"]
};
/** Content search includes only current-surface messages of the requested types. */
function contentEventFilters(types) {
	return [{
		kind: "type",
		values: [...new Set(types)]
	}, {
		kind: "surface",
		values: ["current"]
	}];
}
/** Normalize a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
/** Whether a normalized URL hostname names the local loopback authority. */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Whether the request Host matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return (entryUrl.port === "" ? entryUrl.hostname : entryUrl.host) === hostUrl.host;
	});
}
/**
* Browser-trust fence, behaviorally identical to the /api gateway's fence:
* loopback Host header or a configured trusted authority; cross-site browser
* markers refuse. DNS-rebinding / cross-site defense, not authentication.
*/
function isTrustedApiRequest(req, trustedHosts) {
	const host = req.headers.host;
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	const fetchSite = req.headers["sec-fetch-site"];
	if (typeof fetchSite === "string" && fetchSite === "cross-site") return false;
	const origin = req.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** Read and parse the JSON request body (bounded; malformed → null). */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new Error("request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("malformed JSON body");
	}
}
/** Write a JSON response with the given status. */
function writeJson(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-cache"
	});
	res.end(text);
}
/** Fold titles for a set of sessions into a sessionId → title map. */
async function titleMap(sessionQuery, sessionIds) {
	if (sessionIds.length === 0) return /* @__PURE__ */ new Map();
	const observations = await sessionQuery.readTitleSnapshots([...new Set(sessionIds)]);
	const map = /* @__PURE__ */ new Map();
	for (const observation of observations) {
		if (observation.status !== "fulfilled" || observation.value === void 0) continue;
		const title = observation.value.title?.title;
		if (typeof title === "string" && title.trim().length > 0) map.set(observation.value.session.id, title);
	}
	return map;
}
/** list-sessions: the full title-search corpus. */
async function listSessions(ctx) {
	const sessionQuery = ctx.get("sessionQuery");
	if (sessionQuery === void 0) return {
		ok: false,
		error: "sessionQuery 服务不可用"
	};
	try {
		const records = await sessionQuery.listSessions();
		const titles = await titleMap(sessionQuery, records.map((record) => record.header.id));
		return {
			ok: true,
			items: records.map((record) => ({
				sessionId: record.header.id,
				title: titles.get(record.header.id) ?? "",
				cwd: record.header.cwd ?? "",
				updatedAt: record.header.createdAt
			}))
		};
	} catch (err) {
		return {
			ok: false,
			error: String(err instanceof Error ? err.message : err)
		};
	}
}
/** content-search: FTS5 message-content hits grouped by session. */
async function contentSearch(ctx, payload) {
	const record = payload;
	const query = typeof record?.query === "string" ? record.query.trim() : "";
	if (query === "") return {
		ok: false,
		error: "缺少 query"
	};
	const requestedLimit = typeof record?.limit === "number" && Number.isSafeInteger(record.limit) ? record.limit : DEFAULT_LIMIT;
	const limit = Math.min(Math.max(1, requestedLimit), 100);
	let types;
	if (Array.isArray(record?.types) && record.types.length > 0) {
		const picked = /* @__PURE__ */ new Set();
		for (const entry of record.types) if (entry === "all") picked.add("all");
		else if (entry === "user" || entry === "reply" || entry === "tool") picked.add(entry);
		types = picked.has("all") ? ALL_CONTENT_TYPES : picked.size === 0 ? ALL_CONTENT_TYPES : [...picked].flatMap((entry) => CONTENT_TYPE_GROUPS[entry]);
	} else types = ["user/message", "assistant/message"];
	const sessionQuery = ctx.get("sessionQuery");
	if (sessionQuery === void 0) return {
		ok: false,
		error: "sessionQuery 服务不可用"
	};
	try {
		const page = await sessionQuery.searchSessions({
			query,
			eventFilters: contentEventFilters(types),
			limit
		});
		const titles = await titleMap(sessionQuery, page.items.map((hit) => hit.header.id));
		return {
			ok: true,
			items: page.items.map((hit) => ({
				sessionId: hit.header.id,
				title: titles.get(hit.header.id) ?? "",
				snippet: hit.bestMatch.snippet,
				seq: hit.bestMatch.seq,
				type: hit.bestMatch.type,
				time: hit.bestMatch.time
			}))
		};
	} catch (err) {
		return {
			ok: false,
			error: String(err instanceof Error ? err.message : err)
		};
	}
}
/**
* search-status: probe whether the host full-text index is reachable. The
* shipped DSH bundle ships `openAt: never` (content search disabled); this
* tells the panel whether 内容搜索 can work so it can render a setup hint
* instead of a bare failure.
*/
async function searchStatus(ctx) {
	const sessionQuery = ctx.get("sessionQuery");
	if (sessionQuery === void 0) return {
		ok: true,
		available: false,
		reason: "unavailable"
	};
	try {
		await sessionQuery.searchSessions({
			query: "probe",
			limit: 1
		});
		return {
			ok: true,
			available: true
		};
	} catch (err) {
		const message = String(err instanceof Error ? err.message : err);
		return {
			ok: true,
			available: false,
			reason: /SEARCH_DISABLED|disabled/u.test(message) ? "disabled" : "unavailable",
			error: message
		};
	}
}
/**
* Plugin body: mount the fenced /switch-search/api route.
* @param ctx - host plugin context (webServer, webRuntime).
*/
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/switch-search/api",
		handler: async (req, res) => {
			if (!isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)) {
				writeJson(res, 403, {
					ok: false,
					error: "forbidden"
				});
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: "method not allowed"
				});
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/switch-search/api/") ? pathname.slice(19) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeJson(res, 404, {
					ok: false,
					error: "unknown switch-search API method"
				});
				return;
			}
			try {
				const payload = await readJsonBody(req);
				if (method === "list-sessions") {
					writeJson(res, 200, await listSessions(ctx));
					return;
				}
				if (method === "content-search") {
					writeJson(res, 200, await contentSearch(ctx, payload));
					return;
				}
				if (method === "search-status") {
					writeJson(res, 200, await searchStatus(ctx));
					return;
				}
				writeJson(res, 404, {
					ok: false,
					error: `unknown switch-search API method "${method}"`
				});
			} catch (err) {
				writeJson(res, 400, {
					ok: false,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}
	}), "dsh-switch-search: /switch-search/api route");
	installSettingsSection(ctx, SWITCH_SEARCH_SETTINGS_NAMESPACE, Config, DEFAULT_CONFIG, {
		setSource: (source) => {},
		onChange: () => {}
	});
}
//#endregion
export { Config, DEFAULT_CONFIG, SWITCH_SEARCH_SETTINGS_NAMESPACE, apply, inject, name };

//# sourceMappingURL=index.mjs.map