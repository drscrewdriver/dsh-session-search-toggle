# dsh-switch-search

English | [中文](README.md)

A DSH web sidebar session-search enhancement plugin: adds a **"Search"** entry at the sidebar footer with a floating panel that toggles between **title search ↔ content search**, plus content-type filtering.

## Branches & features

This repository maintains two branches for different stages:

| Branch | Features | Best for |
|---|---|---|
| `master` | Title/content dual-mode toggle + content grouped by session (title + snippet) | Stable baseline |
| `feat/type-filter-search` | Adds on top of master: content-type filter (all/user/reply/tool) + settings-page index entry (thinking-levels-style config + index availability probe) | Exploring type filtering & index entry |

Both branches ship the built `lib/` artifacts, so they can be installed directly.

## Features

### Title mode
- Lists every session (title + cwd + time), filtered live by title/cwd substring.
- Data source: Host `list-sessions` (`sessionQuery.listSessions` + `readTitleSnapshots`).

### Content mode (master + feat branches)
- FTS5 full-text search over session message content, grouped **by session** — each row shows the session **title** and its **strongest snippet**; clicking opens that session.
- Data source: Host `content-search` (`sessionQuery.searchSessions` FTS5).

### Type filter (feat/type-filter-search only)
- New filter chips in content mode: **All / User / Reply / Tool**.
- The `tool` bucket opens `tool/call` and `tool/result` events into FTS5 results, labeled "tool call" / "tool result".

### Settings index entry (feat/type-filter-search only)
- Settings → General gains a **"Session Search"** row (modeled on dsh-thinking-levels' `settings.general.item` pattern):
  - enable toggle
  - default search mode (title / content)
- Host-side `search-status` probes `sessionQuery` availability; content mode shows concrete setup guidance when the index is disabled.

## ⚠️ Prerequisite: enable the content-search index

The official DSH bundle ships with **full-text search disabled by default**
(`session-query-sqlite` has `openAt: never`; see
`deepseek-harness/packages/bundle/web-app/cordis.patch.yml`). For content search to work,
override it in your profile's `cordis.patch.yml` or an overlay:

```yaml
- id: session-query-sqlite
  config:
    path: /path/to/durable/session-search.db   # or keep :memory: (rebuilt on restart)
    openAt: first-search                       # or startup
```

Then restart DSH web. If you don't enable it, the plugin's content mode shows setup guidance
instead of a bare error.

## Install (direct from GitHub)

**Prereq**: DSH installed (`dsh web` runs) and the content-search index enabled as above.

### Stable baseline (master)

```bash
dsh plugin --profile web add github:drscrewdriver/dsh-switch-search#master
```

### Type filter + index entry (feat/type-filter-search)

```bash
dsh plugin --profile web add github:drscrewdriver/dsh-switch-search#feat/type-filter-search
```

> Uses the committed `lib/` build artifacts directly; no local build needed.

### Restart to apply

```bash
bash ~/.dsh/profiles/web/node_modules/dsh-switch-search/restart-dsh-web.sh
```

After install a **"Search"** button appears at the sidebar footer; Settings → General gains
the **"Session Search"** row (feat branch).

## From source / development

```bash
git clone git@github.com:drscrewdriver/dsh-switch-search.git ~/Code/dsh-switch-search
cd ~/Code/dsh-switch-search && git checkout feat/type-filter-search   # or master
pnpm install && pnpm build

# Edit ~/.dsh/profiles/web/package.json dependencies:
#   "dsh-switch-search": "link:<absolute clone path>"
# Append a mount line to ~/.dsh/profiles/web/cordis.patch.yml:
#   - insert:
#       - id: dsh-switch-search
#         name: 'dsh-switch-search'
cd ~/.dsh/profiles/web && pnpm install
bash ~/Code/dsh-switch-search/restart-dsh-web.sh
```

**Update**: `git pull && pnpm install && pnpm build` → `bash ~/Code/dsh-switch-search/restart-dsh-web.sh`.

## Implementation notes

- **Host half** (`src/index.ts`) registers the fenced HTTP route `/switch-search/api`
  (`list-sessions` / `content-search` / `search-status`), with the same browser-trust fence
  as the DSH `/api` gateway (loopback Host or trustedHosts; cross-site refused).
- **Client half** (`src/client/index.ts`) registers `sidebar.footer.action` (search entry)
  plus `settings.general.item` (settings row, feat branch).
- All data goes through the `sessionQuery` service (live-preferred corpus); no DSH core
  changes, no derived database.
- Config pattern follows dsh-thinking-levels: host half `installSettingsSection` +
  schemastery `Config`; client half `defineStore` + `settingsScope.bind`; shared pure
  module `src/config.ts` (keeps schemastery out of the client bundle).
- `restart-dsh-web.sh` ships with the package (same one-click restart script as dsh-history).

## License

MIT
