/**
 * dsh-switch-search client half: a `sidebar.footer.action` entry that opens a
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
import { createElement, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { Context } from 'cordis'
import {
  defineStore,
  type SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_CONFIG, SWITCH_SEARCH_SETTINGS_NAMESPACE, type SwitchSearchConfig } from '../config.ts'

/** ------------------------------------------------------------------ types */

/** The client slots service face (structural subset used here). */
interface SwitchSlotsService {
  inject(key: string, callback: () => () => void, label?: string): () => void
  register(options: {
    name: string
    id?: string
    key?: string
    order?: number
    store?: unknown
    locale?: string
    inject?: (actions: unknown) => unknown
  }, component: unknown): () => void
}

/** The client sessions service face: open a session from a search result. */
interface SwitchSessionsService {
  open(id: string): void
}

/** The client settings-scope service face (structural subset). */
interface SwitchSettingsScope<T> {
  bind<T>(spec: { namespace: string }): SwitchScopeLike<T>
}
interface SwitchScopeLike<T> {
  getSnapshot(): SettingsScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}

/** One session listed for the title-search corpus. */
interface HostSessionItem {
  sessionId: string
  title: string
  cwd: string
  updatedAt: number
}

/** One content-search hit (session-level: title + strongest snippet). */
interface HostContentHit {
  sessionId: string
  title: string
  snippet: string
  seq: number
  type: string
  time: number
}

/** Coarse content-type filter carried to the host content-search. */
type ContentType = 'all' | 'user' | 'reply' | 'tool'

/** The coarse filter chips rendered above content results. */
const CONTENT_TYPE_CHIPS: readonly { id: ContentType; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'user', label: '用户' },
  { id: 'reply', label: '回复' },
  { id: 'tool', label: '工具' },
]

/** The footer-action owner share (structural subset). */
interface SwitchFooterProps {
  wide: boolean
}

/** Local mirror of the settings namespace the General row edits. */
export interface SwitchSearchSettingsState {
  enabled: boolean
  defaultMode: SwitchSearchConfig['defaultMode']
  /** Namespace revision fencing the sync (skips stale snapshots). */
  revision: number
  /** Whether the Host document accepts writes. */
  writable: boolean
  /** Namespace not exposed to this client (row renders the unavailable note). */
  unavailable: boolean
}

/** Write face the settings row receives from the inject factory. */
export interface SwitchSearchSettingsInjected {
  setEnabled: (value: boolean) => void
  setDefaultMode: (value: SwitchSearchConfig['defaultMode']) => void
}

/** The settings store: mirror of the namespace section plus the write set. */
export const switchSearchStore = defineStore({
  init: (): SwitchSearchSettingsState => ({
    enabled: DEFAULT_CONFIG.enabled,
    defaultMode: DEFAULT_CONFIG.defaultMode,
    revision: -1,
    writable: false,
    unavailable: false,
  }),
  actions: {
    sync(d: SwitchSearchSettingsState, snap: SettingsScopeSnapshot<SwitchSearchConfig>): void {
      if (snap.revision !== undefined && snap.revision <= d.revision) return
      const value = snap.value as Partial<SwitchSearchConfig> | undefined
      if (value?.enabled !== undefined) d.enabled = value.enabled
      if (value?.defaultMode !== undefined) d.defaultMode = value.defaultMode
      if (snap.revision !== undefined) d.revision = snap.revision
      d.writable = snap.writable
      d.unavailable = snap.status === 'unavailable'
    },
  },
})

/** Baked store actions handed to the inject factory (the `sync` write set;
 *  the draft parameter is bound by the framework, so consumers pass only snap). */
export type SwitchSearchActions = {
  sync: (snap: SettingsScopeSnapshot<SwitchSearchConfig>) => void
}

/** The store handle type, for props derivation. */
export type SwitchSearchStore = {
  create: () => SwitchSearchSettingsState
}

declare module 'cordis' {
  interface Context {
    slots: SwitchSlotsService
    sessions?: SwitchSessionsService
    settingsScope?: SwitchSettingsScope<SwitchSearchConfig>
  }
}

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
`

/** Inject the plugin stylesheet once per activation (removed on disposal). */
function injectStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector('style[data-plugin-css="dsw-switch-search/styles"]') !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-switch-search'
  tag.dataset.pluginCss = 'dsw-switch-search/styles'
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => {
    if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
  }
}

/** ------------------------------------------------------------------ data */

const FETCH_TIMEOUT = 10000

/** POST a JSON body to a fenced switch-search API method. */
function callHost<T>(method: string, body: unknown): Promise<{ ok: boolean; items: T[]; error?: string }> {
  const controller = typeof AbortController === 'undefined' ? undefined : new AbortController()
  const timer = controller !== undefined && typeof setTimeout === 'function'
    ? setTimeout(() => { controller.abort() }, FETCH_TIMEOUT)
    : undefined
  return fetch(`/switch-search/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller?.signal,
  })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((data: unknown) => {
      const record = data as { ok?: boolean; items?: T[]; error?: string }
      if (record && record.ok === true && Array.isArray(record.items)) {
        return { ok: true, items: record.items }
      }
      return { ok: false, items: [], error: record?.error ?? '请求失败' }
    })
    .catch((err: unknown) => ({
      ok: false,
      items: [],
      error: err instanceof DOMException && err.name === 'AbortError' ? '请求超时' : String(err instanceof Error ? err.message : err),
    }))
    .finally(() => {
      if (timer !== undefined) clearTimeout(timer)
    })
}

/** ------------------------------------------------------------------ view */

/** The floating search panel. */
function SwitchPanel({
  anchor,
  onClose,
  open,
}: {
  anchor: DOMRect
  onClose: () => void
  open: (sessionId: string) => void
}): ReactElement {
  const [mode, setMode] = useState<'title' | 'content'>('title')
  const [query, setQuery] = useState('')
  const [contentType, setContentType] = useState<ContentType>('all')
  const [sessions, setSessions] = useState<HostSessionItem[] | null>(null)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [content, setContent] = useState<{ query: string; status: 'idle' | 'loading' | 'ready' | 'error'; items: HostContentHit[]; error?: string }>({
    query: '',
    status: 'idle',
    items: [],
  })
  // Content-search availability probe (the shipped DSH bundle ships openAt: never).
  const [searchStatus, setSearchStatus] = useState<{ available: boolean | null; reason?: string }>({ available: null })
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const normalized = query.trim().toLowerCase()

  // Probe the host full-text availability once on open.
  useEffect(() => {
    let cancelled = false
    callHost<{ available: boolean; reason?: string }>('search-status', {}).then((res) => {
      if (cancelled) return
      const item = res.ok ? res.items[0] : undefined
      setSearchStatus({ available: item?.available ?? false, reason: item?.reason })
    })
    return () => { cancelled = true }
  }, [])

  // Load the title-search corpus once on open.
  useEffect(() => {
    if (sessions !== null) return
    let cancelled = false
    callHost<HostSessionItem>('list-sessions', {}).then((res) => {
      if (cancelled) return
      if (res.ok) { setSessions(res.items); setSessionsError(null) }
      else setSessionsError(res.error ?? '读取会话列表失败')
    })
    return () => { cancelled = true }
  }, [sessions])

  // Content search debounces against the host route.
  useEffect(() => {
    if (mode !== 'content' || normalized === '') {
      if (mode !== 'content') setContent({ query: normalized, status: 'idle', items: [] })
      return
    }
    let cancelled = false
    const requestType: ContentType = contentType
    const requestKey = `${normalized}\u0000${requestType}`
    setContent(prev => ({ query: requestKey, status: 'loading', items: prev.query === requestKey ? prev.items : [] }))
    const timer = window.setTimeout(() => {
      callHost<HostContentHit>('content-search', { query: normalized, limit: 50, types: requestType === 'all' ? undefined : [requestType] }).then((res) => {
        if (cancelled) return
        setContent({ query: requestKey, status: res.ok ? 'ready' : 'error', items: res.ok ? res.items : [], error: res.ok ? undefined : (res.error ?? '搜索失败') })
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mode, normalized, contentType])

  // Focus the input on open; reset mode on every open.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [onClose])

  // Title-mode rows: local substring filter over the corpus.
  const titleRows = useMemo<HostSessionItem[]>(() => {
    if (sessions === null) return []
    if (normalized === '') return sessions
    return sessions.filter(item =>
      item.title.toLowerCase().includes(normalized)
      || item.cwd.toLowerCase().includes(normalized))
  }, [sessions, normalized])

  // Position the panel above the trigger, clamped to the viewport.
  const panelStyle: Record<string, string> = {
    left: `${Math.max(8, Math.min(anchor.left, window.innerWidth - 388))}px`,
    top: `${Math.max(8, anchor.top - 8)}px`,
  }

  const children: ReactElement[] = []
  if (sessionsError !== null) {
    children.push(createElement('div', { key: 'err', className: 'dsws_error' }, `读取会话列表失败：${sessionsError}`))
  }
  const contentRequestKey = `${normalized}\u0000${contentType}`
  const activeContent = content.query === contentRequestKey ? content : { query: contentRequestKey, status: 'loading' as const, items: [] }
  if (mode === 'title') {
    if (sessions === null) {
      children.push(createElement('div', { key: 'loading', className: 'dsws_status' }, '正在读取会话列表…'))
    } else if (titleRows.length === 0) {
      children.push(createElement('div', { key: 'empty', className: 'dsws_empty' }, normalized === '' ? '暂无会话' : '没有匹配的会话。'))
    } else {
      children.push(createElement('ul', {
        key: 'list',
        ref: listRef,
        className: 'dsws_list',
        role: 'listbox',
        'aria-label': '会话列表',
      }, titleRows.slice(0, 200).map(item => createElement('li', { key: item.sessionId, role: 'option' }, createElement('button', {
        type: 'button',
        className: 'dsws_row',
        onClick: () => { open(item.sessionId) },
      }, [
        createElement('span', { key: 't', className: 'dsws_rowTitle' }, [
          createElement('span', { key: 'x', className: 'dsws_titleText' }, item.title || '(未命名)'),
          createElement('span', { key: 'tag', className: 'dsws_tag' }, fmtTime(item.updatedAt)),
        ]),
        item.cwd !== '' && createElement('span', { key: 'c', className: 'dsws_meta' }, item.cwd),
      ])))))
    }
  } else {
    if (searchStatus.available === false) {
      children.push(createElement('div', {
        key: 'unavailable',
        className: 'dsws_error',
      }, searchStatus.reason === 'disabled'
        ? '内容搜索未启用：当前 DSH 配置关闭了全文索引（openAt: never）。请在 profile 的 cordis.patch.yml 中将 session-query-sqlite 的 openAt 改为 first-search 后重启。'
        : '内容搜索暂不可用：Host 未提供 sessionQuery 服务。'))
    } else if (activeContent.status === 'loading') {
      children.push(createElement('div', { key: 'loading', className: 'dsws_status' }, '正在搜索会话内容…'))
    } else if (activeContent.status === 'error') {
      children.push(createElement('div', { key: 'error', className: 'dsws_error' }, `内容搜索失败：${activeContent.error ?? '未知错误'}`))
    } else if (activeContent.items.length === 0) {
      children.push(createElement('div', { key: 'empty', className: 'dsws_empty' }, normalized === '' ? '输入内容关键词开始搜索。' : '没有匹配的内容。'))
    } else {
      children.push(createElement('ul', {
        key: 'list',
        ref: listRef,
        className: 'dsws_list',
        role: 'listbox',
        'aria-label': '内容搜索结果',
      }, activeContent.items.slice(0, 200).map(item => createElement('li', { key: item.sessionId, role: 'option' }, createElement('button', {
        type: 'button',
        className: 'dsws_row',
        onClick: () => { open(item.sessionId) },
      }, [
        createElement('span', { key: 't', className: 'dsws_rowTitle' }, [
          createElement('span', { key: 'x', className: 'dsws_titleText' }, item.title || '(未命名)'),
          createElement('span', { key: 'tag', className: 'dsws_tag' }, typeLabel(item.type)),
        ]),
        createElement('span', { key: 's', className: 'dsws_snippet' }, item.snippet || '(无文本)'),
      ])))))
    }
  }

  return createPortal(createElement('div', { key: 'switch-root' }, [
    createElement('div', { key: 'backdrop', className: 'dsws_backdrop', onClick: onClose }),
    createElement('div', { key: 'panel', className: 'dsws_trigger', style: panelStyle, role: 'dialog', 'aria-label': '会话搜索' }, [
      createElement('div', { key: 'tools', className: 'dsws_toolrow' }, [
        createElement('div', { key: 'mode', className: 'dsws_mode', role: 'group', 'aria-label': '搜索模式' }, [
          createElement('button', {
            key: 'title',
            type: 'button',
            className: `dsws_modeBtn${mode === 'title' ? ' dsws_modeBtnActive' : ''}`,
            onClick: () => { setMode('title') },
          }, '标题'),
          createElement('button', {
            key: 'content',
            type: 'button',
            className: `dsws_modeBtn${mode === 'content' ? ' dsws_modeBtnActive' : ''}`,
            onClick: () => { setMode('content') },
          }, '内容'),
        ]),
        createElement('input', {
          key: 'search',
          ref: inputRef,
          className: 'dsws_search',
          type: 'text',
          placeholder: mode === 'title' ? '搜索会话标题…' : '搜索会话内容…',
          value: query,
          onChange: (e: { target: { value: string } }) => setQuery(e.target.value),
        }),
      ]),
      mode === 'content' && createElement('div', { key: 'chips', className: 'dsws_chips', role: 'group', 'aria-label': '内容类型筛选' },
        CONTENT_TYPE_CHIPS.map(chip => createElement('button', {
          key: chip.id,
          type: 'button',
          className: `dsws_chip${contentType === chip.id ? ' dsws_chipActive' : ''}`,
          'aria-pressed': contentType === chip.id,
          onClick: () => { setContentType(chip.id) },
        }, chip.label))),
      children,
    ]),
  ]), document.body)
}

/** The footer entry: one icon button that opens the search panel. */
function SwitchFooter({
  wide,
  open,
}: SwitchFooterProps & { open: (sessionId: string) => void }): ReactElement {
  const [openPanel, setOpenPanel] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  // Keep the button mounted for its rect even while collapsed; the panel only
  // opens from the wide affordance.
  return createElement('div', { className: 'dsws_root' }, [
    createElement('button', {
      key: 'btn',
      ref: buttonRef,
      type: 'button',
      className: 'dsws_button',
      title: '会话搜索',
      'aria-label': '会话搜索（标题 / 内容切换）',
      'aria-expanded': openPanel,
      onClick: () => {
        const rect = buttonRef.current?.getBoundingClientRect()
        if (rect === undefined) return
        setAnchor(rect)
        setOpenPanel(true)
      },
    }, [searchIcon(), wide && createElement('span', { key: 'label' }, '搜索')]),
    openPanel && anchor !== null && createElement(SwitchPanel, {
      key: 'panel',
      anchor,
      onClose: () => { setOpenPanel(false) },
      open: (sessionId: string) => {
        setOpenPanel(false)
        open(sessionId)
      },
    }),
  ])
}

/** ------------------------------------------------------------------ helpers */

/** Format an epoch-ms timestamp: today → HH:mm, else YYYY-MM-DD HH:mm. */
function fmtTime(ms: number): string {
  if (!ms || typeof ms !== 'number') return ''
  try {
    const d = new Date(ms)
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const sameDay = d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate()
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    if (sameDay) return time
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`
  } catch {
    return ''
  }
}

/** Short label for a content-hit event type. */
function typeLabel(type: string): string {
  switch (type) {
    case 'user/message': return '用户'
    case 'assistant/message': return '回复'
    case 'tool/call': return '工具调用'
    case 'tool/result': return '工具结果'
    default: return type
  }
}

/** Inline search icon (stroke aligned with the product's 1.75 hairline). */
function searchIcon(): ReactElement {
  return createElement('svg', {
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true,
  }, createElement('circle', {
    cx: 7,
    cy: 7,
    r: 4.5,
    stroke: 'currentColor',
    strokeWidth: 1.75,
    fill: 'none',
  }), createElement('path', {
    d: 'M10.5 10.5 L14 14',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
  }))
}

/** ------------------------------------------------------------------ settings row */

/** The General settings row: enable the plugin and pick the panel default mode. */
function SwitchSettingsRow(props: {
  t?: unknown
  useStore: <T>(selector: (state: SwitchSearchSettingsState) => T) => T
  setEnabled: (value: boolean) => void
  setDefaultMode: (value: SwitchSearchConfig['defaultMode']) => void
}): ReactElement {
  const enabled = props.useStore((state) => state.enabled)
  const defaultMode = props.useStore((state) => state.defaultMode)
  const writable = props.useStore((state) => state.writable)
  const unavailable = props.useStore((state) => state.unavailable)
  const children: ReactElement[] = []
  if (unavailable) {
    children.push(createElement('div', {
      key: 'unavailable',
      className: 'dsws_setRow',
    }, createElement('span', { key: 't', className: 'dsws_setTitle' }, '会话搜索设置不可用：Host 未挂载 settings 命名空间。')))
    return createElement('div', { className: 'dsws_setRoot' }, children)
  }
  children.push(createElement('div', {
    key: 'enable',
    className: 'dsws_setRow',
  }, [
    createElement('div', { key: 'text', className: 'dsws_setText' }, [
      createElement('span', { key: 't', className: 'dsws_setTitle' }, '启用会话搜索'),
      createElement('span', { key: 'd', className: 'dsws_setDesc' }, '在侧边栏底部显示"搜索"入口。'),
    ]),
    createElement('label', { key: 'sw', className: 'dsws_switch' }, [
      createElement('input', {
        type: 'checkbox',
        checked: enabled,
        disabled: !writable,
        onChange: (e: { target: { checked: boolean } }) => props.setEnabled(e.target.checked),
      }),
      createElement('span', { key: 'track', className: 'dsws_switchTrack' }, createElement('span', { className: 'dsws_switchThumb' })),
    ]),
  ]))
  children.push(createElement('div', {
    key: 'mode',
    className: 'dsws_setRow',
  }, [
    createElement('div', { key: 'text', className: 'dsws_setText' }, [
      createElement('span', { key: 't', className: 'dsws_setTitle' }, '默认搜索模式'),
      createElement('span', { key: 'd', className: 'dsws_setDesc' }, '面板打开时默认进入标题搜索还是内容搜索。'),
    ]),
    createElement('div', { key: 'seg', className: 'dsws_seg', role: 'group', 'aria-label': '默认搜索模式' }, [
      (['title', 'content'] as const).map(mode => createElement('button', {
        key: mode,
        type: 'button',
        className: `dsws_segBtn${defaultMode === mode ? ' dsws_segBtnActive' : ''}`,
        'aria-pressed': defaultMode === mode,
        disabled: !writable,
        onClick: () => { props.setDefaultMode(mode) },
      }, mode === 'title' ? '标题' : '内容')),
    ]),
  ]))
  if (!writable) {
    children.push(createElement('div', { key: 'ro', className: 'dsws_setDesc' }, '当前为只读（Host 未接受写入）。'))
  }
  return createElement('div', { className: 'dsws_setRoot' }, children)
}

/** ------------------------------------------------------------------ plugin */

/** Services required before mounting: the slot registry, sessions, and settings scope. */
export const inject = ['slots']

/**
 * Client plugin body: inject the stylesheet and register the footer entry
 * plus the General settings row.
 * @param ctx - client plugin context (slots, sessions, settingsScope).
 */
export function apply(ctx: Context): void {
  ctx.effect(() => injectStyles(), 'dsh-switch-search: stylesheet')
  const slots = ctx.get('slots') as SwitchSlotsService | undefined
  if (slots === undefined) return
  const sessions = ctx.get('sessions') as SwitchSessionsService | undefined
  const open = sessions === undefined || typeof sessions.open !== 'function'
    ? (): void => {}
    : (sessionId: string): void => { sessions.open(sessionId) }

  slots.inject('sidebar.footer.action', () => slots.register(
    { name: 'sidebar.footer.action', id: 'dsh-switch-search', order: 10 },
    (props: SwitchFooterProps) => createElement(SwitchFooter, { ...props, open }),
  ))

  // The General settings row mirrors the switch-search namespace section.
  const settingsScope = ctx.get('settingsScope') as SwitchSettingsScope<SwitchSearchConfig> | undefined
  if (settingsScope !== undefined) {
    const scope = settingsScope.bind<SwitchSearchConfig>({ namespace: SWITCH_SEARCH_SETTINGS_NAMESPACE })
    let bound: SwitchSearchActions | undefined
    const push = (snap: SettingsScopeSnapshot<SwitchSearchConfig>): void => {
      bound?.sync(snap)
    }
    slots.inject('settings.general.item', () => slots.register({
      name: 'settings.general.item',
      id: 'dsh-switch-search',
      key: SWITCH_SEARCH_SETTINGS_NAMESPACE,
      order: 100,
      store: switchSearchStore,
      inject: (actions: unknown) => {
        bound = actions as SwitchSearchActions
        push(scope.getSnapshot())
        return {
          setEnabled: (value: boolean): void => void scope.set('enabled', value),
          setDefaultMode: (value: SwitchSearchConfig['defaultMode']): void => void scope.set('defaultMode', value),
        } satisfies SwitchSearchSettingsInjected
      },
    }, SwitchSettingsRow), 'dsh-switch-search: general settings row')
    ctx.effect(() => scope.subscribe(() => push(scope.getSnapshot())), 'dsh-switch-search: settings watch')
  }
}
