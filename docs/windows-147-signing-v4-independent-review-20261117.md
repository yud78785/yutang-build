# YuTang 1.4.7 签名工具 V4 独立复核记录（2026-11-17）

状态：**27/27 离线测试通过；V4 当前不具备进入生产签名流程的条件。**
本记录只复核从 Google Drive 取得的 source-only V4 文件，并记录供应商公开资料及邮件状态。没有修改 EXE、没有签名、没有购买证书、没有提交身份资料、没有运行 Windows Actions、没有修改 main、没有发布。

## 1. 当前已验收候选基线（不变）

- 仓库：`yud78785/yutang-build`
- 原始候选：YuTang 1.4.7 unsigned EXE
- EXE：`Dafeiyu-Douyin-API-1.4.7-win-x64.exe`
- EXE size：`125446071` bytes
- EXE SHA-256：`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`
- ZIP size：`125575315` bytes
- ZIP SHA-256：`718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`
- 构建源提交：`9cc16d7e64d59dc141e9c6687b8dd461934fcc35`
- 原始 Windows 2025 Artifact：`14092434238`
- Windows 2025 live public-page run：`43643545361`
- Windows 2022 same-EXE live public-page run：`43927596418`
- 同一 SHA 双平台公开首页、Renderer/Network Service 沙盒与清理：已通过。
- Authenticode：`NotSigned`；这仍是未签名候选，不是正式发行包。

## 2. V4 source-only 文件及本地测试

从 Drive 读取的两个文件：
- `windows147-release-manifest-kit-v4.mjs.txt`（Drive file ID `13WcxBYMMh9LdXxBgxbP8kB3xf9U81sMk`）
- `windows147-release-manifest-kit-v4.test.mjs.txt`（Drive file ID `1j6bZCUM1bmns5D1VZBa2ptynRHRHh55X`）

在隔离本地工作目录按 `.mjs` 文件名运行：
- Runtime：Node.js `v22.16.0`
- `node --check` source：通过
- `node --check` tests：通过
- `node --test tests/windows147-release-manifest-kit.test.mjs`：**27 tests, 27 pass, 0 fail, 0 skipped**
- source SHA-256：`6e0a637e80b562dc3b9ad980714ba5d9a151adf17655f47623dd960de63c7f62`
- test SHA-256：`3b71202c74ac8420e79451e83d339c7bfc579f5891e3942b9b90bf2a58e97b16`

测试范围是合成 MZ 文件、临时 Ed25519 密钥及 mock Authenticode 回执。第 8 项 Windows SignTool 测试通过 mock 执行函数模拟 PowerShell 和 SignTool；并没有运行真实 Windows、真实 SignTool、Certum SimplySign 或真实已签名 EXE。第 12 项只证明 Linux CLI 会拒绝声称 Windows Authenticode 已验证。

## 3. V4 生产使用前必须修复的阻塞

### BLOCKER A — 缺少已审查签名候选来源门禁

V4 `makeManifest` 仅检查 commit/Run/Artifact 是正整数和格式正确；它没有调用仓库已有的 `requireReviewedSignedCandidate`，没有把 signed SHA、原始 unsigned SHA、Windows 2022/2025 同 SHA 验收、来源提交和实际 signed Artifact 绑定到一个经过复核的 registry 记录。

当前 V4 测试 fixture 在 manifest 中使用历史 unsigned Run `43541915930` 与 unsigned Artifact `14092434238`，且断言它们被接受。这对 schema 单元测试可以是合成数据，但不能证明生产来源门禁。若直接使用 V4 CLI，操作者可提供旧 unsigned IDs 或任意新 IDs，代码本身不会拒绝。

仓库已有的较强机制：
- `tools/signing/signed-acceptance-registry.mjs`：`REVIEWED_SIGNED_CANDIDATES` 当前为空。
- `tools/signing/yutang-manifest.mjs`：生产 CLI 调用 `requireReviewedSignedCandidate`，在 registry 无已审查签名候选时拒绝 manifest 构建。
- 对照文档：`docs/windows-147-signed-candidate-provenance-gate-20261114.md`。

**处理：不得用 V4 替换现有 registry 门禁。** 若要复用 V4 的 SPKI pin 检查，应把该检查移植到现有 manifest 工具，同时保留已审查 registry 与真实 Windows 双平台同 SHA 证据要求。

### BLOCKER B — SignTool 只检查路径和文件名，没有验证它真的是 Microsoft SDK

V4 `inspectWindowsAuthenticode` 要求绝对路径且 basename 为 `signtool.exe`，随后直接执行 `signtool verify /pa /tw`。它没有先检查该 SignTool 二进制自身的 Authenticode 签名、Microsoft 发布者或可信来源。

已有手动签名脚本 `tools/signing/Sign-YuTangCandidate.ps1` 包含 `SIGNTOOL_NOT_MICROSOFT_SIGNED` 检查，会检查 SignTool 自身签名及 Microsoft 发布者。V4 不应降低这个门槛。

**处理：** 若保留 V4 检查器，必须先独立验证 SDK SignTool 的 Microsoft Authenticode 身份（最好再固定经验证的安装来源/文件哈希），再执行 embedded EXE signature verification。测试必须覆盖伪造的同名 `signtool.exe` 被拒绝。

### BLOCKER C — Windows 上没有验证 Ed25519 私钥文件 ACL

V4 `readSigningKey` 只在非 Windows 平台检查 POSIX mode 的 group/other 权限；在 Windows 平台该检查被跳过。生产 CLI 恰好要求在 Windows 运行，因此当前代码没有验证私钥文件的 NTFS ACL 是否仅授权预期签名账户。

**处理：** 不允许把明文 Ed25519 私钥放入项目目录、同步目录、普通共享目录或 CI。若坚持文件式离线密钥，必须验证 Windows ACL 与父目录继承权限；更好的方案是受控离线签名设备或经过评估的 HSM/密钥服务。没有可验证的保护措施时，不运行 manifest signing。

### BLOCKER D — 客户端 SPKI pin 只是输入值，不证明目标客户端真的内嵌了该公钥

V4 计算传入 Ed25519 私钥对应公钥的 DER SPKI SHA-256，并与配置字段 `expectedManifestPublicKeySpkiSha256` 比较。这只能证明配置值与传入密钥相符；不能证明计划升级的 YuTang 客户端已经嵌入了同一公钥。

README 本身也承认：当前 1.4.7 updater 的 `UPDATE_MANIFEST_PUBLIC_KEY` 为空，`UPDATE_PUBLISHER_THUMBPRINT` 为空，自动更新按 fail-closed 保持关闭。必须先产生一个新的 update-enabled 候选，核实其实际打包字节中内嵌的公钥和 Publisher thumbprint，再把独立核验得到的 SPKI pin 输入 manifest 工具。

**处理：** 在真实 update-enabled 客户端 SHA、嵌入公钥和发布者指纹均有可复核证据前，V4 不得生成可用于发布的 manifest，自动更新保持关闭。

## 4. 可保留的 V4 改进

- 使用 DER SubjectPublicKeyInfo (SPKI) 的 SHA-256，而不是 PEM 文本哈希，作为公钥 pin。
- 要求 Windows 原生 Authenticode `Valid`、Code Signing EKU、timestamp certificate。
- 额外要求 SignTool `verify /pa /tw` 检查 EXE embedded signature。
- 对被检查 EXE 在签名验证前后重复计算 SHA-256，检测检查期间文件变化。
- 输出目录使用独占创建并拒绝覆盖；拒绝输出目录通过 symlink ancestor 指向项目目录。
- 对外部私钥文件拒绝项目目录内路径及直接 symlink。
- 失败时 fail closed，不签名、不发布。

这些设计值得保留，但不能抵消第 3 节的来源门禁、SignTool 身份、Windows ACL 和真实客户端公钥 pin 阻塞。

## 5. 现有仓库的签名准备状态

复核基线分支：`experiment/windows-147-signing-preflight-20261114`，提交 `cb563dad8b6d43d4f412799b30a1f678165b732d`。

现有手动签名脚本：
- 精确固定原始 unsigned SHA 与文件名 `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`。
- 默认不带 `-Sign` 时只做 preflight。
- 要求签名副本，不原地修改原始 EXE。
- 要求证书 thumbprint、当前用户证书库中的私钥、Code Signing EKU。
- 检查 SignTool 自身的 Microsoft 签名。
- 使用 SHA-256 和 RFC3161 timestamp。
- 签后重新验证 Authenticode、发布者 thumbprint、timestamp 和新 SHA。
- 写入 `release=false`、`windowsRetestRequired=true` 的本地回执。

现有 Ed25519 manifest 工具：
- 使用 `yutang.windows-update-manifest.v1`。
- 要求 signed candidate reviewed registry。
- 当前 registry 为空，生产 CLI 会拒绝 manifest。
- 34/35 次之前的离线测试记录按对应文档保留；本轮没有重跑旧套件。

**建议路线：继续使用现有 Sign-YuTangCandidate.ps1 + yutang-manifest.mjs + empty reviewed registry。不要把 Drive 上的 V4 独立 kit 直接加入发布流程。** 将 V4 的 DER SPKI pin 检查作为单独的小改进评估，并补齐客户端内嵌公钥的独立证据。

## 6. SSLmentor / Certum 最新状态

### 邮件证据
- SSLmentor 2026-11-14 回复：塞尔维亚居住原则上可申请；若身份证件没有地址，供应商表示租赁合同可用，银行流水也可考虑；供应商明确说自己不是 CA validation team。
- 供应商同一邮件对 Serbia case 回复 `no vat`，但尚未确认最终 payable total 是否准确为 EUR 117 或有无额外 mandatory fee。
- 2026-11-16/17 已向同一邮件线程发送 follow-up，要求书面确认：commercial Standard（非 Open Source-only）产品类型、EUR 117 全包金额、退款扣费、459 vs 460 天、reissue 身份复核、外国国籍塞尔维亚居民证件、SimplySign/SignTool 和 CI/CD 限制。
- 截至本记录复核时，Gmail 未检索到 2026-11-16 之后来自 `info@sslmentor.rs` 的新回复。状态为 `WAITING_FOR_VENDOR_REPLY`，不是已确认。

### 官方/供应商网页
- SSLmentor Individual 页面：列明个人身份照片/人脸验证、utility bill；在没有账单时租赁合同或银行流水可能由 CA 个案裁量接受；证书公开字段含个人姓名、城市、地区和国家，不含完整街道地址。
  - https://www.sslmentor.rs/certum/certumcodecloudindividual
- SSLmentor SimplySign 指引：SimplySign Mobile 提供 OTP；SimplySign Desktop 连接云端证书库；可通过 Microsoft SignTool 手动签名；会话约 2 小时。
  - https://www.sslmentor.rs/help/code-simply-sign
- SSLmentor FAQ：当前称不支持 PFX 导出；私钥留在 Certum 云端；当前不支持 GitHub Actions/CI/CD；每月 5000 次签名限制。
  - https://www.sslmentor.rs/certum/certumcodecloudindividual
- Certum 官方 Standard Code Signing required documents：个人申请人需要以申请人名义开具的 utility bill。该官方页没有明确保证租赁合同/银行流水可替代。
  - https://support.certum.eu/en/code-signing-required-documents/
- Certum 官方 Standard Code Signing in the Cloud：2026-02-27 起单张证书最长 459 天，多年产品需免费 reissue。
  - https://shop.certum.eu/standard-code-signing-in-the-cloud.html
- SSLmentor Individual 页面仍写 460 天，与 Certum 当前 459 天规则不一致，已列入 follow-up。
- SSLmentor Code Signing refund 页面：CA 拒绝签发或取消订单，至少扣 EUR 10；若实际支付手续费更高，则向上取整至 EUR 10 倍数。若申请人不配合/不交文件且 45 天未签发，页面写明固定 EUR 25 处理费。页面未证明另有 25% 扣费；已在邮件中要求供应商确认。
  - https://www.sslmentor.rs/ssl/tc-mbg

## 7. 下一步（不重复旧验收）

1. 等待 SSLmentor 对 follow-up 的书面答复；不提交证件、不购买、不付款。
2. 若答复确认产品、费用和退款可接受，再决定是否购买；CA 最终审核仍不能预先保证。
3. 若决定购买并通过 CA 审核，由证书持有人在本人 Windows 电脑上手动安装 SimplySign、授权 OTP、运行现有签名脚本；OTP、PIN、证书私钥及身份材料不发送到 ChatGPT/GitHub。
4. 先对原始 EXE 进行只读 preflight；经明确授权后，才对副本签名。签名后产生新 SHA，必须对**该新 SHA**重新执行 Windows 2022 与 Windows 2025 的真实 EXE 验收。
5. 生成 update-enabled candidate 时先嵌入受信任 Ed25519 公钥和 Authenticode publisher thumbprint，并独立核实打包结果；真实 signed provenance registry 仍须基于实际 Windows 2022/2025 jobs 和 Artifact 证据复核后才能更新。
6. 真实在线下载、伪造/篡改拒绝、启动健康确认、切换和崩溃回滚仍是独立发布门禁。

## 8. 本轮边界

- 只新增本 review branch 文档。
- 未修改 `main`、EXE、updater trust constants 或正式发布设置。
- 未运行 Windows Actions。
- 未购买证书、提交身份材料或签名。
- 未启用自动更新。
- 正式 Release 仍未创建。
