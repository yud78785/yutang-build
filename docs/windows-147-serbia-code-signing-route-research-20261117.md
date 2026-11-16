# YuTang 1.4.7 正式签名路线复核：塞尔维亚申请条件与成本（2026-11-17）

本记录是公开资料研究，不代表申请资格已获 CA 确认。没有购买证书、创建账户、提交身份材料、配置密钥、签名或触发 Windows Actions。

## 1. 当前 YuTang 发布状态

- 已验收的未签名 EXE：`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`。
- 同一 EXE 已在 Windows Server 2022 / 2025 通过一次真实公开首页加载、浏览器沙盒和进程清理。
- Authenticode：`NotSigned`。
- Ed25519 manifest 公钥：未配置。
- Authenticode Publisher thumbprint：未配置。
- 自动更新：按设计保持 fail closed（安全关闭）。
- 正式 Release：未创建。
- 用户个人 Windows 电脑实测：仍未验收。

签名会改变 EXE 字节和 SHA-256。因此任何正式签名都必须产生新 SHA，并对签名后的新文件重新做 Windows 2022 / 2025 验收，不能继承未签名文件的验收结论。

## 2. Microsoft Azure Artifact Signing

Microsoft 当前 Public Trust 资格规则：

- 组织：列出的支持司法辖区包括美国、加拿大、欧盟、英国、澳大利亚、新西兰、日本、韩国、新加坡、瑞士、挪威和以色列。
- 个人开发者：仅美国和加拿大。
- 塞尔维亚不在该 Public Trust 支持列表中。
- 因此不能把塞尔维亚个人或塞尔维亚注册组织视为 Azure Public Trust 已符合资格；若实际发行法律主体注册在支持地区，应按该法律主体本身的真实登记资料另行判断。
- Private Trust 不等于面向普通 Windows 用户的公开信任证书，不能拿来替代公开发行 Authenticode 信任。

官方来源：
- https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- https://learn.microsoft.com/en-us/windows/msix/package/sign-msix-package-guide

## 3. SSL.com IV Code Signing：当前最值得先做书面预确认的个人开发者路线

SSL.com 官方产品页目前公开列出：

- IV Code Signing：`USD 129 / year`。
- 不要求注册公司；证书显示经验证的个人姓名。
- 需要政府签发的身份证明和个人身份验证。
- 可用 FIPS 硬件令牌，或 eSigner for Code 云端 HSM。
- eSigner Tier 1 当前页面显示 `USD 15 / month`，包含 240 次签名；新证书有 30 天免费期，之后另计订阅费用。
- YubiKey 硬件令牌当前页面显示 `USD 379`。
- eSigner CKA 支持 GitHub Actions + signtool.exe；私钥保留在 SSL.com 云 HSM，不导出到仓库或 runner。

官方页面：
- IV Code Signing 产品及价格：https://www.ssl.com/products/software-integrity/code-signing/iv/
- eSigner for Code 及订阅价格：https://www.ssl.com/products/software-integrity/signing-service/
- 身份验证说明：https://www.ssl.com/guide/identity-validation-for-ssl-com-certificates-a-complete-guide/
- 国家代码列表：https://www.ssl.com/country-codes/

**塞尔维亚资格边界：**

- SSL.com 国家代码列表包含 Serbia / RS，且 Serbia 不在该页面列出的出口限制国家中。这说明国家代码本身可用，但**不能单独证明塞尔维亚居民或某一国籍个人一定能通过 IV Code Signing 身份审核**。
- SSL.com 身份验证指南提供自动验证与手工提交路径；手工验证要求政府签发的带照片身份证明，并需核验姓名、地址、出生年份和照片。其公开指南没有明确列出塞尔维亚身份证件类型。
- 因此目前只能列为**有希望、待书面确认**，不能当作已确认可签发或最终价格。

建议先向 SSL.com 销售/验证团队书面询问，不下单：
1. 居住在塞尔维亚的个人是否可以申请 IV Code Signing？
2. 若申请人国籍与居住国不同，是否接受其本国护照及塞尔维亚居留证明？
3. 是否可走人工身份验证；接受哪些证件组合？无需在预售咨询中先发送证件。
4. 对塞尔维亚申请人的最终证书价格、税费、硬件令牌/云签名总费用、续期费用分别是多少？
5. eSigner for Code 是否可用于本项目 GitHub Actions 的 Windows 2025 签名工作流，是否有账户地区限制？

## 4. Sectigo OV Code Signing

Sectigo 2026-06-02 的官方说明确认，OV Code Signing 可签发给个人、私营组织和注册企业。个人申请通常需要 Video ID 与政府签发照片 ID；地址和联系信息也必须能独立验证。组织申请则需核实法律实体、登记辖区、地址及代表授权。

官方来源：
- https://www.sectigo.com/faqs/detail/OV-Code-Signing-Validation-for-Organizations-and-Individuals

这是一条备选路线，但当前公开资料没有确认本项目的塞尔维亚申请人具体资格、总价或签发周期。不能仅凭“个人可申请”推定塞尔维亚一定可签发。

## 5. GlobalSign

GlobalSign 当前官方 Code Signing 商店页明确写明：其 Code Signing 证书只签发给合法注册组织，并要求按公司注册所在地选择区域。按当前公开政策，它不是个人发行主体的优先路线。

官方来源：
- https://shop.globalsign.com/en/code-signing

## 6. 推荐决策

**当前不购买任何证书。**

若 YuTang 以个人名义发行，先对 SSL.com IV Code Signing 做无证件、无付款的书面资格确认。原因是它有明确个人产品、公开价格、国家代码列表包含 RS，并有可接 GitHub Actions 的云端 HSM 签名方案；但塞尔维亚身份文件的最终接受仍待 SSL.com 确认。

若以塞尔维亚注册公司发行，则优先取得 Sectigo OV 的书面预审与完整报价；不要假定 Azure Public Trust 对塞尔维亚公司开放。GlobalSign 当前公开 Code Signing 商店只支持注册组织。

若用户不愿向任何 CA 直接提交政府身份证明，公开信任代码签名将继续阻塞。此时应继续保留未签名候选用于受控内部测试，不能用自签证书冒充公开信任，也不能绕过 Windows 签名门禁。

## 7. 正式签名后的强制步骤

1. CA 直接向发行主体完成身份审核；ChatGPT 不收集、不保存身份证件、证书私钥、令牌 PIN 或密码。
2. 证书私钥必须由 CA 硬件令牌或受控云 HSM 保管，不进入 Git 仓库、GitHub Artifact、EXE 或聊天。
3. 将公开 Publisher thumbprint 与独立 Ed25519 manifest 公钥配置到客户端；私钥保留在受保护签名环境。
4. 对唯一候选 EXE 进行 Authenticode 签名和可信时间戳。
5. 重新计算签名后 EXE SHA-256；生成并独立签署绑定该 SHA、版本、源提交、构建 Run / Artifact 和 Publisher thumbprint 的 manifest。
6. 在 Windows 2022 / 2025 对**签名后的新 SHA**分别验证 Authenticode `Valid`、Publisher thumbprint、manifest 拒绝篡改和错误发布者。
7. 再进行真实在线升级、健康回执、启动失败回滚与用户数据保留端到端验收。
8. 完成后仍需单独授权正式 Release。

本轮仅新增本研究文档；没有购买、身份验证、签名、运行 Windows Actions、合并或修改 `main`。
