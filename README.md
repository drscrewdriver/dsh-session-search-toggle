# dsh-switch-search

[English](README.en.md) | 中文

DSH web 侧边栏会话搜索增强插件：在侧边栏底部新增 **"搜索"** 入口，浮层面板内提供 **标题搜索 ↔ 内容搜索** 一键切换，并按内容类型筛选。

## 分支与功能

本仓库维护两个分支，满足不同阶段需求：

| 分支 | 功能 | 适合 |
|---|---|---|
| `master` | 标题/内容双模式切换 + 内容按会话聚合展示（标题 + 命中片段） | 稳定基线 |
| `feat/type-filter-search` | 在 master 基础上新增：内容类型筛选（全部/用户/回复/工具）+ 设置页索引进口（借鉴 thinking-levels 配置模式 + 索引可用性探测） | 探索类型筛选与索引入口 |

两条分支均包含完整的 `lib/` 构建产物，可直接安装。

## 功能

### 标题模式
- 列出全部会话（标题 + 工作目录 + 时间），按标题/目录子串实时过滤。
- 数据源：Host `list-sessions`（`sessionQuery.listSessions` + `readTitleSnapshots`）。

### 内容模式（master + feat 分支）
- FTS5 全文搜索会话消息内容，结果按**会话聚合**——每行显示该会话的**标题**和**最强命中片段**，点击即打开对应会话。
- 数据源：Host `content-search`（`sessionQuery.searchSessions` FTS5）。

### 类型筛选（仅 feat/type-filter-search）
- 内容模式新增筛选 chip：**全部 / 用户 / 回复 / 工具**。
- `tool` 档放开 `tool/call` 与 `tool/result` 事件进入 FTS5 结果，并显示"工具调用/工具结果"标签。

### 设置页索引进口（仅 feat/type-filter-search）
- 设置 → 通用新增 **"会话搜索"** 配置行（借鉴 dsh-thinking-levels 的 `settings.general.item` 模式）：
  - 启用开关
  - 默认搜索模式（标题 / 内容）
- Host 侧 `search-status` 探测 `sessionQuery` 可用性，内容模式在索引未启用时给出具体配置指引。

## ⚠️ 前置：启用内容搜索索引

DSH 官方 bundle **默认关闭全文索引**（`session-query-sqlite` 的 `openAt: never`，见
`deepseek-harness/packages/bundle/web-app/cordis.patch.yml`）。内容搜索要工作，需在你的
profile 的 `cordis.patch.yml` 或 overlay 中覆盖：

```yaml
- id: session-query-sqlite
  config:
    path: /path/to/durable/session-search.db   # 可留 :memory:（重启后重建）
    openAt: first-search                       # 或 startup
```

然后重启 DSH web。不开启时，插件内容模式会显示配置指引而非裸报错。

## 安装（GitHub 直装）

**前置**：已装好 DSH（`dsh web` 能正常运行），并已按上文启用内容搜索索引。

> 仓库已提交 `lib/` 构建产物（`.gitignore` 不再忽略），从 git 安装**无需任何额外 flag 或本地构建**——标准 `add` 命令即可，`lib/` 会随仓库拉取。

### 稳定版本（推荐 release-v0.1.0）

```bash
dsh plugin --profile web add github:drscrewdriver/dsh-switch-search#release-v0.1.0
```

### 其他分支

```bash
# 稳定基线
dsh plugin --profile web add github:drscrewdriver/dsh-switch-search#master

# 最新开发（类型筛选 + 设置页索引进口）
dsh plugin --profile web add github:drscrewdriver/dsh-switch-search#feat/type-filter-search
```

### 重启生效

```bash
bash ~/.dsh/profiles/web/node_modules/dsh-switch-search/restart-dsh-web.sh
```

装完侧边栏底部出现 **"搜索"** 按钮；设置 → 通用出现 **"会话搜索"** 配置行（feat/类型筛选/索引进口 分支）。

## 从源码安装 / 开发调试

```bash
git clone git@github.com:drscrewdriver/dsh-switch-search.git ~/Code/dsh-switch-search
cd ~/Code/dsh-switch-search && git checkout release-v0.1.0   # 或 master / feat/type-filter-search
pnpm install && pnpm build

# 编辑 ~/.dsh/profiles/web/package.json 的 dependencies：
#   "dsh-switch-search": "link:<克隆目录绝对路径>"
# 追加挂载行到 ~/.dsh/profiles/web/cordis.patch.yml：
#   - insert:
#       - id: dsh-switch-search
#         name: 'dsh-switch-search'
cd ~/.dsh/profiles/web && pnpm install
bash ~/Code/dsh-switch-search/restart-dsh-web.sh
```

**更新**：`git pull && pnpm install && pnpm build` → `bash ~/Code/dsh-switch-search/restart-dsh-web.sh`。若用 GitHub 直装，重新 `dsh plugin add ...#<ref>` 即可。

## 分支说明

| 分支 | 用途 |
|---|---|
| `master` | 稳定基线（标题/内容切换） |
| `feat/type-filter-search` | 开发分支（类型筛选 + 设置页索引进口 + 索引可用性探测） |
| `release-v0.1.0` | 从已验收的开发状态派生的**稳定可装版本**，含 lib/ 构建产物 |

## 实现说明

- **Host 半**（`src/index.ts`）注册 fenced HTTP 路由 `/switch-search/api`（`list-sessions` / `content-search` / `search-status`），浏览器信任围栏与 DSH `/api` 网关一致（loopback Host 或 trustedHosts，拒绝 cross-site）。
- **Client 半**（`src/client/index.ts`）注册 `sidebar.footer.action`（搜索入口）+ `settings.general.item`（设置行，feat 分支）。
- 数据全部通过 `sessionQuery` 服务（live-preferred 语料库），不改 DSH 本体、不建派生库。
- 配置模式借鉴 dsh-thinking-levels：host 半 `installSettingsSection` + schemastery `Config`，client 半 `defineStore` + `settingsScope.bind`，共享纯模块 `src/config.ts`（保持 client bundle 无 schemastery）。
- `restart-dsh-web.sh` 随包分发（与 dsh-history 同款一键重启脚本）。

## License

MIT
