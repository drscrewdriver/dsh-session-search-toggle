window.__ModuleLoader__.load({
	id: "dsh-session-search-toggle",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		require("react-dom");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/config.ts
		/** Defaults when nothing is configured. */
		const DEFAULT_CONFIG = {
			enabled: true,
			defaultMode: "title"
		};
		/** The settings namespace the host half registers (kept in lockstep with src/index.ts). */
		const SWITCH_SEARCH_SETTINGS_NAMESPACE = "switch-search";
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-session-search-toggle client half: a `sidebar.footer.action` entry that opens a
		* floating search panel over the sidebar. The panel has two modes:
		*
		* - 标题搜索 — lists every session (title + cwd) from the host route and
		*   filters by title/cwd substring locally.
		* - 内容搜索 — FTS5 message-content search through the host route, grouped by
		*   session: each row shows the session title and its strongest snippet.
		*
		* The panel is portalled to document.body so it never fights the sidebar
		* column's clip; positioning anchors to the trigger button's box. Clicking a
		* result opens that session and closes the panel.
		*/
		/** The settings store: mirror of the namespace section plus the write set. */
		const switchSearchStore = (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
			init: () => ({
				enabled: DEFAULT_CONFIG.enabled,
				defaultMode: DEFAULT_CONFIG.defaultMode,
				revision: -1,
				writable: false,
				unavailable: false
			}),
			actions: { sync(d, snap) {
				if (snap.revision !== void 0 && snap.revision <= d.revision) return;
				const value = snap.value;
				if (value?.enabled !== void 0) d.enabled = value.enabled;
				if (value?.defaultMode !== void 0) d.defaultMode = value.defaultMode;
				if (snap.revision !== void 0) d.revision = snap.revision;
				d.writable = snap.writable;
				d.unavailable = snap.status === "unavailable";
			} }
		});
		/** ------------------------------------------------------------------ styles */
		const CSS = `
.dsws_root{box-sizing:border-box;position:relative;display:flex;align-items:center;justify-content:center;flex:none;width:100%}
.dsws_button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0 10px;font-size:12px;line-height:18px;white-space:nowrap}
.dsws_button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsws_button svg{flex:none}
.dsws_trigger{position:fixed;z-index:2147483000;width:380px;max-width:calc(100vw - 16px);box-sizing:border-box;background:var(--dsw-specific-tip);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.16);overflow:hidden;display:flex;flex-direction:column;font-family:Inter,var(--dsw-font-family)}
.dsws_toolrow{display:flex;align-items:center;gap:8px;padding:10px 10px 0}
.dsws_mode{display:inline-flex;align-items:center;gap:2px;flex:none;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;padding:2px}
.dsws_modeBtn{height:24px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;padding:0 8px;font-size:12px;font-weight:500;line-height:20px}
.dsws_modeBtn:hover{color:var(--dsw-alias-label-primary)}
.dsws_modeBtnActive{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dsws_search{flex:auto;min-width:0;height:30px;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:0 10px;font:inherit;font-size:13px;line-height:20px}
.dsws_search:focus{border-color:var(--dsw-alias-state-business-primary)}
.dsws_search::placeholder{color:var(--dsw-alias-label-caption)}
.dsws_chips{display:flex;align-items:center;gap:6px;padding:8px 10px 0;flex:none}
.dsws_chip{height:24px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:999px;padding:0 10px;font-size:12px;font-weight:500;line-height:22px;white-space:nowrap}
.dsws_chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsws_chipActive{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}
.dsws_list{max-height:min(50vh,420px);overflow-y:auto;margin:8px 0 0;padding:0 6px 8px;list-style:none}
.dsws_row{box-sizing:border-box;border-radius:8px;width:100%;padding:7px 8px;cursor:pointer;text-align:left;border:none;background:transparent;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:2px;min-width:0}
.dsws_row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsws_rowTitle{display:flex;align-items:center;gap:8px;min-width:0}
.dsws_titleText{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:18px}
.dsws_tag{flex:none;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;white-space:nowrap;font-variant-numeric:tabular-nums}
.dsws_snippet{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsws_meta{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsws_status{color:var(--dsw-alias-label-tertiary);padding:10px 8px 8px;font-size:12px;line-height:18px}
.dsws_error{color:var(--dsw-alias-state-error-primary);padding:8px;font-size:12px;line-height:18px}
.dsws_empty{color:var(--dsw-alias-label-tertiary);padding:10px 8px 8px;font-size:12px;line-height:18px}
.dsws_backdrop{position:fixed;inset:0;z-index:2147482999;background:transparent}
.dsws_setRoot{display:flex;flex-direction:column;width:100%}
.dsws_setRow{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsws_setRow:last-child{border-bottom:none}
.dsws_setText{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.dsws_setTitle{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dsws_setDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsws_switch{position:relative;width:40px;height:22px;flex:none}
.dsws_switch>input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer}
.dsws_switch>input:disabled{cursor:not-allowed}
.dsws_switchTrack{position:absolute;inset:0;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:11px;transition:background .15s ease,border-color .15s ease;pointer-events:none}
.dsws_switch>input:checked+.dsws_switchTrack{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.dsws_switchThumb{position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .15s ease}
.dsws_switch>input:checked+.dsws_switchTrack>.dsws_switchThumb{transform:translateX(18px)}
.dsws_seg{display:inline-flex;align-items:center;gap:2px;background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;padding:2px;flex:none}
.dsws_segBtn{height:24px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;padding:0 10px;font-size:12px;font-weight:500;line-height:20px}
.dsws_segBtn:hover{color:var(--dsw-alias-label-primary)}
.dsws_segBtn:disabled{cursor:not-allowed;opacity:.5}
.dsws_segBtnActive{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.08)}
`;
		/** Inject the plugin stylesheet once per activation (removed on disposal). */
		function injectStyles() {
			if (typeof document === "undefined") return () => {};
			if (document.querySelector("style[data-plugin-css=\"dsw-session-search-toggle/styles\"]") !== null) return () => {};
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-search-toggle";
			tag.dataset.pluginCss = "dsw-session-search-toggle/styles";
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => {
				if (tag.parentNode !== null) tag.parentNode.removeChild(tag);
			};
		}
		/** ------------------------------------------------------------------ settings row */
		/** The General settings row: enable the plugin and pick the panel default mode. */
		function SwitchSettingsRow(props) {
			const enabled = props.useStore((state) => state.enabled);
			const defaultMode = props.useStore((state) => state.defaultMode);
			const writable = props.useStore((state) => state.writable);
			const unavailable = props.useStore((state) => state.unavailable);
			const children = [];
			if (unavailable) {
				children.push((0, react.createElement)("div", {
					key: "unavailable",
					className: "dsws_setRow"
				}, (0, react.createElement)("span", {
					key: "t",
					className: "dsws_setTitle"
				}, "会话搜索设置不可用：Host 未挂载 settings 命名空间。")));
				return (0, react.createElement)("div", { className: "dsws_setRoot" }, children);
			}
			children.push((0, react.createElement)("div", {
				key: "enable",
				className: "dsws_setRow"
			}, [(0, react.createElement)("div", {
				key: "text",
				className: "dsws_setText"
			}, [(0, react.createElement)("span", {
				key: "t",
				className: "dsws_setTitle"
			}, "启用会话搜索"), (0, react.createElement)("span", {
				key: "d",
				className: "dsws_setDesc"
			}, "在侧边栏底部显示\"搜索\"入口。")]), (0, react.createElement)("label", {
				key: "sw",
				className: "dsws_switch"
			}, [(0, react.createElement)("input", {
				type: "checkbox",
				checked: enabled,
				disabled: !writable,
				onChange: (e) => props.setEnabled(e.target.checked)
			}), (0, react.createElement)("span", {
				key: "track",
				className: "dsws_switchTrack"
			}, (0, react.createElement)("span", { className: "dsws_switchThumb" }))])]));
			children.push((0, react.createElement)("div", {
				key: "mode",
				className: "dsws_setRow"
			}, [(0, react.createElement)("div", {
				key: "text",
				className: "dsws_setText"
			}, [(0, react.createElement)("span", {
				key: "t",
				className: "dsws_setTitle"
			}, "默认搜索模式"), (0, react.createElement)("span", {
				key: "d",
				className: "dsws_setDesc"
			}, "面板打开时默认进入标题搜索还是内容搜索。")]), (0, react.createElement)("div", {
				key: "seg",
				className: "dsws_seg",
				role: "group",
				"aria-label": "默认搜索模式"
			}, [["title", "content"].map((mode) => (0, react.createElement)("button", {
				key: mode,
				type: "button",
				className: `dsws_segBtn${defaultMode === mode ? " dsws_segBtnActive" : ""}`,
				"aria-pressed": defaultMode === mode,
				disabled: !writable,
				onClick: () => {
					props.setDefaultMode(mode);
				}
			}, mode === "title" ? "标题" : "内容"))])]));
			if (!writable) children.push((0, react.createElement)("div", {
				key: "ro",
				className: "dsws_setDesc"
			}, "当前为只读（Host 未接受写入）。"));
			return (0, react.createElement)("div", { className: "dsws_setRoot" }, children);
		}
		/** ------------------------------------------------------------------ plugin */
		/** Services required before mounting: the slot registry, sessions, and settings scope. */
		const inject = ["slots"];
		/**
		* Client plugin body: inject the stylesheet and register the footer entry
		* plus the General settings row.
		* @param ctx - client plugin context (slots, sessions, settingsScope).
		*/
		function apply(ctx) {
			ctx.effect(() => injectStyles(), "dsh-session-search-toggle: stylesheet");
			const slots = ctx.get("slots");
			if (slots === void 0) return;
			const sessions = ctx.get("sessions");
			sessions === void 0 || sessions.open;
			const settingsScope = ctx.get("settingsScope");
			if (settingsScope !== void 0) {
				const scope = settingsScope.bind({ namespace: SWITCH_SEARCH_SETTINGS_NAMESPACE });
				let bound;
				const push = (snap) => {
					bound?.sync(snap);
				};
				slots.inject("settings.general.item", () => slots.register({
					name: "settings.general.item",
					id: "dsh-session-search-toggle",
					key: SWITCH_SEARCH_SETTINGS_NAMESPACE,
					order: 100,
					store: switchSearchStore,
					inject: (actions) => {
						bound = actions;
						push(scope.getSnapshot());
						return {
							setEnabled: (value) => void scope.set("enabled", value),
							setDefaultMode: (value) => void scope.set("defaultMode", value)
						};
					}
				}, SwitchSettingsRow), "dsh-session-search-toggle: general settings row");
				ctx.effect(() => scope.subscribe(() => push(scope.getSnapshot())), "dsh-session-search-toggle: settings watch");
			}
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.switchSearchStore = switchSearchStore;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map