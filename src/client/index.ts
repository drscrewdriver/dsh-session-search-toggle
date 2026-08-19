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

/** ------------------------------------------------------------------ types */

/** The client slots service face (structural subset used here). */
interface SwitchSlotsService {
  inject(key: string, callback: () => () => void): () => void
  register(options: {
    name: string
    id?: string
    order?: number
  }, component: (props: SwitchFooterProps) => ReactElement): () => void
}

/** The client sessions service face: open a session from a search result. */
interface SwitchSessionsService {
  open(id: string): void
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

/** The footer-action owner share (structural subset). */
interface SwitchFooterProps {
  wide: boolean
}

declare module 'cordis' {
  interface Context {
    slots: SwitchSlotsService
    sessions?: SwitchSessionsService
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
  const [sessions, setSessions] = useState<HostSessionItem[] | null>(null)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [content, setContent] = useState<{ query: string; status: 'idle' | 'loading' | 'ready' | 'error'; items: HostContentHit[]; error?: string }>({
    query: '',
    status: 'idle',
    items: [],
  })
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const normalized = query.trim().toLowerCase()

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
    setContent(prev => ({ query: normalized, status: 'loading', items: prev.query === normalized ? prev.items : [] }))
    const timer = window.setTimeout(() => {
      callHost<HostContentHit>('content-search', { query: normalized, limit: 50 }).then((res) => {
        if (cancelled) return
        setContent({ query: normalized, status: res.ok ? 'ready' : 'error', items: res.ok ? res.items : [], error: res.ok ? undefined : (res.error ?? '搜索失败') })
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mode, normalized])

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
  const activeContent = content.query === normalized ? content : { query: normalized, status: 'loading' as const, items: [] }
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
    if (activeContent.status === 'loading') {
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

/** ------------------------------------------------------------------ plugin */

/** Services required before mounting: the slot registry. */
export const inject = ['slots']

/**
 * Client plugin body: inject the stylesheet and register the footer entry.
 * @param ctx - client plugin context (slots, sessions).
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
}
