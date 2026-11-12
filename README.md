# dsh-token-slime

> 养在输入框下方的一只小史莱姆 · DeepSeek Harness 插件

它吃掉模型在当前会话里**写出来的 token**（`outputTokens`），吃饱就长大，够了就分裂，
按**工具构成**长出头饰，每次**上下文压缩**蜕一层壳留下年轮；右侧栏还有一只汇总了
所有会话的**总族群**。

## English

A slime lives under the composer and eats the **output tokens** the agent writes in the current session. It grows between meals, splits into a colony, and wears a headpiece derived from the session's **tool mix** (hard hat for shell/code, safari hat for web, mortarboard for documents, glasses for reading). Every **context compaction** grows a ring on its body and sheds a shell. A right-sidebar tab totals the colony across all stored sessions.

Everything is derived from projections the Harness already computes (`tokenUsage`, `contextPressure`, plus this plugin's own `slime` projection). It adds no prompt, no tool, no model call and no session writes, so the pet is a pure function of the session log.

```
       ╭─ 小黏  第 2 代 ─╮
      (◕‿◕)  ▓▓▓▓▓░░░░░      ← 戴工装帽（bash 最多）
       ╰─── +128 ───────╯        身子上的圈 = 年轮 = 压缩次数
```

## 玩法（v0.2）

| 机制 | 规则 |
| --- | --- |
| 吃饭 | 每个 `assistant/message` 的 `outputTokens` 都算一口；面板里的 `+N` 是刚刚吃掉的一口 |
| 生长 | 体型随「距离下一次分裂的进度」线性长大，分裂瞬间缩回小只 |
| 分裂 | 第 `g` 代需要 `4000 × 1.7^g` 个 output token：4k → 6.8k → 11.6k → 19.6k …，最多 9 代 |
| **物种（工具）** | 按 `tool/call` 分布：bash/写文件多 → **工装种**（安全帽）；web 多 → **探险种**（探险帽）；docx/pptx/xlsx/present 多 → **文书种**（学士帽）；read/glob/grep 多 → **学者种**（圆眼镜） |
| 物种（兜底） | 没调用过可分类工具时按缓存命中率：苔藓种（≥72%）→ 草叶种 → 黏土种 → 熔岩种（<20%） |
| **年轮** | 每次 `compaction/start` 身体上多一圈年轮，并蜕下一层壳（蜕皮动画 + 「蜕皮！」提示） |
| 特性 | 食腐（缓存 ≥60%）、话痨（output 占比 ≥10%）、结晶（新写缓存 ≥25%） |
| 蛋 | 会话还没有任何 token 时，它是一颗会轻轻摇晃的蛋 |
| **总族群** | 输入框下方点开图鉴 →「查看总族群」；或直接打开右侧栏的「史莱姆族群」页签。汇总所有会话的食物、世代、年轮、品种比例与最肥的会话 |

## 三个新增能力怎么实现的

### 1. 工具分布决定物种（需要 Host）

浏览器端拿不到工具名，所以 `index.js` 注册了一个**会话投影** `slime`：

```js
key: 'slime', stateVersion: 1,
stateSchema / init / apply,           // tool/call → 分类计数，compaction/start → 年轮，assistant/message → 食物
wire: { summary: false, view, viewSchema }   // 浏览器用 useProjection('slime') 读取
```

分类规则（`categoryOfTool`，两端各有一份、测试保证一致）：

| 分类 | 工具名模式 |
| --- | --- |
| engineer | `run_code` `bash` `pwsh` `write` `edit` `str_replace*` `apply_patch` `workflow` `ralph` `jobs` `plugin_manager` |
| explorer | `web_search` `web_fetch` `fetch` `browse` |
| scribe | `docx` `pptx` `xlsx` `pdf` `office` `present` `document` |
| scholar | `read` `glob` `grep` `ls` `find` `skill` `session_*` `workspace*` |
| other | 其余（子代理、todo、schedule…） |

`speciesOfTools` 取计数最大的分类（同分按 engineer → explorer → scribe → scholar 顺序稳定取舍）；
一个分类都没有时返回 `null`，客户端回退到 token 口味物种。

### 2. 跨会话总族群

`GET /dsh-token-slime/colony`（`webServer.register`）汇总：

- **活会话**：用投影 handle 的 `handle.stateOf(session)` 直接读折叠状态，标题取 `title` 投影；
- **历史会话**：`sessionPersistence.list()` 列出全部已存会话，经
  `sessionProjectionCache.cachedSnapshot(header, ['title','tokenUsage','slime'])` 零 I/O 读取检查点。
  历史会话没有 `slime` 行（插件刚启用），就退回到已存储的 `tokenUsage` 得到食物量；
  工具统计与年轮从插件启用后开始累计（面板底部有说明）。
- 结果是 8 秒短缓存，面板每 10 秒轮询一次；右侧栏 tab 通过
  `sidebarRightTabs.register` + `sidebar.right.pane.tab` 注册，`sidebarRight.openTab(kind)` 打开。

### 3. 压缩蜕皮

同一份 `slime` 投影统计 `compaction/start`。客户端：
- 年轮画在身体上（最多 6 圈），面板显示真实总数（`年轮 · N 圈`）；
- 压缩数增加时弹「蜕皮！」并让一层半透明壳飞出（`MoltShell`，CSS `tsl-molt` 动画）；
- 重新打开会话时按历史压缩数静态重绘年轮，不会误触发蜕皮提示。

## 为什么它不会「偷偷烧钱」

- **零模型调用**：不新增提示词、工具、schema，也不请求模型；
- **零会话写入**：不往会话日志里写任何东西（投影只读日志）；
- **完全可复现**：所有状态都由会话日志的投影推导——重新打开、换设备、重放日志，
  都是同一只史莱姆、同一个族群；
- 只有一个本机 HTTP 路由用于汇总面板，数据不出机器。

## 安装 / 卸载

三种方式：

- **市场**：在 dsh-market 里搜索 `dsh-token-slime`（或 `Token slime`）一键安装；
- **GitHub 源码**：`dsh plugin --profile <profile> add github:ruaibeite/dsh-token-slime`；
- **本地目录**：`plugin_manager: install_bundle target=/path/to/dsh-token-slime`。

插件行由包内 `cordis.patch.yml` 注入，不需要手改 profile 的 patch 层。
卸载：`plugin_manager: remove_bundle`（或市场里卸载），然后重启桌面端。

## 验证

```sh
cd dsh-token-slime
npm test        # 17 个 Host 测试 + 19 个渲染测试
```

- `test/host.mjs`：工具分类映射、投影 fold（含重试替换语义、坏存档修复）、
  世代阈值、聚合、以及用假 ctx 驱动 `apply` + 路由的整链路（活会话/缓存/未落盘会话、
  HEAD/405、持久化失败降级、短缓存）；
- `test/render.mjs`：自带迷你 React（hooks + 异步 effect + 多 pass），真实执行组件，
  覆盖蛋/成体、四种工具物种与兜底物种、年轮数量、压缩增量触发蜕皮提示、
  缺投影降级、locale 覆盖、英文回退、右侧栏 tab 注册与打开、总族群面板渲染与错误态。

## 已知限制

- 历史会话的工具统计与年轮无法回溯：`slime` 投影是插件启用后才注册的新 key，
  缓存里没有旧记录；食物量可以用已有的 `tokenUsage` 检查点补齐；
- 总族群按「已持久化 + 当前活会话」统计；从未落盘的会话在重启后会消失；
- 主题色只依赖 `--dsw-alias-*` 主题变量，变量缺失时回退到中性色。

## 开发备注

- 调整分裂节奏改 `client.js` 顶部 `FIRST_SPLIT` / `GROWTH` / `MAX_GEN`
  （`index.js` 里有同名常量用于聚合，测试会校验两端一致）；
- 新增工具分类时同时改 `index.js` 与 `client.js` 的 `categoryOfTool`，`npm test` 会抓不一致；
- 修改客户端后需要重新安装并刷新页面；修改 Host 端（`index.js`）在已安装状态下
  需要重启桌面端才会加载新的模块代。

## License

MIT