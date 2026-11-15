# YuTang · 第一件实用任务（只读）：公开视频的可见评论 → 原有云端 AI → 证据限定回答

**状态：源码实验 / 尚未在用户 Windows 电脑或真实 Douyin 页面通过验收。不是一键安装包、不是新 AI、不是发布版本。**

## 为什么做这一条链路

优先打通鱼塘最小的“眼睛 → 大脑 → 答案”，而不是继续开发发布签名。用现有的专用 Edge 浏览器、既有的 `BrowserController` / `runReadOnlySourcePreflight` 和上游 `ApiAgent.runTask`；不另造模型或控制浏览器。

目前只认识已经打开的**单个公开视频页面**、当前DOM可见的最多 12 条评论、已有页面网络响应中被动捕获的最多 12 条公开评论（两者明确分开）及“官方 AI 视频总结入口是否可见”；**绝不把评论、入口或标题当作已看完视频、实际音轨或官方 AI 总结的正文**。

## 当前代码

- `tools/yutang-first-task.mjs`：将已有、锁定并验真的只读浏览器回执转成一次受控的 `douyin_status` 工具响应；仅允许这一项工具；如无可验证的证据则不启用模型。
- `tools/run-yutang-first-task.mjs`：单次 Windows 源码入口；不启动 Edge、不导航、不点击、不登录、不修改资料。默认只做 `preview_only`，必须加 `--allow-model` 且在本机环境已有 `DEEPSEEK_API_KEY` 才可调用云端。
- `tests/yutang-first-task.test.mjs` 和 `tests/run-yutang-first-task.test.mjs`：纯 Node 27 个隔离测试；包括模拟正确结果、拒绝无锁回执、无评论证据、越权工具、模型未真实读取工具却宣称完成、未授权收费等。
- `real-upstream-integration.mjs`：只用于离线集成验收的测试程序，运行原始真实 `ApiAgent` 源码，使用伪造 HTTP 响应，**不连接模型服务或用户电脑**。需要有精确上游源码及其依赖才能执行，不是公开可执行器。

## 执行边界

- 上游源码：`LockyBee/dsh-douyin-agent` 提交 `9c49833078f4b4d18b9211ef86d024e7f2e15739`，`api-agent.mjs` Git Blob `e7c3f37ad39b29a461ecef1356c86d4de6822ff1`。正式入口验证该源码文件内容哈希，不接受替换的 agent。
- 只读浏览器代码使用 `experiment/yutang-public-comment-readonly-20261115` 的既有源码。它要求专用 Edge 已有完整授权的单个公开 `/video/{id}` 标签，使用上游 `tab-api` 锁，读取后释放；并且要求 Windows 源码 checkout 本身干净、提交一致。
- 默认不会请求模型。即使启用，最多两轮模型请求、一次只读工具返回、最多 512 输出 tokens/轮；**不保证 API 计费为零**。这里只允许官方 `https://api.deepseek.com` 的 `deepseek-flash` 模型，其它路由尚未验收会阻断。
- 只读结果传给云模型的文本来自公开评论（DOM可见与已有页面响应两类严格区分）；用户不要把密码、Cookie、真实支付凭证放入指令。
- 任何完成结果都标明只分析**当前可见评论**；不能表述为完整视频理解。既有 `ApiAgent.decideWatch` 图像/音频能力以后另行衔接和实测。
- 不上传、读取或修改用户的凭据、私人资料、账号和浏览器 profile；不发评论、私信、购买、点赞、关注、提交表单或自动播放；不触发 GitHub Windows Actions。

## 仅供已具备干净上游源码的 Windows 测试执行端

在**另行授权的 Windows 源码测试环境**，已经存在专用 Edge 且在页面显示目标公开视频时，可运行：

```powershell
node tools/run-yutang-first-task.mjs --video-id 7678138050912407986 --upstream-root "C:\\path\\to\\verified-upstream-source" --instruction "总结当前可见的公开评论"
```

无 `--allow-model` 只读获取证据/预览（如仅被动网络响应有评论，会单独标记，不称为DOM视觉观察），不花 AI API 额度。只有明确批准调用云模型且环境配置了 API Key，才可以追加 `--allow-model`。**不要把密钥填到聊天消息或命令行参数里。**

这不是给当前普通用户双击运行的命令：**2026-11-15 的验收 EXE 并不包含新增源码**，且当前聊天未持有真实 Windows 专用 Edge 会话。旧版 EXE SHA-256 仍是 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`；旧 Windows 验收只能证明旧版启动/沙盒/进程清理，不证明该新功能已进入 EXE。

## 本地验证（2026-11-15）

- Node.js v22.16.0，Linux，27/27 项测试通过；依赖的只读工具位于实验分支提交 `84cee6da0bb04f347bd42104da9e41bdd6926c18`，其 94 项历史离线通过结论本次没有重测。
- 上游与实验分支源码文件由 GitHub 精确提交提取，全部与 Git Blob SHA-1 相符。
- 真正原版 `ApiAgent.runTask` 在离线伪 HTTP 响应下完成两轮模型消息、调用一次 `douyin_status` 并返回有证据的文本。**真实 API 调用数=0；真实 Douyin 页面访问数=0。**
- 仅 Linux 下运行 CLI 已正确返回 `WINDOWS_REQUIRED` 且退出码 2，未误报成功。

下一项真实里程碑：在可用的、已经启动的 Windows 专用 Edge 中读到一条**真正可见的**公开视频评论，再经明确授权的云模型一次性生成总结；输出原始只读回执和模型用量，但不自动发送任何操作。新 EXE 是否需打包该工具，在通过源码集成后单独评估和验收。
