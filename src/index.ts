/**
 * dsh-switch-search host half: one fenced HTTP route `/switch-search/api`
 * that drives the sidebar search panel's two modes:
 *
 * - `list-sessions` — the title-search corpus: every session id + folded
 *   title (+ cwd/updatedAt), read through `sessionQuery` (live-preferred).
 * - `content-search` — FTS5 message-content search grouped by session: each
 *   hit is the session header plus its strongest matching event's snippet,
 *   seq, and type. This is the "switch to content mode" data source.
 *
 * Both ride `sessionQuery`'s live-preferred corpus, so results include
 * sessions that are not currently loaded into the conversation window.
 * The route is browser-trust fenced exactly like dsh-history's `/history/api`.
 */
import type { Context } from 'cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** The webServer service face this plugin uses (structural mirror). */
interface SwitchWebServer {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** The web runtime service face: bind-derived trusted authorities. */
interface SwitchWebRuntime {
  trustedHosts: readonly string[]
}

/** One session header shape the query service returns (structural subset). */
interface SwitchSessionHeader {
  id: string
  version: number
  createdAt: number
  cwd?: string
  parentSession?: string
  seedLength?: number
  delegationDepth?: number
  agentPreset?: string
}

/** One logical-session record (structural subset). */
interface SwitchSessionRecord {
  header: SwitchSessionHeader
  live: boolean
  persisted: boolean
}

/** One title observation result (structural subset). */
interface SwitchTitleObservationResult {
  status: 'fulfilled' | 'rejected'
  value?: { session: SwitchSessionHeader; title?: { title: string } }
  reason?: unknown
}

/** One strongest matching event hit (structural subset). */
interface SwitchEventHit {
  sessionId: string
  seq: number
  type: string
  time: number
  surface: string
  snippet: string
}

/** One grouped cross-session search hit (structural subset). */
interface SwitchSearchHit {
  header: SwitchSessionHeader
  live: boolean
  persisted: boolean
  bestMatch: SwitchEventHit
}

/** One content-search page (structural subset). */
interface SwitchSearchPage {
  items: readonly SwitchSearchHit[]
  nextCursor?: string
}

/** The session-query service face: corpus reads, title folding, FTS5 search. */
interface SwitchSessionQuery {
  listSessions(signal?: AbortSignal): Promise<readonly SwitchSessionRecord[]>
  readTitleSnapshots(
    sessionIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly SwitchTitleObservationResult[]>
  searchSessions(
    request: { query: string; eventFilters?: readonly unknown[]; limit?: number },
    exec?: { signal?: AbortSignal },
  ): Promise<SwitchSearchPage>
}

declare module 'cordis' {
  interface Context {
    webServer: SwitchWebServer
    webRuntime: SwitchWebRuntime
    sessionQuery?: SwitchSessionQuery
  }
}

/** Stable plugin name for the cordis row. */
export const name = 'dsh-switch-search'

/** Services required before mounting: the web server routes and the trust list. */
export const inject = ['webServer', 'webRuntime']

/** Body size bound of one JSON request (defense against unbounded reads). */
const MAX_BODY_BYTES = 1 << 20

/** Default maximum sessions returned by one content search. */
const DEFAULT_LIMIT = 20

/** Content search includes only current-surface user/assistant messages. */
const CONTENT_EVENT_FILTERS = [
  { kind: 'type', values: ['user/message', 'assistant/message'] },
  { kind: 'surface', values: ['current'] },
]

/** Normalize a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** Whether a normalized URL hostname names the local loopback authority. */
function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Whether the request Host matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    const canonical = entryUrl.port === '' ? entryUrl.hostname : entryUrl.host
    return canonical === hostUrl.host
  })
}

/**
 * Browser-trust fence, behaviorally identical to the /api gateway's fence:
 * loopback Host header or a configured trusted authority; cross-site browser
 * markers refuse. DNS-rebinding / cross-site defense, not authentication.
 */
function isTrustedApiRequest(req: IncomingMessage, trustedHosts: readonly string[]): boolean {
  const host = req.headers.host
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  const fetchSite = req.headers['sec-fetch-site']
  if (typeof fetchSite === 'string' && fetchSite === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** Read and parse the JSON request body (bounded; malformed → null). */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('malformed JSON body')
  }
}

/** Write a JSON response with the given status. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' })
  res.end(text)
}

/** Fold titles for a set of sessions into a sessionId → title map. */
async function titleMap(
  sessionQuery: SwitchSessionQuery,
  sessionIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (sessionIds.length === 0) return new Map()
  const observations = await sessionQuery.readTitleSnapshots([...new Set(sessionIds)])
  const map = new Map<string, string>()
  for (const observation of observations) {
    if (observation.status !== 'fulfilled' || observation.value === undefined) continue
    const title = observation.value.title?.title
    if (typeof title === 'string' && title.trim().length > 0) map.set(observation.value.session.id, title)
  }
  return map
}

/** list-sessions: the full title-search corpus. */
async function listSessions(ctx: Context): Promise<{ ok: boolean; items?: unknown[]; error?: string }> {
  const sessionQuery = ctx.get('sessionQuery') as SwitchSessionQuery | undefined
  if (sessionQuery === undefined) return { ok: false, error: 'sessionQuery 服务不可用' }
  try {
    const records = await sessionQuery.listSessions()
    const titles = await titleMap(sessionQuery, records.map(record => record.header.id))
    return {
      ok: true,
      items: records.map(record => ({
        sessionId: record.header.id,
        title: titles.get(record.header.id) ?? '',
        cwd: record.header.cwd ?? '',
        updatedAt: record.header.createdAt,
      })),
    }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

/** content-search: FTS5 message-content hits grouped by session. */
async function contentSearch(
  ctx: Context,
  payload: unknown,
): Promise<{ ok: boolean; items?: unknown[]; error?: string }> {
  const record = payload as { query?: unknown; limit?: unknown } | null
  const query = typeof record?.query === 'string' ? record.query.trim() : ''
  if (query === '') return { ok: false, error: '缺少 query' }
  const requestedLimit = typeof record?.limit === 'number' && Number.isSafeInteger(record.limit)
    ? record.limit
    : DEFAULT_LIMIT
  const limit = Math.min(Math.max(1, requestedLimit), 100)
  const sessionQuery = ctx.get('sessionQuery') as SwitchSessionQuery | undefined
  if (sessionQuery === undefined) return { ok: false, error: 'sessionQuery 服务不可用' }
  try {
    const page = await sessionQuery.searchSessions({
      query,
      eventFilters: CONTENT_EVENT_FILTERS,
      limit,
    })
    const titles = await titleMap(sessionQuery, page.items.map(hit => hit.header.id))
    return {
      ok: true,
      items: page.items.map(hit => ({
        sessionId: hit.header.id,
        title: titles.get(hit.header.id) ?? '',
        snippet: hit.bestMatch.snippet,
        seq: hit.bestMatch.seq,
        type: hit.bestMatch.type,
        time: hit.bestMatch.time,
      })),
    }
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) }
  }
}

/**
 * Plugin body: mount the fenced /switch-search/api route.
 * @param ctx - host plugin context (webServer, webRuntime).
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/switch-search/api',
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)) {
        writeJson(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/switch-search/api/')
        ? pathname.slice('/switch-search/api/'.length)
        : undefined
      if (method === undefined || method.includes('/')) {
        writeJson(res, 404, { ok: false, error: 'unknown switch-search API method' })
        return
      }
      try {
        const payload = await readJsonBody(req)
        let result: { ok: boolean; items?: unknown[]; error?: string }
        if (method === 'list-sessions') result = await listSessions(ctx)
        else if (method === 'content-search') result = await contentSearch(ctx, payload)
        else {
          writeJson(res, 404, { ok: false, error: `unknown switch-search API method "${method}"` })
          return
        }
        writeJson(res, result.ok ? 200 : 400, result)
      } catch (err) {
        writeJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    },
  }), 'dsh-switch-search: /switch-search/api route')
}
