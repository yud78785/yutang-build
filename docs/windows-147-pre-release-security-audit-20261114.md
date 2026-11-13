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
