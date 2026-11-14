# YuTang 1.4.7 | Windows 签名与 Ed25519 发布清单准备包（离线、未发布）

**版本：SOURCE-ONLY-V2（2026-11-15）。仅供发布前准备，不是签名证书、签名 EXE、正式发布授权或 Windows 验收回执。**

## 一、当前确认证据

- 原始、未签名、尚未发布 EXE：`Dafeiyu-Douyin-API-1.4.7-win-x64.exe`
- 文件大小：`125446071` bytes
- SHA-256：`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`
- 源码候选：`9cc16d7e64d59dc141e9c6687b8dd461934fcc35`
- 原始打包 GitHub Actions：[43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930)
- Windows 2022/2025 离线安全与生命周期：原始 Run 通过；Edge 外网阻断
- Windows 2025 真实 www.douyin.com 公网首页 + Renderer/AppContainer/Low Integrity/loopback + 清理：[43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361) 通过，单次，原 SHA 相同
- Windows 2025 单测 68/68 通过。Windows 2022 本轮未重跑公网首页
- **没有真实 Authenticode 签名，没有 Ed25519 正式私钥，没有配置线上更新信任，没有 Windows 签名后 EXE 验收**

## 二、Certum / SSLmentor 现状

- SSLmentor Individual Cloud Code Signing：网站标价 **117 EUR / 一年，未含 VAT**。
- 支持于 2026-11-14 邮件回答：就塞尔维亚居住的非塞尔维亚国籍个人，**Serbian residence is OK**、**no VAT**；地址可接受租赁合同或银行流水等，但 **验证团队另行审核**。并非订购批准或最终账单。
- Certum 云密钥采用 SimplySign 手机 + Desktop 手动授权，连接约 2 小时；不可导出 PFX。不默认支持无人工批准的 CI 全自动签名。
- 官方通知称 2026-02-27 以后代码签名证书的最大有效期为 459 天（网站有 460 天产品文案）。一年的产品一般无需为此补发；多年度需 reissue / 可能重新验证身份。
- 证书公开字段包括个人法定姓名、城市、地区和国家；**不在聊天或仓库上传身份资料**。
- 未确认：订单最终应付发票总额、退款扣费明细、具体证书主体/有效性、SmartScreen 声誉、续签指纹更新细则。
- 核对来源：
  - https://www.sslmentor.rs/certum/certumcodecloudindividual
  - https://www.sslmentor.rs/help/code-faq
  - https://www.sslmentor.rs/help/code-simply-sign
  - https://www.certum.eu/en/news/shortening-code-signing-certificate-validity/
  - 用户邮箱里 2026-11-14 SSLmentor 客服与用户的往来（邮件不含身份资料）。

## 三、Windows Authenticode 签名（未来手动步骤，**现在不执行**）

1. 取得真实 Certum Individual code-signing 证书；验证团队接受身份/地址文件后，安装并授权 SimplySign Mobile + Desktop，确认签名证书出现在**当前用户的个人证书存储**。不得要求用户导出 PFX 或把 2FA/token 发到聊天或 CI。
2. 下载哈希已确认的 EXE，**复制到独立发布暂存目录**。先核对复制前后 SHA-256 一致，绝不直接覆盖历史通过候选。
3. 从 Windows SDK 安装的 `signtool.exe` 和已验证的证书指纹中手动选择**唯一证书**。不要使用自动 `/a` 选择其他证书。以下只作模板，绝不预填或创建假证书：

   ```powershell
   # 仅在证书签发和用户明确确认后，由用户在其 Windows 会话手工执行：
   & '<Windows SDK 中 signtool.exe 的完整路径>' sign /sha1 '<真实代码签名证书指纹>' /fd SHA256 /tr http://time.certum.pl /td SHA256 /v '<独立暂存目录中的待签名 EXE>'
   & '<Windows SDK 中 signtool.exe 的完整路径>' verify /pa /v '<同一暂存 EXE>'
   Get-AuthenticodeSignature -LiteralPath '<同一暂存 EXE>'
   Get-FileHash -LiteralPath '<同一暂存 EXE>' -Algorithm SHA256
   ```

4. **必须先核实真实证书身份、EKU=Code Signing、信任链、签名状态=Valid、RFC3161 时间戳以及新 EXE SHA-256**。签名后 EXE 内容变化，旧 SHA 的所有验收不能替代新 SHA。若有效性/时间戳不确认，立即停止发布。
5. 同一个**签名后** EXE 分别在 Windows 2022 和 Windows 2025 验证（同一 SHA、真实启动、Renderer/NetworkService、CDP、强杀、清理）。之后才能讨论真实下载/升级/回滚。

Microsoft SignTool 官方说明：https://learn.microsoft.com/windows/win32/seccrypto/signtool

## 四、独立 Ed25519 更新清单工具

`tools/windows147-release-manifest-kit.mjs` 仅准备 `yutang-update-manifest.json`、`yutang-update-manifest.sig`、`yutang-update-manifest.public.pem`。**不会对 EXE 执行 Authenticode 签名，也不会购买、下载或发布任何内容**。默认 CLI 只在 Windows 上运行，并会调用系统 `Get-AuthenticodeSignature`。没有真实 `Valid` 的代码签名、正确指纹、代码签名 EKU 和时间戳证据就拒绝输出。

在最终签署前，发布者须将独立 Ed25519 私钥保存在仓库之外的受保护路径，绝不上传私钥/证书口令或将其保存在 GitHub CI Artifact。私钥生成应由受控系统管理；该脚本**不生成正式私钥**。

在安全的 Windows 签名环境中，创建一个本地 JSON 配置（参考 `sample-public-config.invalid.json`，其占位符刻意无效），内容只包含**公开来源提交、版本、候选 run/artifact ID 和公开证书 thumbprint**。先确认版本、签名后 EXE 名称以及 updater 清单 schema 完全一致。然后由持有者本地手工执行：

```powershell
node tools/windows147-release-manifest-kit.mjs '<配置 JSON 绝对路径>' '<已签名 EXE 绝对路径>' '<仓库外 Ed25519 私钥绝对路径>' '<尚不存在的输出目录绝对路径>'
```

输出目录会创建为**新**目录；已有同名目录将被拒绝。核对生成清单的 SHA 和 `.sig` 的 Ed25519 签名；将 `yutang-update-manifest.public.pem` 的公钥安全嵌入下一版更新客户端。**不要把公钥文件当私钥，勿将私钥复制到仓库**。生产环境仍需在 Windows 2022/2025 对签名后 EXE 和本清单重新端到端验收。

特别注意：当前 1.4.7 EXE 的 `UPDATE_MANIFEST_PUBLIC_KEY` / `UPDATE_PUBLISHER_THUMBPRINT` 仍为空，**即使手动签署原始 1.4.7 EXE，它也不会因此自动获得可信在线更新能力**。要开放更新，需要构建携带真实 Ed25519 公钥和发布者指纹的新候选，按新 SHA 重新验收，升级版本号，再证明旧版到新版的更新路径。不能为“尽快通过”临时关闭签名拒绝规则。

## 五、本包测试范围

- `node --check` 源码与测试文件通过。
- `node --test tests/windows147-release-manifest-kit.test.mjs`：**19/19 通过**，临时生成测试 Ed25519 密钥与合成 EXE，覆盖签名验证、证书不匹配拒绝、SHA 篡改拒绝、路径/权限限制（包括间接符号链接重定向防护）、覆盖阻断、签署期间文件修改保护和真实平台限制。
- 这些是**Linux Node 源码/合成测试**，通过注入明确的假 Authenticode 证据来验证拒绝逻辑，**不是 Windows 的真实证书、真实 EXE 或生产端到端验收**。

## 六、安全边界

**当前没有**购买证书、申请身份验证、提交身份资料、签名生产 EXE、提供可用发行私钥、合并 `main`、创建 Release、打开自动更新、启动 GitHub Windows CI 或操作你的个人电脑。

## 七、V2 安全补强

新增对输出目标父目录的 **真实文件系统路径**（`realpath`）校验，禁止输出路径通过中间符号链接指向项目内，避免将清单材料写入源码目录。新增反向符号链接场景与合法外部目录场景两个回归，离线测试由 17/17 增至 **19/19**。这属于源码防护与合成测试，不是 Windows 原生签名实测。

V2 不能保证对恶意并发进程篡改目录的所有竞态都原子防御；正式发布必须在仅签名负责人可写的受控签名环境执行，并对生成的文件做二次校验。

## 八、V3：真正的嵌入式 Authenticode 双重验证（2026-11-15）

本节覆盖旧版的单一 `Get-AuthenticodeSignature` 信任判断，保留前述所有拒绝条件。

**修复原因：** Microsoft 明确说明 `Get-AuthenticodeSignature` 在文件同时具有嵌入签名及 Windows Catalog 签名时可能优先报告 Catalog。独立分发的 Windows EXE 不能依赖当前机器的 Catalog。因此 V3 只接受 `SignatureType = Authenticode`，并且必须由 Windows SDK 的 `signtool.exe verify /pa /tw` 对该 EXE 成功验证。两项校验在同一文件 SHA-256 之前/之后进行；任何缺少工具、错误、警告、缺少时间戳、签名身份不匹配均拒绝输出。

Microsoft 原始定义：
- https://learn.microsoft.com/powershell/module/microsoft.powershell.security/get-authenticodesignature
- https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.signaturetype?view=powershellsdk-7.4.0
- https://learn.microsoft.com/windows/win32/seccrypto/signtool
- https://learn.microsoft.com/en-us/windows/win32/seccrypto/using-signtool-to-verify-a-file-signature

**仅在真实签发的证书、隔离的已签名 EXE 以及可信 SDK 已具备之后**，手动从已安装的官方 Windows SDK 确认 `signtool.exe` 的真实安装位置，在当前 PowerShell 会话设置绝对路径（不得把密钥写入变量），例如：

```powershell
$env:YUTANG_SIGNTOOL_PATH = 'C:\Program Files (x86)\Windows Kits\10\bin\<已安装 SDK 版本>\x64\signtool.exe'
# 此路径中版本号是占位符；必须换成当前机器实际存在且来源可信的 SDK 文件。
# 然后再按上文第四节执行本工具的 node 命令。
```

V3 强制 `YUTANG_SIGNTOOL_PATH` 为完整绝对路径且文件名为 `signtool.exe`，不从 PATH 随机寻找。**仅检查名称和绝对路径并不自动保证这份 SignTool 是微软官方文件**；操作者仍须在受控 Windows 签名环境核实 SDK 可信来源和 SignTool 自身签名。`SignTool /tw` 的任何警告都必须阻止发布，不得把警告当成通过；是否确为 RFC 3161 SHA256 时间戳仍应结合签署命令和 Windows 实际结果独立核对。

新增测试将原 **19/19** 扩为 **23/23**，使用模拟的 PowerShell 与 SignTool 响应覆盖正反例。它不能证明系统本机已安装 SignTool，更不能证明真实 Certum 证书、真实时间戳或签名后 EXE 在 Windows 2022/2025 的行为。原始 unsigned EXE SHA 保持不变，`main`、自动更新、Release 仍然未开启。
