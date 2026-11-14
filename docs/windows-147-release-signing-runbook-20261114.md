# YuTang 1.4.7 单一候选跨平台与正式签名准备

日期：2026-11-14

仓库：`yud78785/yutang-build`

当前工作分支：`experiment/windows-147-update-recovery-20261114`

最新候选提交：`268da91f85f4f57285eceb441c712223ee7ae89`

`main` 保持：`4745ed23cbb748cb4b070ed70390703d1261aea0`

本文件只记录发布准备，不创建 Release、不签名、不合并、不修改 `main`，也不触碰用户电脑。

## 1. 为什么要统一成一个候选 EXE

上一轮最终工作流 `43495140768` 已成功，但 Windows 2022 和 Windows 2025 各自构建的 EXE 哈希不同：

| 平台 | 构建产物 | SHA-256 | Artifact ID |
|---|---|---|---:|
| Windows 2022 | 独立构建候选 | `57a40e8c743e68b7502f7ababc04dd689f21f1bffda1b1f3efe2abab606e69d7` | `14071038566` |
| Windows 2025 | 独立构建候选 | `4acebd4d914133d14806ffab71c464aa9f6d80e39d968bf009ded0da6075f519` | `14072426069` |

两者虽然都通过各自 Windows 实测，但不是同一个二进制文件。正式发布必须先确定唯一资产，再让各目标 Windows 版本测试该资产。

本轮选定 Windows 2025 构建的候选作为待交叉验收资产，因为它已经通过 Windows 2025 的 EXE、Edge、CDP、重启和三种强制退出测试：

- 来源工作流：`43495140768`
- 来源提交：`5713e2db0a583439be31020062e07a84297105b3`
- 来源 Artifact：`14072426069`
- 产品版本：`1.4.7`
- EXE 大小：`125,299,013 bytes`
- SHA-256：`4acebd4d914133d14806ffab71c464aa9f6d80e39d968bf009ded0da6075f519`
- 来源回执平台：`win25-vs2026`
- Authenticode：`NotSigned`
- Release：`false`

Windows 2022 的独立构建产物不作为这次正式发布资产。

## 2. 已准备的单一候选交叉验收

新增工作流：

`.github/workflows/windows-147-same-candidate-cross-platform-preflight.yml`

工作流设计：

1. 只下载上述 Windows 2025 Artifact，不重新构建 EXE。
2. 通过 GitHub API 核对来源工作流、Windows 2025 job、Artifact ID 和提交 SHA。
3. 校验候选回执、verification、EXE 大小与 SHA-256。
4. 在 Windows 2022 上运行同一个 EXE。
5. 再次实测 Edge Renderer / Network Service 沙盒、进程归属、CDP 回环监听、两次重启和三种强制退出。
6. 每个结果都必须绑定同一个 `4acebd4d...` SHA-256。
7. 上传独立交叉验收回执；不签名、不发布。

**当前状态：工作流已提交到本实验分支，但尚未运行。** 它只有 `workflow_dispatch`，没有 push 自动触发。本轮没有消耗新的 Windows Actions 额度。

工作流文件：`94daae2c20943e894bfc450d3d0c5e9b0c0176a7`

交叉验收未运行前，不能把“同一个 EXE 双平台通过”写成已通过。

## 3. 正式发布需要两种互相独立的信任

### A. Authenticode（Windows 发布者签名）

作用：让 Windows 验证 EXE 的代码签名证书链和发布者身份。

当前候选是 `NotSigned`。必须由真实、受信任的代码签名身份签署；不能用自签证书冒充正式发布者。

### B. Ed25519 更新清单签名

作用：让 YuTang 更新器验证发布清单确实由 YuTang 发布者签署，且清单内的版本、EXE SHA-256、来源提交和发布者指纹没有被替换。

当前更新器要求：

- YuTang Release 仓库固定为 `yud78785/yutang-build`。
- `yutang-update-manifest.json` 必须有独立 Ed25519 签名。
- 清单中的 Authenticode thumbprint 必须匹配客户端固定值。
- 下载后的 EXE 必须同时通过清单 SHA-256 与 Authenticode 核验。
- 新版启动健康确认前，旧版快捷方式不能切换。

两种签名不能互相替代。Authenticode 私钥与 Ed25519 清单私钥必须分开保管。任何私钥、证书密码、身份证件都不需要发送给 ChatGPT，也不能提交到仓库或 EXE。

## 4. 签名服务选择：先看正式发行主体所在地

### 方案一：Microsoft Azure Artifact Signing（原 Trusted Signing）

适合已完成 Microsoft 身份验证的组织发行主体，或符合地区要求的个人发行主体。它支持 GitHub Actions、Windows 2022 和 Windows 2025；可以通过 Microsoft Entra OIDC 联邦登录，不必把长期 Azure 客户端密码放入工作流。

目前 Microsoft 公布的 Public Trust 地区规则：

- 组织发行主体：美国、加拿大、欧盟、英国、澳大利亚、新西兰、日本、韩国、新加坡、瑞士、挪威、以色列等列明地区。
- 个人开发者：目前仅美国和加拿大。
- 塞尔维亚不在上述 Public Trust 地区列表中。若发行主体是塞尔维亚个人或塞尔维亚注册公司，不能假定可申请 Azure Public Trust。
- 若发行主体是符合要求的欧盟/英国/美国/加拿大等地区注册组织，可以评估组织身份验证路线。

Azure GitHub OIDC 需要由发行主体或其管理员完成：

1. 建立 Artifact Signing account、Public Trust identity validation 和 certificate profile。
2. 创建 Entra 应用/服务主体，并为 GitHub 仓库配置 federated credential。
3. 授予 `Artifact Signing Certificate Profile Signer` 权限。
4. 在 GitHub 的受保护签名环境中配置非私密资源标识：Tenant ID、Client ID、Subscription ID、Endpoint、Signing Account、Certificate Profile。
5. 使用 Azure 官方 `azure/login` 与 `azure/artifact-signing-action` 完成签名。
6. 签名后在 Windows runner 上再次运行 `Get-AuthenticodeSignature`，必须得到 `Valid`，并读取真实 thumbprint / subject。

不要把 Azure 客户端密码作为默认方案；优先采用 OIDC 联邦身份。签名环境必须限制为受信任分支/手动发布流程。

### 方案二：传统 OV Code Signing Certificate

如果正式发行主体不符合 Azure Artifact Signing Public Trust 地区条件，可以从受信任 CA 申请 Organization Validated（OV）代码签名证书。

- 证书必须以真实法律发行主体签发。
- 私钥应由 CA 提供的硬件令牌、HSM 或受控远程签名服务保护。
- 不把 PFX、私钥或密码放进仓库、Artifact 或聊天。
- 若要在 GitHub Hosted Runner 上签名，应选有受控远程签名/HSM 集成的方案；不能为了自动化而把硬件私钥导出到普通文件。

## 5. Ed25519 清单密钥管理

在 Authenticode 发布者身份确认后，再配置独立 Ed25519 密钥：

- 客户端只内置 Ed25519 公钥。
- 私钥留在受保护的签名环境或外部密钥服务。
- 签名清单的工作流只接触签名操作，不输出、不打印、不上传私钥。
- 私钥轮换需要先发布包含新公钥的客户端版本，再切换签名密钥；不得直接替换旧公钥后要求旧客户端信任新私钥。
- 清单必须在 Authenticode 签名完成后生成，因为签名会改变 EXE 文件内容和 SHA-256。

当前客户端模板仍将 `UPDATE_MANIFEST_PUBLIC_KEY` 与 `UPDATE_PUBLISHER_THUMBPRINT` 留空，更新器因此 fail closed（安全关闭更新）。在真实公钥和真实证书指纹确认前，不得打开更新通道。

## 6. 正式发布流水线的最终门槛

所有项目都通过后，才允许进入正式 Release：

1. 唯一 EXE 在 Windows 2025 构建。
2. 同一 EXE SHA-256 在 Windows 2022 和 Windows 2025 都有实测回执。
3. 双平台回执都对应同一来源提交、同一上游提交、同一 EXE SHA-256。
4. 使用真实 Authenticode 证书签名，并在两平台验证 `Valid` 和相同 Publisher thumbprint。
5. 签名后重新计算 EXE SHA-256。
6. 用独立 Ed25519 私钥签署包含该 SHA-256、版本、来源提交、构建 run/artifact ID 和 Authenticode thumbprint 的 manifest。
7. 用客户端内置公钥验证 manifest，并在两平台运行更新器签名/篡改拒绝测试。
8. 再执行真实下载、安装、健康确认、启动失败恢复、旧版快捷方式保留和用户数据保护端到端验收。
9. 完成后仍需单独授权正式 Release；候选通过不等于自动发布授权。

## 7. 本轮结论与需要确认的唯一外部事实

**已完成：** 发现两个独立构建 EXE 的 SHA 不同；已准备“同一个 Windows 2025 候选交给 Windows 2022 实测”的手动预检工作流。

**未完成：** 该交叉验收尚未运行；正式发行主体类型/注册地未确认；没有 Authenticode 证书、Publisher thumbprint 或 Ed25519 密钥；没有正式 Release；自动更新仍关闭。

为了选对签名服务，只需确认发行主体的类型和司法辖区，不需要发送法律名称、身份证件、证书、私钥或密码。若不想在聊天中披露，也可以由发行主体自行选择服务商并直接完成验证，再只提供公开的 Publisher thumbprint 与 Ed25519 公钥。


## 8. 2026-11-14 验收状态更新：同一 EXE 已通过 Windows 2022 / 2025

签名仍然暂缓，不需要现在购买证书。

唯一候选已确定为 Windows 2025 构建的 EXE，并在 Windows 2022 直接下载同一 Artifact、复核相同 SHA-256 后完成 Edge 生命周期交叉测试：

- 来源构建 Run：`43495140768`
- 来源 Artifact：`14072426069`
- Windows 2022 同文件交叉验收 Run：`43507572122`
- 交叉验收 Artifact：`14077333069`
- 候选 SHA-256：`4acebd4d914133d14806ffab71c464aa9f6d80e39d968bf009ded0da6075f519`
- 状态：`PASS_SAME_CANDIDATE_WINDOWS_2022_CROSS_TEST`
- Authenticode：`NotSigned`
- Release：`false`

这解决了先前两个平台各自构建出不同 EXE 的问题。现在有一个相同的二进制文件分别在 Windows 2025 和 Windows 2022 通过实测。

### LPAC 决策

当前候选已证明 Network Service 的 Windows token 为 AppContainer + Low Integrity（RID 4096）；Renderer 为 Untrusted + Lockdown。更早的独立 LPAC 语义专项对相同 browser-host 源码和 Edge 版本的 AccessCheck 分类为 `ordinary-AppContainer`，且真实公网 HTTPS 成功。

当前不升级 LPAC：现有 AppContainer + Low Integrity 已满足当前启动与隔离验收目标；没有必要为了更严格的标签冒险破坏 DNS/TLS/HTTP 网络兼容性。LPAC 留作单独实验，不是当前候选阻塞。

### 仍然关闭的项目

- 不购买证书、不注册公司、不提交个人身份材料。
- 不配置 Authenticode 或 Ed25519 私钥。
- 不开放自动更新。
- 不创建正式 Release。
- 不合并到 `main`。

后续只有在用户决定对外发布时，再恢复签名资格、价格和证书方案评估。当前优先保留已通过的候选，不重复构建或重复运行已经通过的 Edge 生命周期测试。


## 9. 更新器回滚窗口补强（2026-11-14）

更新器模板已在独立实验分支 `experiment/windows-147-update-rollback-20261114` 增加 post-switch（快捷方式切换后）观察窗口：

- UI / API 健康回执确认后才切换桌面快捷方式。
- 切换后保留旧快捷方式备份 30 秒。
- 观察期内非零退出或信号终止：恢复旧快捷方式。
- 用户主动正常退出（exit code 0）：保留新版入口，不误回滚。
- 回滚本身失败时，显式报告备份路径，不再静默吞掉错误。
- 补丁器固定检查 UI 导航、Renderer preload API、API backend 检查均发生在 `startupReady` 和健康回执之前。

更新器回归测试由 15 项增至 17 项。以上是源码与合成测试补强；**尚未在 Windows 2022 / 2025 对新 EXE 实测**。需要重新构建候选并做同一 EXE 双平台验收后，才能把这些新增行为计入 Windows 通过项。

数字签名仍暂缓，不购买证书；未配置公钥/Publisher thumbprint 时更新器保持关闭。


### 随包文档

下一候选的补丁器会修正桌面包内 `README.md`，不再把上游旧 Release 描述成 YuTang 的下载或自动更新通道。新 README 将明确 1.4.7 是未签名验收候选，GitHub Actions Artifact 不是公开发行包，自动更新因发布信任未配置而关闭。该修改尚待下一次 EXE 的 `app.asar` 实际内容检查。


README 检查也会进入下一轮打包验证：补丁器更新随包 `README.md` 后，修改 `verify-packaged-api.mjs`，直接从 `app.asar` 读取 README 并断言存在“未签名验收候选”和“自动更新处于安全关闭状态”说明。这样不是只检查源码模板，而是检查最终 EXE 中实际打包的文档。该检查尚待新候选 Windows 构建执行。


## 10. 2026-11-14 Windows 更新器候选验收结果

Workflow Run `43513624284` 在隔离实验分支 `experiment/windows-147-update-rollback-20261114` 的 commit `e8e91a29be026403b3095f5fe9e5885b485147a1` 完成，三个 Windows job 均成功：

- Windows 2022 build job `132189835286`：Artifact `14079683370`，EXE SHA-256 `23bda17a387f6a22b7f49b641752b4add07d55a0bf2f09800e74d68aa81644b5`。
- Windows 2025 build job `132189835693`：Artifact `14079143899`，EXE SHA-256 `87ec2d05137802bb39855272c2292e06b7d48012b467ba8bef32b7b0d128582e`。
- Windows 2022 同文件交叉验收 job `132195190400`：Artifact `14081041070`，测试 Windows 2025 的同一 SHA `87ec2d05137802bb39855272c2292e06b7d48012b467ba8bef32b7b0d128582e`，结论 `PASS_SAME_WINDOWS_2025_CANDIDATE_WINDOWS_2022_CROSS_TEST`。

每个平台均通过 17 项更新器模板测试、最终 EXE 启动与 README 打包断言、Edge 沙盒、AppContainer + Low Integrity、loopback CDP、正常重启及三种强制退出零残留。跨平台交叉 job 从 Windows 2025 Artifact 下载 EXE，核对源回执和 SHA-256 sidecar 后，在 Windows 2022 直接运行；没有重建 EXE。

正式 Authenticode 签名与 Ed25519 manifest 公钥仍未配置，更新器保持关闭。因此真实在线升级与真实 EXE 崩溃回滚仍未端到端验收，不能对外宣称已通过。三个 Artifact 均为 NOT-RELEASE 候选；`main` 未修改、未合并、未发布。


## 10. 2026-11-14 最新候选交叉验收完成；签名仍保持关闭

本节覆盖前文“同一候选交叉验收尚未运行”的历史状态。旧候选 SHA 和旧 Run 保留作历史记录。

### 10.1 最新验收身份

- Workflow Run：[43527451048](https://github.com/yud78785/yutang-build/actions/runs/43527451048)，completed / success
- 实验分支：experiment/windows-147-update-recovery-20261114
- 提交：c169cadb05c1ad8a6cc6139971e65dcf697e8bdd
- Windows 2022 独立构建：job 132236632750，Artifact 14086985331，SHA-256 bf29a3d4800353dad8f45582ffaa8d016b98e356fb6a9d077aad73133fc96b40
- Windows 2025 独立构建：job 132236633032，Artifact 14085768864，SHA-256 78060ca7f4cf9624166048a702e14b1652c35e956b5ab17cbe111d782890b058
- Windows 2022 对同一 Windows 2025 EXE 的交叉测试：job 132241895531，Artifact 14087061013，结论 success。
- 三个 job 全部成功；独立构建各 25/25 steps，交叉测试 15/15 steps。
- main 未修改；没有 PR 合并、正式 Release 或用户电脑安装。

### 10.2 同一个二进制文件的核验

唯一用于跨平台交叉测试的候选来自 Windows 2025 Artifact 14085768864：

- 产品版本：1.4.7
- 文件大小：125,320,473 bytes
- SHA-256：78060ca7f4cf9624166048a702e14b1652c35e956b5ab17cbe111d782890b058
- Windows 2022 直接下载此 Artifact，不重新构建。
- 交叉回执 sameBinaryAsWindows2025=true，并且 sourceCandidateReceiptVerified=true。
- 独立下载 Artifact ZIP 后重新计算 EXE SHA-256，仍与候选回执、sidecar、交叉回执完全一致。

Windows 2022 自己的独立构建 SHA 为 bf29a3d4...fc96b40，它是另一份文件；不要与 Windows 2025 同一候选的 SHA 混用。

### 10.3 同一候选安全实测

Windows 2022 对 Windows 2025 候选复测通过：

- Renderer AppContainer + Lockdown + Untrusted。
- Network Service 的 Windows Token：AppContainer + Low Integrity，RID 4096。
- Network Service 的 edge://sandbox Lockdown 仍显示 None，不能称为 LPAC 或完整 Lockdown。
- CDP loopback、本机进程归属、独立浏览器 profile。
- 正常启动、两次重启、关闭与清理。
- browser-host、Job Object guard、Electron 主进程三种强制退出。
- 每种强杀后 tracked processes、profile processes、CDP listeners 均为 0，无关 Edge 进程存活。
- Edge 外网阻断，未执行真实抖音视频播放或模型调用。

### 10.4 当前签名路线建议（不启动身份验证）

Microsoft 官方文档当前区分：

- Azure Artifact Signing Public Trust：组织发行主体只在其列明支持地区可申请；个人开发者目前限美国和加拿大。其官方地区列表不包含塞尔维亚。
- 受支持地区的组织可优先评估 Azure Artifact Signing + GitHub Actions OIDC（开放身份连接），不需要把长期 Azure 客户端密码写入仓库。
- 如果正式发行主体注册在不支持地区，Microsoft 的 Windows 开发者文档建议评估受信任 CA 的 OV Code Signing Certificate。文档给出的典型费用约为 USD 150–300/年；OV 私钥须由 HSM 或硬件令牌保护。
- EV 证书现在不再带来 SmartScreen 即时绕过，不应仅为了绕过 SmartScreen 购买 EV。
- 自签证书仅适合开发/测试，不适合公开分发。

官方依据：
- [Microsoft Artifact Signing Public Trust 地区与身份验证要求](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [Microsoft Windows 应用代码签名选项、OV 费用与 HSM 要求](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)

当前不购买证书、不开始身份验证、不要求在聊天中发送任何身份证件或法律材料。需要由正式发行主体自行确认其法律类型和注册司法辖区。若发行主体为塞尔维亚注册公司，应先按 OV 代码签名路线评估；若发行主体是其他地区的组织，则按 Microsoft 官方资格清单核对 Azure Public Trust 资格。不能根据操作者当前所在位置推断发行主体。

### 10.5 更新器状态与真实升级阻塞

当前候选回执确认：
- manifestPublicKeyConfigured=false
- authenticodePublisherThumbprintConfigured=false
- updatesDisabledUntilTrustConfigured=true
- postSwitchRollbackWindowMs=30000
- startupCrashRecovery=true
- recoveryDoesNotOverwriteUnknownShortcut=true
- release=false

Windows 2022 和 Windows 2025 均执行了：
- 更新信任 / 健康 / 回滚合成测试：17 项通过，0 失败。
- 更新事务崩溃恢复测试：12 项通过，0 失败。

这些测试证明合成清单、签名拒绝、健康握手、快捷方式事务与文件系统崩溃恢复路径；它们不等于使用真实发布者证书完成真实在线下载、真实 EXE 安装切换或真实 EXE 启动失败回滚。

### 10.6 后续执行顺序

1. 保持当前 1.4.7 候选未签名、自动更新关闭。
2. 正式发行主体自行确定 Authenticode 证书/签名服务；不在聊天中传递私钥、证书密码或身份材料。
3. 固定客户端 Ed25519 公钥与 Publisher thumbprint，私钥留在受保护的签名服务。
4. 生成与 YuTang 补丁提交、上游提交、EXE SHA、Artifact/Run ID 和 Publisher thumbprint 绑定的签名 manifest。
5. 签名后重新计算 EXE SHA，并对同一签名 EXE 在 Windows 2022 与 Windows 2025 重新验收。
6. 再单独进行真实在线更新、错误签名拒绝、成功升级、启动失败回滚和用户数据保留端到端测试。
7. 正式 Release 仍需单独授权。

本次跨平台启动与 Edge 安全验收已完成；下一项阻塞不是再跑旧候选，而是正式发布者信任身份。没有真实身份和签名配置时，保持 fail closed 是正确行为。


## 11. 2026-11-14 第二轮候选：并发修改保护回归通过，跨平台复测进行中

本节记录比第 10 节更新的候选。第 10 节 c169 候选的通过记录仍然有效，但不替代 268da 的新 EXE 验收。

### 11.1 本轮身份与状态

- Workflow Run：[43532232402](https://github.com/yud78785/yutang-build/actions/runs/43532232402)
- 新候选提交：268da91f85f4f57285eceb441c712223ee7ae89
- Windows 2022 独立 job：132252510423，success，25/25 steps。
- Windows 2025 独立 job：132252509850，success，25/25 steps。
- Windows 2022 同一 Windows 2025 EXE 交叉 job：132257080868，in_progress，7/14 steps；正在执行 Edge 安全与生命周期测试。
- main 未修改，没有合并、正式 Release 或用户电脑安装。

### 11.2 新候选 SHA-256

- Windows 2022 独立构建 Artifact 14087804790：125,303,751 bytes，SHA-256 a37d552ce33c117ef60c4d7d394c8f5ed2c7808a0a75087f07785c92cf74aec6。
- Windows 2025 独立构建 Artifact 14088736556：125,304,537 bytes，SHA-256 2b3200db6c9be0aa07ea10df8c56077a31c6afec7e16d6806f7700696707367a。
- 两份 EXE 已分别从 Artifact ZIP 提取并重新计算哈希，与 sidecar、候选回执一致。
- Windows 2022 独立构建文件与 Windows 2025 独立构建文件不是同一二进制；跨平台交叉测试必须使用 Windows 2025 Artifact 原文件。

### 11.3 并发修改保护

新版 commitShortcut 在替换快捷方式前复核旧入口、暂存入口和备份文件的 SHA-256；发现用户更改时拒绝覆盖。事务恢复逻辑优先报告 CURRENT_SHORTCUT_CHANGED_BY_USER。新增 3 项测试。

两台 Windows runner 均执行：
- 更新信任模板：17/17 pass，0 fail。
- 更新事务恢复：15/15 pass，0 fail。
- 源码回归：145 tests，144 pass，0 fail，1 skipped。
- 新候选 EXE 便携启动、Renderer、Network Service Token、CDP、两次重启和三种强制退出清理：各自构建 job 成功。

### 11.4 同一 Windows 2025 EXE 在 Windows 2022 的交叉验收最终通过

- 交叉 job：132257080868，success，15/15 steps。
- 交叉 Artifact：14089001701。
- 交叉回执状态：PASS_SAME_WINDOWS_2025_CANDIDATE_WINDOWS_2022_CROSS_TEST。
- Windows 2022 下载并运行的正是 Windows 2025 Artifact 14088736556 中的原始 EXE。
- 文件大小：125,304,537 bytes。
- SHA-256：2b3200db6c9be0aa07ea10df8c56077a31c6afec7e16d6806f7700696707367a。
- sameBinaryAsWindows2025=true、sourceCandidateReceiptVerified=true、release=false。
- 已重新计算 Artifact ZIP 内 Windows 2025 EXE 的 SHA；与 sidecar、Windows 2025 候选回执和 Windows 2022 交叉回执完全一致。

同一 EXE 的交叉安全测试通过：Renderer AppContainer + Lockdown + Untrusted；Network Service 真实 Token 为 AppContainer + Low Integrity（RID 4096）；CDP loopback；正常 3 次启动/关闭、两次重启；三种强制退出均无进程、profile 或 CDP 残留；无关 Edge 进程保持存活。Network Service 的 Lockdown 列仍为 None，不能称为 LPAC。Edge 外网按设计阻断，没有真实视频播放。

### 11.5 新增并发修改保护及其边界

本轮提交 268da 为快捷方式替换增加了旧入口、暂存入口、备份入口的 SHA-256 复核。检测到提交前的用户修改时拒绝覆盖，并保留事务证据。新增 3 项测试；两台 Windows runner 的事务测试均为 15/15 pass，0 fail。

边界：最后一次 SHA 复核与 rename 之间仍不是操作系统级 compare-and-swap；本轮未证明可防止同用户恶意进程在这一极窄窗口内再次改写快捷方式。若正式更新威胁模型要求覆盖该场景，需要另行设计 Windows 原生文件句柄/替换方案并增加竞争测试。

### 11.6 当前发布信任阻塞

本轮 Run 43532232402 三个 job 全部成功；Windows 2022 和 Windows 2025 独立 EXE 各自通过，Windows 2025 同一 EXE 在 Windows 2022 也通过。Artifacts：
- Windows 2022：14087804790，SHA a37d552ce33c117ef60c4d7d394c8f5ed2c7808a0a75087f07785c92cf74aec6。
- Windows 2025：14088736556，SHA 2b3200db6c9be0aa07ea10df8c56077a31c6afec7e16d6806f7700696707367a。
- 同一候选交叉回执：14089001701，SHA 与 Windows 2025 完全一致。

签名仍为 NotSigned；Ed25519 公钥与 Publisher thumbprint 未配置；自动更新保持 fail closed。正式发行主体确认签名资格后，才进入签名、真实在线升级、错误签名拒绝、启动失败回滚和用户数据保留 E2E。正式 Release 仍需单独授权。


## 12. 2026-11-14 最新候选与 Certum Individual Cloud 签名路线复核

本节覆盖本文件此前的候选身份与“签名服务待选”历史记录。历史 SHA、Run 和 Artifact 保留，不互相替代。

### 12.1 最新 Windows 候选身份

- 当前已验收实验分支：`experiment/windows-147-shortcut-pin-20261114`
- 当前候选提交：`9cc16d7e64d59dc141e9c6687b8dd461934fcc35`
- 最终工作流：[Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930)，completed / success。
- `main` 仍为 `4745ed23cbb748cb4b070ed70390703d1261aea0`，没有修改。
- Windows 2025 独立候选 Artifact：`14092434238`，EXE SHA-256：`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`。
- Windows 2022 独立候选 Artifact：`14092741259`，EXE SHA-256：`19cbafd88291f98b40757b8af99883e32881e59a3a3aa04f980b5d875f1a584c`。
- Windows 2025 原始 EXE 在 Windows 2022 下载后直接运行，交叉 Artifact：`14093021418`，同一文件 SHA-256：`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`。
- 两台 Windows 的独立 EXE 测试与同一 EXE 交叉测试均成功；三个 job 全部成功。
- 三个 Artifact 均为 NOT-RELEASE；未签名、未合并、未发布、未安装到用户电脑。

### 12.2 用户已接受的签名方向与购买边界

用户此前接受的候选方向为 **Certum Individual Cloud Code Signing / SimplySign**：

- 个人自然人证书；不注册公司、不购买 EV。
- 不使用自签证书冒充正式发布者。
- 先核对申请资格、身份材料要求、最终价格和签名集成方式。
- 购买、提交身份证件和付款均暂缓；不得在聊天、GitHub 仓库或 Artifact 中收集身份证件、私钥、TOTP 种子或证书密码。

### 12.3 本轮供应商资料核对

**SSLmentor.rs 的 Certum Individual 产品页**当前列出：

- 1 年：117 EUR（不含 VAT）。
- 2 年：218 EUR（不含 VAT）。
- 3 年：291 EUR（不含 VAT）。
- 产品说明称面向个人开发者，不接受公司作为该 Individual 产品申请人。
- 产品页列出的验证方式包括证件照片/人脸验证，以及水、电、固定电话或固定网络等地址证明；声称通常 3 个以上工作日。
- 产品页称证书主体会包含个人姓名（CN 和 Organization）、城市、地区和国家；完整街道地址不写入证书。
- 页面称 SimplySign App、SimplySign Desktop 和 Microsoft SignTool 免费。
- 页面还称 SimplySign 云会话最长约 2 小时、每月最多 5,000 次签名、不能导出 PFX，且目前不支持 CI/CD 自动化，未来支持时间未公布。

来源：[SSLmentor.rs Certum Individual Cloud Code Signing](https://www.sslmentor.rs/certum/certumcodecloudindividual)。

**Certum 官方资料交叉核对：**

- 官方 Standard Code Signing in the Cloud 页面当前显示起价 209 EUR，并支持自然人资料、SimplySign 云端密钥和 Microsoft SignTool；云端产品说明列出每月 5,000 次签名限制。
- Certum 官方页面规定，自 2026-02-27 起单张 Code Signing 证书最长有效期为 **459 天**；多年度产品需要在服务期内重新签发。SSLmentor 页面仍写 460 天，两者存在 1 天差异，必须以 Certum 实际签发规则和订单条款为准。
- Certum 官方个人申请材料说明要求验证订户身份，个人申请还需订户名下的水、电、电话等公共事业账单；验证方式可能包括自动验证、登记点/身份确认点、公证或持证件照片验证。
- Certum 官方 SimplySign 激活说明：云端密钥由 SimplySign 服务生成并保存在云端账户。
- Certum 官方 SignTool 指南要求 Windows 上运行 SimplySign Desktop、通过移动端生成的一次性令牌连接云卡，再使用 SignTool 按证书 thumbprint 签名；示例使用 SHA-256 与 RFC 3161 时间戳服务 `http://time.certum.pl`，并以 `signtool verify /pa /all` 验证。

官方来源：
- [Standard Code Signing in the Cloud](https://shop.certum.eu/standard-code-signing-in-the-cloud.html)
- [Code Signing required documents](https://support.certum.eu/en/code-signing-required-documents/)
- [Activate Code Signing in the Cloud](https://support.certum.eu/en/how-to-activate-code-signing-simplysign/)
- [Certum SignTool / SimplySign instructions](https://support.certum.eu/en/signing-the-code-using-tools-like-signtool-and-jarsigner-instruction/)
- [Certum Reseller Program / country coverage](https://www.certum.eu/en/certum-reseller-program/)

注意：SSLmentor 页面展示了 Certum 授权合作伙伴标识，但本轮没有通过 Certum 动态合作伙伴目录独立确认该商户的具体授权记录；也没有获得对用户个人申请的正式报价或资格确认。Certum 官方 Reseller Program 页面将 Serbia 列为合作网络覆盖国家之一；这不等于某一具体身份证件已通过验证，也不等于已经独立核验 SSLmentor 的具体合作伙伴登记。

### 12.4 对 YuTang 的技术影响

1. Certum Individual 证书会把个人姓名及城市/地区/国家放入公开的签名者身份信息；若不希望软件用户看到这些信息，该个人证书路线不适合。
2. Standard Code Signing 可建立 Microsoft SmartScreen 声誉，但不保证首次下载立即没有 SmartScreen 警告；不能把“有签名”宣传成“保证绕过 SmartScreen”。
3. SSLmentor 当前 FAQ 声称 SimplySign Individual 目前不支持 CI/CD，且 PFX 不可导出。不能把该证书私钥复制到 GitHub Secrets，也不能假设 GitHub Hosted Runner 可以无人值守地使用 SimplySign Desktop。
4. 因此若继续选择该路线，合理流程是：GitHub Actions 继续构建和验收未签名候选；在受控的 Windows 签名工作站上，由证书持有人通过 SimplySign Desktop 交互授权，使用官方 SignTool 对**已通过同一 SHA 双平台验收的确切 EXE**签名；签名后重新计算 SHA-256，再把签名版作为新的候选交给 Windows 2022 / 2025 重新验收。不得把签名前的通过结果套用到签名后的二进制。
5. Ed25519 更新清单签名仍是独立信任层。其私钥必须与 Authenticode 云证书分开保管；客户端只嵌入 Ed25519 公钥和真实 Publisher thumbprint。当前两个常量仍为空，自动更新继续 fail closed。
6. Open Source Code Signing 低价产品不适合 YuTang 的商业分发用途：Certum 官方要求公开可识别的开源项目，并明确商业分发可能导致撤销。

### 12.5 下一步（不购买、不做身份验证）

在购买前只需要供应商书面确认以下事实，不提交真实身份材料：

- SSLmentor 的 Individual 产品能否为居住/申请资料位于 Serbia 的自然人签发；具体可接受哪些塞尔维亚身份证件与地址证明。
- 117 EUR 的一年期报价是否仍有效、最终 VAT/税务处理、付款币种及退款条款。
- 最终签发的证书是否确为 Certum Standard Code Signing CA 下的商业 Code Signing 证书，而非 Open Source Code Signing。
- 459 天上限与多年度 reissue 的实际规则，以 Certum CA 当前政策为准。
- 通过 SimplySign Desktop + SignTool 在一台受控 Windows 工作站手动签名的支持方式；明确不依赖 PFX 导出或未审查的第三方云 API。
- 签名者姓名/城市/地区/国家会公开显示，用户需在付款前知情决定是否接受。

在上述确认和用户另行决定购买之前，不购买、不提交身份材料、不配置真实签名密钥、不打开自动更新、不创建正式 Release。不要因为候选 EXE 已通过 Windows 安全测试就降低这些边界。
