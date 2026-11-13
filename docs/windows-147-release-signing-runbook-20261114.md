# YuTang 1.4.7 单一候选跨平台与正式签名准备

日期：2026-11-14

仓库：`yud78785/yutang-build`

当前工作分支：`experiment/windows-147-release-preflight-20261114`

基线：`ce9aa5efa410d881670aee14842ee9ce2e46f634`

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
