# dsh-switch-search

DSH web 侧边栏会话搜索增强插件：在侧边栏底部新增 **"搜索"** 入口，浮层面板内提供 **标题搜索 ↔ 内容搜索** 一键切换。

- **标题模式**：列出全部会话（标题 + 工作目录 + 时间），按标题/目录子串实时过滤。
- **内容模式**：FTS5 全文搜索会话消息内容，结果按**会话聚合**——每行显示该会话的**标题**和**最强命中片段**，点击即打开对应会话。

## 功能

| 模式 | 数据源 | 结果形态 |
|---|---|---|
| 标题 | Host `list-sessions`（`sessionQuery.listSessions` + `readTitleSnapshots`） | 会话标题 + 工作目录 + 时间 |
| 内容 | Host `content-search`（`sessionQuery.searchSessions` FTS5，当前 surface 的 user/assistant 消息） | 会话标题 + 最强命中片段 + 类型标签 |

- 内容搜索走 DSH 自带的 SQLite FTS5 索引，覆盖**未加载进窗口的历史/持久化会话**（live-preferred corpus）。
- 浮层面板 portalled 到 `document.body`，不受侧边栏裁剪影响；点击结果打开会话并自动关闭。
- `Esc` / 点击面板外关闭。

## 安装

**前置**：已装好 DSH（`dsh web` 能正常运行），且 `sessionQuery` 服务可用（默认 profile 即挂载 SQLite FTS5 索引）。

```bash
# 1. 安装插件
dsh plugin --profile web add dsh-switch-search@latest

# 2. 自动重启服务生效
bash ~/.dsh/profiles/web/node_modules/dsh-switch-search/restart-dsh-web.sh
```

装完侧边栏底部出现 **"搜索"** 按钮，点击展开带切换的面板。

### 从源码安装 / 开发调试

```bash
git clone https://github.com/your-name/dsh-switch-search.git ~/Code/dsh-switch-search
cd ~/Code/dsh-switch-search && pnpm install && pnpm build

# 编辑 ~/.dsh/profiles/web/package.json 的 dependencies：
#   "dsh-switch-search": "link:<克隆目录绝对路径>"
# 追加挂载行到 ~/.dsh/profiles/web/cordis.patch.yml：
#   - insert:
#       - id: dsh-switch-search
#         name: 'dsh-switch-search'
cd ~/.dsh/profiles/web && pnpm install
bash ~/Code/dsh-switch-search/restart-dsh-web.sh
```

**更新**：`git pull && pnpm install && pnpm build` → `bash ~/Code/dsh-switch-search/restart-dsh-web.sh`。

## 实现说明

- **Host 半**（`src/index.ts`）注册 fenced HTTP 路由 `/switch-search/api`（`list-sessions` / `content-search`），浏览器信任围栏与 DSH `/api` 网关一致（loopback Host 或 trustedHosts，拒绝 cross-site）。
- **Client 半**（`src/client/index.ts`）注册 `sidebar.footer.action`（slot list，`order: 10`），渲染搜索入口 + portalled 浮层面板。
- 数据全部通过 `sessionQuery` 服务（live-preferred 语料库），不改 DSH 本体、不建派生库。
- `restart-dsh-web.sh` 随包分发（与 dsh-history 同款一键重启脚本）。

## License

MIT
