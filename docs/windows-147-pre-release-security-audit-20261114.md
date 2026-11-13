# YuTang 1.4.7 Windows 正式交付前安全审查

- 审查日期：2026-11-14
- 仓库：`yud78785/yutang-build`
- 本审查只读检查源码、工作流、候选回执与 Windows CI 日志；没有修改候选 EXE、没有操作用户电脑、没有签名或发布。
- 审查基线：候选构建分支 `experiment/windows-147-security-only-20261113` / `1c332d55a88c4be2f3bbffda60548ced52b1f061`。
- 候选构建运行：[43467660911](https://github.com/yud78785/yutang-build/actions/runs/43467660911)。
- 双平台 Edge AppContainer / Low Integrity / HTTPS 专项：[43488935750](https://github.com/yud78785/yutang-build/actions/runs/43488935750)。
- 本审查文档所在分支：`experiment/windows-147-lpac-network-20261114`。

## 1. 已有证据且不应重复的验收

| 项目 | 证据 | 结论 |
|---|---|---|
| Windows 2022 1.4.7 EXE 构建与隔离启动 | Run 43467660911 / Artifact 14060020678 | 通过 |
| Windows 2025 1.4.7 EXE 构建与隔离启动 | Run 43467660911 / Artifact 14059508987 | 通过 |
| Edge Renderer AppContainer / Lockdown / Untrusted | Run 43467660911 | 通过 |
| Network Service AppContainer / Low Integrity | Run 43467660911 | 通过 |
| Chromium LPAC AccessCheck 语义 | Run 43488935750 | 两平台均为普通 AppContainer，不是 LPAC |
| Edge 真实公网 HTTPS | Run 43488935750 | 两平台 HTTP 200、TLS 1.3 |
| 浏览器正常退出、重启和三种强制退出清理 | Run 43467660911 | 通过 |
| 候选 EXE 哈希和来源回执 | 两个平台候选回执 | 通过 |

候选 EXE SHA-256：

- Windows 2022：`f153896ecb7687d35f8f1b0b66ead1470fe91f611fcb2bf515f4e90c57b5f043`
- Windows 2025：`c2cd51f7449a3ddc4413b4e06d1ea30ae9bbb070e11b7aee540788b9d3f71ef0`

以上是候选 EXE 的历史实测证据；本审查没有重新构建或替换该 EXE。

## 2. 阻塞一：候选 EXE 未签名

证据：

1. 构建配置 `desktop/electron-builder.json` 的 Windows 配置为 `signExecutable: false`、`forceCodeSigning: false`，目标只有 `portable`。
2. Windows 候选构建工作流只调用 `Get-AuthenticodeSignature` 读取 EXE 签名状态，并把结果写入 `windows-candidate-receipt.json`；没有签名步骤，也没有要求签名状态必须为 `Valid`。
3. Windows 2022 和 Windows 2025 候选回执均记录 `signatureStatus: NotSigned`。
4. 当前候选构建只上传候选 Artifact，不创建正式 GitHub Release。

源码与构建证据：

- [electron-builder.json（固定上游提交）](https://github.com/LockyBee/dsh-douyin-agent/blob/9c49833078f4b4d18b9211ef86d024e7f2e15739/desktop/electron-builder.json)
- [Windows 1.4.7 构建工作流](https://github.com/yud78785/yutang-build/blob/experiment/windows-147-security-only-20261113/.github/workflows/windows-147-packaged-smoke-fix.yml)
- [候选构建运行 43467660911](https://github.com/yud78785/yutang-build/actions/runs/43467660911)

**结论：不能把当前 1.4.7 候选作为正式 Windows 发行版。** SHA-256 能证明文件与某个已知摘要相同，但当前摘要和 EXE 一起存放在同一 GitHub Artifact 中，不能单独证明发布者身份，也不能建立 SmartScreen / Authenticode 发布者信任。

## 3. 阻塞二：更新器信任的是上游仓库，而不是 YuTang 安全加固构建

固定上游提交 `9c49833078f4b4d18b9211ef86d024e7f2e15739` 中的 `desktop/src/update-service.mjs`：

- `UPDATE_REPOSITORY='LockyBee/dsh-douyin-agent'`
- 查询 `/releases/latest`
- 下载与版本号对应的 EXE 和同一 Release 中的 `.sha256`
- 对 HTTPS、GitHub 资产 URL、重定向主机、文件大小、MZ 文件头和 SHA-256 做检查

这些检查可以发现损坏、错误主机和内容摘要不一致；但 EXE 与摘要来自同一 Release，二者没有独立签名。若 Release 账号或发布资产被替换，攻击者可以同时替换 EXE 和 `.sha256`。

更重要的是，当前 1.4.7 是从固定上游源码重新构建并额外应用 YuTang 补丁。更新器却直接跟踪 `LockyBee/dsh-douyin-agent` 的未来 Release。未来上游发布更高版本时，更新器可能直接安装没有经过 YuTang 同一套补丁和 Windows 安全验收的上游 EXE。

源码：

- [update-service.mjs](https://github.com/LockyBee/dsh-douyin-agent/blob/9c49833078f4b4d18b9211ef86d024e7f2e15739/desktop/src/update-service.mjs)
- [YuTang 构建补丁工作流](https://github.com/yud78785/yutang-build/blob/experiment/windows-147-security-only-20261113/.github/workflows/windows-147-packaged-smoke-fix.yml)

**结论：正式更新通道必须改为 YuTang 控制、且与通过验收的补丁提交绑定的发布通道；不能把上游最新 Release 自动等同于 YuTang 安全版本。**

## 4. 阻塞三：更新安装没有新版健康确认和回滚

固定上游提交中的 `desktop/src/main.mjs`：

1. 下载后调用 `verifiedExecutable()` 核对本地文件 SHA-256。
2. 复制 Node 运行时与 `update-launcher.mjs` 到用户数据目录。
3. 先把桌面快捷方式改为指向下载的新 EXE。
4. 启动更新辅助进程，随后旧版退出。

`desktop/src/update-launcher.mjs`：

1. 等待旧 PID 最多 30 秒退出。
2. 再次计算 EXE SHA-256。
3. 通过 `spawn()` 启动新 EXE，然后立即 `unref()`。
4. 没有等待新版报告 UI/API ready，也没有启动失败后的自动恢复路径。

因此，当前实现有下载前后完整性检查，但没有“新版启动成功”的端到端确认。若新 EXE 被创建后立即崩溃，旧版已退出且桌面快捷方式已经指向新版；当前代码没有自动恢复旧版本的证据。

源码：

- [main.mjs](https://github.com/LockyBee/dsh-douyin-agent/blob/9c49833078f4b4d18b9211ef86d024e7f2e15739/desktop/src/main.mjs)
- [update-launcher.mjs](https://github.com/LockyBee/dsh-douyin-agent/blob/9c49833078f4b4d18b9211ef86d024e7f2e15739/desktop/src/update-launcher.mjs)

## 5. 当前产品交付形态

固定上游 `desktop/electron-builder.json` 的 Windows target 是 `portable`，不是 MSI / NSIS 安装包。升级流程是下载一个新的便携 EXE、创建/改写桌面快捷方式并启动新文件；不是在原安装目录中进行传统安装包覆盖升级。

上游 README 也明确称便携包未签名，并建议用同名 `.sha256` 核对。

因此当前“安装与升级安全”应按便携式 EXE 的下载、校验、启动、快捷方式切换、旧版本保留与回滚来验收，不应误写成 MSI 安装器已经验收。

## 6. 已有更新器测试的覆盖范围与缺口

`desktop/tests/update-service.test.mjs` 已覆盖：

- 版本比较和正式版 / 预发布版区分。
- 只访问固定仓库。
- 下载 URL 主机限制。
- SHA-256 不匹配时拒绝并清理临时文件。
- EXE MZ 文件头、大小和分块下载。
- 重复检查 / 下载去重。
- 下载后文件被改变时拒绝启动。

仍缺少：

- Authenticode 签名有效性与预期发布者身份检查。
- 由独立可信公钥验证的签名更新清单。
- 证明发布版本对应 YuTang 已验收的补丁提交。
- 更新辅助程序的单元/集成测试。
- 新版启动健康确认、超时与自动回滚测试。
- 从当前便携版升级到新版、断网/断电/损坏包/新版启动失败的 Windows 2022/2025 实测。

现有候选 EXE 的 packaged smoke 只证明更新 IPC 存在，并不等于真实更新下载、安装切换和回滚已经通过。

## 7. 正式交付必须增加的验收门

### A. 发布者与制品身份

1. 取得正式 Authenticode 代码签名身份；签名私钥不得进入仓库、源码包或候选 Artifact。
2. 对 YuTang 发布的便携 EXE 及 YuTang 自有辅助 EXE 执行签名，并使用可信时间戳。
3. Windows 2022 / 2025 必须检查 `Get-AuthenticodeSignature.Status = Valid`，并核对预期 Publisher / 证书指纹；仅记录状态不够。
4. 生成版本清单，至少绑定版本号、上游提交、YuTang 补丁提交、EXE SHA-256、字节数、Artifact ID、签名者身份和构建运行 ID。
5. 对清单做独立签名，更新器内置验证公钥；不能只下载同一 Release 中的 EXE 与未签名 `.sha256`。

### B. 更新来源

1. 更新源改为 YuTang 控制的 Release 通道。
2. 每个可更新版本必须指向一个经过 Windows 2022 / 2025 验收的 YuTang 候选构建及其补丁提交。
3. 未签名、签名者不匹配、清单签名无效、版本回退或来源不符时，更新器必须拒绝下载后的启动。
4. 上游新版本只作为待重新构建的源码输入，不能直接当作 YuTang 更新包。

### C. 更新切换与回滚

1. 下载到版本隔离的 staging 目录；下载、签名和清单核验全部通过前，不改桌面快捷方式。
2. 启动新版后等待明确的健康回执（Electron UI ready、API ready、版本和候选哈希匹配）。
3. 在健康回执到达前保留旧 EXE 和旧快捷方式。
4. 新版崩溃、超时、哈希不符或健康回执不符时，恢复旧快捷方式并允许旧版重新启动。
5. 通过后才把新版设为当前版本；旧版清理应延后且可恢复。

### D. Windows 验收矩阵

Windows 2022 与 Windows 2025 均需用同一个确切候选 SHA-256 完成：

- 有效签名、正确 Publisher：接受。
- 未签名、无效签名、过期/不可信证书、错误 Publisher：拒绝。
- EXE 与签名清单任意一个被修改：拒绝。
- 上游 Release 的 EXE 冒充 YuTang 版本：拒绝。
- 下载中断、磁盘不足、旧进程超时：旧版可继续启动。
- 新版首次启动失败：自动回滚到旧版。
- 新版成功健康回执：快捷方式切换正确，旧版保留策略符合预期。
- 更新过程中不得删除用户数据、浏览器资料、API Key 或历史记录。

## 8. 当前仓库与发布边界

审查时已核实：

- `main` 仍为 `4745ed23cbb748cb4b070ed70390703d1261aea0`。
- 1.4.7 候选安全构建仍在独立实验分支 `experiment/windows-147-security-only-20261113`，提交 `1c332d55a88c4be2f3bbffda60548ced52b1f061`。
- LPAC / HTTPS 专项报告在 `experiment/windows-147-lpac-network-20261114`。
- 没有正式 GitHub Release；本审查没有创建 Release、合并 PR、修改 main 或安装到用户电脑。
- 当前没有可用于 Authenticode 签名的已确认发布者证书身份或签名密钥配置；本审查不尝试伪造或生成自签证书冒充正式信任。

## 9. 下一项工作与阻塞

**下一项工作：在独立实验分支实现“YuTang 签名清单验证 + 发布来源固定 + 更新健康回执/回滚”的代码与离线测试。**

正式签名仍有外部阻塞：需要确定 YuTang 的正式发布者身份及可用的 Authenticode 签名方式。没有证书或受信任签名服务之前，只能完成代码、测试与签名门禁设计，不能把当前候选变成可信正式发行版。

本审查没有改变产品源码和候选 EXE。


## 10. 2026-11-14 双平台更新信任补丁与新候选验收增补

本节更新原审查时的“下一项工作”状态。已在独立实验分支实现 fail-closed（未配置可信密钥时关闭更新）更新器、签名清单校验、Authenticode 发布者核验、启动健康回执与快捷方式切换保护，并完成新候选的 Windows 2022 / Windows 2025 CI 验收。

### 10.1 最终运行身份

- 工作流：[43495140768](https://github.com/yud78785/yutang-build/actions/runs/43495140768)
- 最终结论：**success**
- 分支：`experiment/windows-147-update-trust-20261114`
- 本轮候选提交：`5713e2db0a583439be31020062e07a84297105b3`
- 固定上游：`LockyBee/dsh-douyin-agent`，提交 `9c49833078f4b4d18b9211ef86d024e7f2e15739`
- `main` 未改变，仍为 `4745ed23cbb748cb4b070ed70390703d1261aea0`。
- 未创建 PR、未合并、未发布正式 Release、未安装到用户电脑。

### 10.2 两个平台各自的候选 EXE 身份

| 平台 | 产品版本 | EXE 大小 | EXE SHA-256 | Artifact ID |
|---|---:|---:|---|---:|
| Windows 2022 | 1.4.7 | 125,299,257 bytes | `57a40e8c743e68b7502f7ababc04dd689f21f1bffda1b1f3efe2abab606e69d7` | `14071038566` |
| Windows 2025 | 1.4.7 | 125,299,013 bytes | `4acebd4d914133d14806ffab71c464aa9f6d80e39d968bf009ded0da6075f519` | `14072426069` |

两个平台产物的 SHA-256 不同，因此各自的 packaged smoke（打包后实测）与 Edge 生命周期记录均按各自候选 SHA 绑定；没有把一个平台的 SHA 或测试结果套到另一个平台。

两个 Artifact 均为 `CANDIDATE-NOT-RELEASE`，每个包含 13 个文件，包含 EXE、摘要、verification、候选回执、更新信任补丁回执与 Edge 生命周期证据。

### 10.3 本轮新候选实测结果

Windows 2022 和 Windows 2025 均通过：

- 固定上游源码与 YuTang 补丁应用。
- 更新器模板 15 项合成测试。
- 修改后的上游桌面源码集成回归测试。
- Job Object Go 测试、vet 与 Windows 编译。
- UI、独立 API runtime 与 portable EXE 构建。
- 新候选 EXE 在隔离用户目录中的真实启动与 UI smoke。
- 新候选 SHA-256 固定，并与后续 Edge 生命周期回执一致。
- Edge Renderer 沙盒、Network Service AppContainer、Windows 进程令牌、Low Integrity、进程归属及 CDP 回环监听核验。
- Edge 关闭后两次重启。
- 三种强制退出：仅杀 browser-host、仅杀 Job Object guard、仅杀 Electron 主进程。
- 每种强制退出均确认 tracked processes、profile processes、CDP listeners 为 0；独立无关 Edge 进程保持存活。
- 临时 Edge 出站防火墙规则已执行清理。
- 严格非发布、无真实 API Key、无真实模型调用、无真实消息发送边界通过。

Edge 版本为 `156.0.4314.58`。Renderer 证据为 AppContainer + Lockdown + Untrusted。Network Service 的 Windows token 证据为 AppContainer SID 匹配且 Low Integrity（RID 4096）；`edge://sandbox` 表格本身显示 Network Service Lockdown 为 None、Integrity 为 Default。因此不能把本轮结果扩大解释为 Network Service LPAC 或完整 Lockdown 已通过。本轮仍未测试真实 Douyin 视频播放，因为测试主动阻断了 Edge 外网；预期的 `ERR_NETWORK_ACCESS_DENIED` 是隔离测试边界，不是启动失败。

### 10.4 更新安全补丁：代码与测试通过，但真实更新仍未开放

两平台候选回执中的更新补丁状态一致：

- `status = PASS_FAIL_CLOSED_UPDATE_TRUST_AND_HEALTH_HANDSHAKE_PATCH`
- `updateRepository = yud78785/yutang-build`
- `signedManifestRequired = true`
- `startupHealthHandshake = true`
- `stagedShortcutUntilHealthy = true`
- `preCommitRollbackWindowMs = 30000`
- `manifestPublicKeyConfigured = false`
- `authenticodePublisherThumbprintConfigured = false`
- `updatesDisabledUntilTrustConfigured = true`

两平台确认的更新相关源码 SHA-256：

- `desktop/src/update-service.mjs`：`d40a93f8be2cc2c33b380ec1c20f35ca82c5e3440c4a1e352ad0a405d4bcf800`
- `desktop/src/update-launcher.mjs`：`6202646db1c9ec62ab157bd1220a8e50c857cab5cfe1bdc55deec9ec029a29e9`
- `desktop/src/main.mjs`：`a466ba61c0f78da5950c0a55c285496e6ee82b9fea669f8b5abebbee0e4097f6`
- 更新器测试文件：`75f488d19649326d07128a83800922cb271d95baf9db2e93d70e03f52ca6e131`

测试使用临时 Ed25519 密钥与合成 EXE/进程，验证清单伪造、摘要篡改、错误发布者、下载跳转、健康回执失败及快捷方式保留/切换行为。**这证明代码路径和合成回归测试通过，不证明真实 Authenticode 证书、正式清单签名或 Windows 真实 EXE 升级/回滚端到端已通过。**

最终两个候选 EXE 的 Authenticode 状态均为 `NotSigned`，没有正式发布者证书或清单公钥。当前更新器按设计拒绝检查/安装未建立信任的更新；不能把“更新器已打包”写成“自动更新已可用”。

### 10.5 本轮失败记录与修复

以下失败没有被改写为通过，最终成功运行是新的提交和新的候选：

1. Run `43494644297`：补丁执行器漏导入 `node:url` 的 `pathToFileURL`；修复导入，并增加健康回执路径限制。
2. Run `43494825397`：补丁器把上游三行更新启动代码错误地按一行匹配；改为按固定上游的三行精确匹配。
3. Run `43495000935`：15 项模板测试中，程序正确拒绝篡改文件，但断言错误地要求英文 `SHA256` 文本；将断言改为匹配实际中文拒绝信息“已改变”。
4. Run `43495140768`：最终分支提交 `5713e2db0a583439be31020062e07a84297105b3`，Windows 2022 与 Windows 2025 两个 job 均成功，产物及回执已上传。

### 10.6 当前结论与下一步

**已通过：** 新的 1.4.7 候选 EXE 在 Windows 2022 与 Windows 2025 的构建、隔离启动、Edge 沙盒/生命周期及进程清理验收；更新器的签名清单验证与健康回执/回滚代码的合成测试。

**仍阻塞正式交付：**

1. 确认 YuTang 正式发布者身份并取得受信任的 Authenticode 签名证书/签名服务。
2. 安全配置客户端固定的 Ed25519 清单公钥和 Authenticode Publisher thumbprint；私钥不能进入仓库、候选 Artifact 或用户 EXE。
3. 建立仅在双平台验收成功后签发的 YuTang Release 清单与资产流程。
4. 在具备真实发布信任配置后，再做真实 Windows 2022 / 2025 更新下载、签名拒绝、成功升级、启动失败回滚与用户数据保留端到端验收。

在这些阻塞解除前，两个 Artifact 只作为已验收的**未签名候选**保留，不发布、不向用户电脑推送、不启用自动更新。


## 11. 2026-11-14 单一候选与正式签名准备（新实验分支）

本轮没有修改已验收候选 EXE，也没有运行新的 Windows Actions 工作流。

### 11.1 单一候选问题已定位

Run `43495140768` 的两个独立 runner 构建了不同 EXE：

- Windows 2022：`57a40e8c743e68b7502f7ababc04dd689f21f1bffda1b1f3efe2abab606e69d7`，Artifact `14071038566`。
- Windows 2025：`4acebd4d914133d14806ffab71c464aa9f6d80e39d968bf009ded0da6075f519`，Artifact `14072426069`。

两份产物各自的 Windows 实测都通过，但 SHA 不同，不能作为同一个发行资产的双平台验收证据。

### 11.2 唯一候选预检工作流已准备，尚未运行

新工作流：

`.github/workflows/windows-147-same-candidate-cross-platform-preflight.yml`

固定候选：Windows 2025 的 1.4.7 EXE，来源 Run `43495140768`、Artifact `14072426069`、构建提交 `5713e2db0a583439be31020062e07a84297105b3`、SHA-256 `4acebd4d914133d14806ffab71c464aa9f6d80e39d968bf009ded0da6075f519`。

该工作流只下载此 EXE，在 Windows 2022 上重新实测 Edge 沙盒、CDP、两次重启及三种强制退出。它先通过 GitHub API 核对来源工作流、Windows 2025 job、Artifact ID 和候选回执，再核对每个实测回执绑定同一个 SHA。它不重新构建、不签名、不创建 Release。

- 工作流文件 blob：`c8a73cfa1257e087651c2c5630da8843368fdddf`
- 触发方式：仅 `workflow_dispatch`。
- 状态：已提交到独立分支，**未运行、未消耗新的 Actions 额度**。
- 交叉验收通过前，不能宣称“同一个 EXE 已在两台 Windows 通过”。

### 11.3 签名服务选择边界已核实

新增操作手册：`docs/windows-147-release-signing-runbook-20261114.md`。

Microsoft 当前公开的 Azure Artifact Signing Public Trust 地区规则是：组织发行主体限于列明地区（包括美国、加拿大、欧盟、英国等）；个人开发者目前仅美国和加拿大。塞尔维亚不在 Public Trust 列表中。若 YuTang 的发行主体是塞尔维亚个人或塞尔维亚注册公司，不能假设可用 Azure Public Trust；应评估受信任 CA 的 OV Code Signing Certificate。若发行主体是符合条件的欧盟/英国等地区注册组织，可评估 Azure 组织身份验证路线。

Azure Artifact Signing 的 GitHub Actions 集成支持 Windows 2022 / 2025，并可使用 Entra OIDC 联邦登录与 `Artifact Signing Certificate Profile Signer` 权限。无论选哪条路线，都必须由真实发行主体完成身份验证；不向 ChatGPT 发送身份证件、私钥或证书密码。

### 11.4 当前结论

- 双平台独立构建的旧候选：各自验收通过，但不能合并成一个发行文件。
- Windows 2025 唯一候选：已在 Windows 2025 通过；Windows 2022 同 SHA 交叉实测待执行。
- 正式发行主体类型/司法辖区：尚未确认。
- Authenticode 证书/服务、Publisher thumbprint、Ed25519 manifest key：尚未配置。
- 自动更新：继续 fail closed。
- 正式 Release：未创建。

下一步先完成单一 EXE 的 Windows 2022 交叉实测，再根据真实发行主体的类型与司法辖区选择 Azure Artifact Signing 或 OV 证书。完成真实签名身份配置前，不生成伪造签名、不启用更新、不发布。


## 12. 2026-11-14 同一候选 EXE 双平台交叉验收完成；LPAC 决策

### 12.1 同一个二进制文件在两个 Windows 版本通过

- Windows 2025 来源构建：Run `43495140768`，job `132126155604`，提交 `5713e2db0a583439be31020062e07a84297105b3`。
- Windows 2025 来源 Artifact：`14072426069`。
- Windows 2025 构建镜像：`win25-vs2026`，镜像版本 `20261103.298.1`。
- Windows 2022 同文件交叉验收：Run `43507572122`，job `132169112615`。
- Windows 2022 测试镜像：`win22`，镜像版本 `20261101.353.1`。
- 跨平台回执 Artifact：`14077333069`，名称 `YuTang-1.4.7-Same-Candidate-Windows-2022-Cross-Test-NOT-RELEASE`。
- 最终交叉验收状态：`PASS_SAME_CANDIDATE_WINDOWS_2022_CROSS_TEST`。
- 唯一 EXE：`Dafeiyu-Douyin-API-1.4.7-win-x64.exe`。
- 大小：`125,299,013 bytes`。
- 唯一 SHA-256：`4acebd4d914133d14806ffab71c464aa9f6d80e39d968bf009ded0da6075f519`。
- Authenticode：`NotSigned`。
- Release：`false`。

交叉验收先核对原始 Run 成功、Windows 2025 job 成功、Artifact ID/所属 Run/来源提交/原始 receipt/verification，再下载唯一 Artifact，在 Windows 2022 重新计算 SHA-256 并对同一文件运行 Edge 生命周期测试。没有在 Windows 2022 重新构建 EXE。

### 12.2 Windows 2022 对同一 EXE 的实际运行

同一 SHA 的四份 Edge 生命周期回执（正常、强杀 browser-host、强杀 Job Object guard、强杀 Electron 主进程）全部通过：

- 每份回执均绑定 SHA `4acebd4d914133d14806ffab71c464aa9f6d80e39d968bf009ded0da6075f519`。
- Edge 版本：`156.0.4314.58`。
- 每种运行均启动 3 次、关闭 3 次，包含 2 次重启。
- Renderer 共 3 个，均为 Lockdown + Untrusted + Lowbox/AppContainer。
- CDP 只绑定 loopback；未发现 `--no-sandbox`。
- Network Service 属于该应用自己的 Edge 进程树，使用独立 profile。
- 三种强制退出分别为 `kill-host-only`、`kill-jobguard-only`、`kill-electron-main-only`。
- 三种强制退出的 tracked processes、profile processes、CDP listeners 均为 0。
- 无关 Edge 进程在关闭与重启过程中保持存活。
- 四份回执的 `cleanupVerified=true`。
- 临时 Edge 出站防火墙规则已执行清理；本轮仅在临时 GitHub-hosted runner 生效。

本轮外网被明确阻断，因而没有进行 Douyin 视频播放；测试中的 `ERR_NETWORK_ACCESS_DENIED` 是预期隔离结果，不是浏览器启动失败。没有登录真实账号、没有调用真实模型、没有使用真实密钥。

### 12.3 AppContainer、Low Integrity 与 LPAC 的实际区别

本次**当前候选 EXE**在 Windows 2022 与 Windows 2025 均有直接的 Windows Token 证据：

- Network Service 的 AppContainer SID 与其 Windows 进程令牌一致。
- `IsAppContainer=true`。
- `TokenIntegrityLevel` RID = `4096`，即 Low Integrity。
- 回执字段：`networkServiceWindowsTokenVerified=true`、`networkServiceLowIntegrityVerified=true`、`networkServiceTokenIntegrityLevel=Low`。

同时必须保留 UI 与 token 的区别：`edge://sandbox` 页面显示 Network Service 的 Sandbox 类型为 `Network`、Lockdown 为 `None`、Integrity 列为 `Default`；Windows 进程令牌 API 的直接检查则确认 Low Integrity。我们只声称已经证明 AppContainer + Low Integrity，不把 UI 字段误写为完整 Lockdown。

### 12.4 LPAC 现有证据与决策

既有 LPAC 语义专项 Run `43488935750`（独立实验分支）在 Windows 2022 与 Windows 2025 对更早的 1.4.7 候选进行了 Chromium 上游 `CheckLpacToken` 风格的 AccessCheck：

| 平台 | 旧候选 SHA-256 | AccessCheck | 结果 | 公网 HTTPS |
|---|---|---:|---|---|
| Windows 2022 | `f153896ecb7687d35f8f1b0b66ead1470fe91f611fcb2bf515f4e90c57b5f043` | 3 | ordinary-AppContainer | HTTP 200 / h3 / QUIC |
| Windows 2025 | `c2cd51f7449a3ddc4413b4e06d1ea30ae9bbb070e11b7aee540788b9d3f71ef0` | 3 | ordinary-AppContainer | HTTP 200 / h2 / TLS 1.3 |

该旧专项明确不是当前新候选的 SHA 验收。它所用的 `browser-host.mjs` SHA-256 为 `cc1c995f352aa803608b3d1902f43977bde1d1aab7ca08080274d3e66ca47909`；当前新候选构建回执也记录相同 `browser-host.mjs` SHA，Edge 版本同为 `156.0.4314.58`。但本次新候选的交叉工作流没有再次运行 LPAC AccessCheck，也没有对新候选放开公网 HTTPS。

**工程决策：当前不升级 LPAC。** 理由：

1. 当前新候选已经在两台 Windows 上证明 Network Service 运行于 AppContainer 且 Windows token 为 Low Integrity；Renderer 是 Untrusted + Lockdown。
2. 旧专项对相同 browser-host 代码与相同 Edge 版本证明当前模式是 ordinary AppContainer，而非 LPAC，并证明该模式下真实 HTTPS 可用。
3. LPAC 会进一步限制 Network Service 可访问的系统资源；在没有业务需求、没有新候选联网兼容性实测之前，仅为了获得更严格的标签而改动浏览器权限边界，可能损害 DNS、证书、代理、HTTP/2/HTTP/3 或网站访问能力。
4. LPAC 不是当前启动与进程生命周期验收的发布阻塞项。

因此保持当前 AppContainer + Low Integrity，不对当前候选的 browser-host 做 LPAC 修改。若未来确有更高隔离需求，另开实验分支，对同一个固定 EXE 和 Edge 版本先做 LPAC AccessCheck，再做 DNS、TLS、HTTP/2、HTTP/3、代理和真实目标网站兼容性测试；全部通过前不得合入候选。

### 12.5 最新验收状态与剩余阻塞

**已通过：**
- Windows 2025 原始候选 EXE 构建、隔离启动与 Edge 生命周期实测。
- 同一 Windows 2025 EXE 在 Windows 2022 的下载、哈希复核、真实 Edge 沙盒与生命周期交叉验收。
- 两平台同一 SHA-256 绑定。
- AppContainer + Low Integrity 直接 token 验证。
- 正常关闭、两次重启、三种强制退出零残留。

**仍未通过/未执行：**
- 当前候选的 LPAC AccessCheck 专项复测：未执行；按当前安全需求不作为阻塞。
- 当前新候选公网 HTTPS / Douyin 播放：本轮外网阻断，未执行。
- Authenticode 正式签名：未签名。
- Ed25519 正式清单公钥/私钥配置：未配置。
- 真实在线更新、安装、健康确认与失败回滚端到端：未执行。
- 正式 Release：未创建。

最终状态：同一 1.4.7 EXE 的 Windows 2022 + Windows 2025 启动与 Edge 生命周期交叉验收通过；仍为未签名、未发布候选。继续保持 `main` 不变、无合并、无正式发布、无用户电脑操作。


## 13. 2026-11-14 更新器二阶段切换与回滚补强（Windows 实测待执行）

### 13.1 对上一轮健康回执疑虑的更正

上一条交接曾提出“`startupReady=true` 可能早于 UI 完成加载”。进一步核对固定上游 `desktop/src/main.mjs` 和 `desktop/src/startup-navigation.mjs` 后，确认这一疑虑不成立：

1. `await backend.start(current)` 先完成本机 API 启动。
2. `await navigateStartup(...)` 等待本机 HTML 返回 200，执行 `window.loadURL()`，再执行 `checkRenderer()`。
3. `checkRenderer()` 要求 DOM 非 loading、`#root` 有子元素，且 preload 暴露的 `getSettings` / `saveSettings` API 存在。
4. `await startup.success()` 完成后，再检查 backend child 仍连接且未退出。
5. 最后才执行 `startupReady = true`，更新健康回执在该锚点之后生成。

因此，原健康回执时序已在逻辑上晚于 UI root / preload API / backend readiness。此前“健康回执早于 UI ready”的判断撤回。本分支在补丁执行器中新增固定源码顺序断言 `UPDATE_HEALTH_SIGNAL_NOT_AFTER_BACKEND_AND_RENDERER_READINESS`，防止未来上游变更使此顺序失效。

### 13.2 真正发现的回滚窗口缺口

原更新启动器在新版健康回执后先等待 30 秒，再切换桌面快捷方式；切换成功后立即删除旧快捷方式备份。这样能发现切换前的崩溃，但无法恢复切换后、备份删除后立即发生的新版异常退出。

本分支修改为：

1. 等待旧版进程退出。
2. 重新核对新版 EXE SHA-256 与 Authenticode 发布者身份。
3. 启动新版并等待与 PID、nonce、版本、SHA-256、backend PID 绑定的健康回执。
4. 健康回执通过后才切换桌面快捷方式，同时保留旧快捷方式备份。
5. 切换后继续观察 30 秒；新版非零退出或被信号终止时，恢复旧快捷方式。
6. 若新版正常以 exit code 0 退出（例如用户主动关闭），视为正常，不回滚。
7. 观察期完成后才删除旧快捷方式备份。
8. 若恢复旧快捷方式本身失败，不再静默吞掉异常；抛出 AggregateError 并指出保留的备份路径。

### 13.3 新增回归测试

更新器测试从 15 项扩展为 17 项，新增：

- 新版在快捷方式已经切换后的观察期内崩溃：必须恢复旧快捷方式，且清理临时健康文件/暂存快捷方式。
- 新版在观察期内以 exit code 0 正常退出：保留新版快捷方式，不错误回滚。

原有签名拒绝、清单伪造、SHA 篡改、下载失败和健康回执失败测试保留。

### 13.4 本分支与验收状态

- 分支：`experiment/windows-147-update-rollback-20261114`
- 本节记录时最新提交：`28d5b63b5567c3bb8caf48e1901d200c017ab79a`
- 该分支基于已通过的单一候选双平台交叉验收之后的更新信任源码。
- `main` 未修改。
- 没有新的 Windows Actions 运行；新增 17 项测试、补丁器顺序断言和新版 EXE 均**尚未在 Windows 2022/2025 重新验收**。
- 先前同一候选 `4acebd4d...` 的双平台通过证据仍然有效，但不能替代本次更新器源码改动后的新候选验收。

下一步需要在授权的 Windows 2025 构建 + Windows 2022 同文件交叉测试中，验证 17 项更新器测试、补丁器、真实打包 EXE 和 Edge 生命周期。签名密钥仍为空，更新服务仍 fail closed；本轮不做真实在线升级或正式发布。


### 13.5 随包 README 的更新通道说明已修正

固定上游 `desktop/README.md` 曾继续指向 `LockyBee/dsh-douyin-agent` 的旧 Release，并声称软件内检查更新只接受 GitHub 正式 Release。这与 YuTang 当前固定更新仓库及“未配置签名即安全关闭”的实现不一致。

本分支补丁器现在会：
- 将 `desktop/README.md` 加入固定上游 Git blob 校验。
- 将旧下载段落精确替换为 YuTang 1.4.7 未签名候选说明。
- 明确候选 Artifact 不是公开下载包。
- 明确 Authenticode 与 Ed25519 信任尚未配置，自动更新关闭。
- 将 README 的 SHA-256 纳入补丁回执的修改源码摘要。
- 要求 Windows 工作流验证回执中的 README 更新标志。

README 的修改仍需随下一版便携 EXE 构建后，检查 `app.asar` 内实际打包文本；当前还没有新 EXE 证据。


### 13.6 最终 EXE 内 README 的验证门已加入

进一步核对构建顺序后，发现 OpenRouter 和动态安全补丁会先修改上游 `desktop/README.md` 与 `desktop/scripts/verify-packaged-api.mjs`。因此本分支补丁器不再错误地拿这两个文件与原始上游 blob 比较，而是读取前序补丁回执中的 SHA-256：

- README：校验 `openrouter-desktop-patch-receipt.json` 的 `modifiedSourceSha256['desktop/README.md']`。
- packaged verifier：校验 `windows-security-147-dynamic-patch-receipt.json` 的 `dynamicPatchedSourceSha256['desktop/scripts/verify-packaged-api.mjs']`。

随后补丁器精确替换旧 Release 下载说明，并修改 packaged verifier：从最终 `app.asar` 读取 `README.md`，断言其包含“YuTang 的未签名验收候选”和“自动更新处于安全关闭状态”。Windows 工作流会在补丁后对该 verifier 执行 Node 语法检查，并要求补丁回执声明 packaged README 检查已启用。

这修复了“README 源码已改，但最终 EXE 仍可能打包旧说明”的验收盲区。**实际 app.asar 检查仍待下一轮 Windows 构建执行，不能提前计为通过。**
