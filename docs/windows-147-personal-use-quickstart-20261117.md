# YuTang 1.4.7 个人自用首次启动包（2026-11-17）

目的：让用户先在自己的 Windows 11 电脑上尝试启动已验收的 YuTang 1.4.7 便携版。不做公开销售或分发，不购买代码签名证书，不开启自动更新。

## 1. 固定候选身份

- 产品：YuTang 1.4.7
- EXE：`Dafeiyu-Douyin-API-1.4.7-win-x64.exe`
- 大小：`125446071` bytes
- **EXE SHA-256：`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`**
- 原始 ZIP：`125575315` bytes
- 原始 ZIP SHA-256：`718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`
- 来源构建：Run `43541915930` / Artifact `14092434238`
- Windows 2025 同一候选网页实测：Run `43643545361`
- Windows 2022 同一候选网页交叉实测：Run `43927596418`

当前交付 ZIP 为本地生成的个人使用启动包，SHA-256：
`4b5c09a21dcf90c286cfe2b6f1991f3027ef7c0b595be885ee41d3c59673a961`。
该 ZIP 只增加说明、摘要和一个校验后启动脚本；其中 EXE 字节保持原始候选不变。

## 2. 交付包内容

- 原始 EXE：未修改。
- `START-YuTang.cmd`：使用 Windows `certutil` 检查 EXE 大小和 SHA-256；匹配后再由用户按 Y 确认启动。不会申请管理员权限、不会修改系统安全配置、不会设置 Defender 排除项。
- `README-个人使用.txt`：首次启动、模型配置、隐私数据位置和安全边界。
- `SHA256SUMS.txt` 与 `ACCEPTANCE-RECEIPT.txt`：候选身份及验收摘要。

**注意：** CMD 启动脚本已经在交付包中静态复核，但没有在真实 Windows 11 电脑上执行；不能把脚本静态检查写成 Windows 本机启动通过。

## 3. 首次启动范围

1. 将整个 ZIP 解压到固定目录，保留 EXE 和 CMD 同目录。
2. 双击 `START-YuTang.cmd`；它先检查大小和 SHA-256，核对通过后询问是否启动。
3. 程序窗口出现后点击“打开抖音”；专用 Microsoft Edge 使用独立资料目录。登录和验证码由用户本人完成。
4. 无 API Key 时可先验证程序和专用浏览器启动；AI 任务需要用户自行提供模型 API Key。包内没有 Key。
5. 首次先关闭自动观看和好友互动总开关；公开评论保持关闭。不选联系人、不启用自动分享。先验证手动打开浏览器和手动任务。
6. 如需使用 DeepSeek API，默认接口为 `https://api.deepseek.com`、默认模型为 `deepseek-flash`；也可由用户在界面配置其他兼容服务商。Key 不要发给 ChatGPT。

## 4. 本机数据位置

- 软件设置：`%APPDATA%\DafeiyuDouyinAPI`
- YuTang 隔离状态、记忆和运行位置：`%USERPROFILE%\.yutang-observer-isolated`
- 专用 Edge profile：`%USERPROFILE%\.yutang-observer-isolated\cli-profile`

不要通过删除这些目录处理启动问题；它们可能包含登录会话、用户设置、记忆和诊断资料。

## 5. 准确验收边界

已通过的仅是云端 Windows 2022 / 2025 上同一 EXE 的一次公开首页加载、Renderer 沙盒、Network Service AppContainer + Low Integrity、CDP loopback 和进程清理。

仍待用户电脑实测：
- Windows 11 实际启动和退出。
- 用户本机专用 Edge 登录及真实网页操作。
- 实际模型 API 配置与模型调用。
- 视频持续播放、画面理解和音频理解。
- 任何评论、消息、分享或自动观看功能。

EXE 的 Authenticode 为 `NotSigned`。自动更新因缺少真实 Ed25519 公钥和 Authenticode Publisher thumbprint 而保持 fail-closed（安全关闭）。此为个人自用候选，不是正式发布包。

如果 Windows 显示 SmartScreen 或 Smart App Control 拦截，不要关闭安全保护或添加排除项；先停止并保存完整提示截图，单独判断阻塞类型。

## 6. 项目边界

- 只做个人自用启动准备。
- 不购买证书、不签名、不改 EXE。
- 不修改 `main`。
- 不创建正式 Release。
- 不运行新的 Windows Actions。
- 不把云端验收冒充用户本机验收。
