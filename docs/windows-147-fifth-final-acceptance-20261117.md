# YuTang 1.4.7 Windows 2025 第五轮真实公开网页最终验收回执

> 记录日期：2026-11-17。状态：**PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY（仅 Windows 2025 云端单次公开首页加载）**。这是本轮实际日志复核结果，不是 Windows 个人电脑或正式发布验收。

## 1. 唯一被测 EXE 与来源

- 产品：YuTang 1.4.7 原始未签名便携式候选 EXE；本轮未重新构建或修改 EXE。
- 文件名：`Dafeiyu-Douyin-API-1.4.7-win-x64.exe`
- 大小：`125446071` bytes
- **EXE SHA-256：`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`**
- 候选源码提交：`9cc16d7e64d59dc141e9c6687b8dd461934fcc35`
- 来源 Actions Run：[43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930)
- Windows 2025 构建 Artifact ID：`14092434238`；ZIP digest：`sha256:718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`。
- 同一个 EXE 已在上面的来源 Run 的 Windows 2025 构建与 Windows 2022 跨平台生命周期作业中验收通过；注意 Windows 2022 自己**独立构建**的是另一个哈希，不能混用。

## 2. 第五轮实际云端工作流

- 实验分支：`experiment/windows-147-public-web-fifth-20261115`
- 仅用于激活第五轮的提交：`924963f01842c6a98f0e9d8d78281924d9825d48`
- 测试源码固定提交：`d523b38f8eee385fce7587b6fd0a7c639da3c721`（**不同于 EXE 来源提交**）
- 实际运行：[43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361)
- 作业 ID：`132596128747`
- 系统：GitHub Actions Windows Server 2025（`10.0.26100`）
- GitHub Job：completed / success；全部作业步骤 success。
- 被测 EXE 在启动前完成文件名、字节数和 SHA-256 原样复核。
- Windows runner 执行本轮探针的 68 项拒绝路径 / 单元测试：`68 pass, 0 fail`。这些测试不能单独证明真实 EXE 已启动；下面以真实探针日志判定。

## 3. 从原始作业日志核对的实际结果

原始日志出现如下连续回执（2026-11-14 UTC）：

- `WINDOWS_PUBLIC_PAGE_GATE_OK`：`httpStatus=200`、`rendered=true`、`cleanupPending=true`。
- `WINDOWS_PUBLIC_WEB_CLEANUP_OK`：`verifiedDesktop=true`；`trackedCandidateProcessCount=24`，`trackedProcessesRemaining=0`，`cdpListenersRemaining=0`，`isolatedDirectoriesRemoved=true`。
- `WINDOWS_PUBLIC_WEB_EXE_RECEIPT`：`status=PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY`；`exeSha256=3201d433...dc241a34`；`documentHttpStatus=200`；`renderedPage=true`；`rendererSandboxVerified=true`；`networkServiceAppContainer=true`；`networkServiceLowIntegrity=true`；`cdpLoopbackOnly=true`；`noResidualCandidateProcesses=true`；`trackedEdgeProcessCount=10`；`accountUsed=false`；`modelKeyUsed=false`；`videoPlaybackClaimed=false`；`personalComputerAcceptance=false`；`releaseAuthorized=false`。

**结论：** 同一原始未签名 EXE 在 Windows 2025 GitHub runner 上通过这一次真实的 `www.douyin.com` 公开首页 HTTP 200、渲染、浏览器沙盒和退出清理检查。验收范围仅为首页；不能扩大为真实视频播放、真实评论、完整视频理解、自动浏览或用户 Windows 本机实测。

## 4. 历史失败不得覆盖

- 第三轮 Run：[43630798705](https://github.com/yud78785/yutang-build/actions/runs/43630798705)：failure。
- 第四轮 Run：[43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515)：failure；原始日志为 `PUBLIC_PAGE_NOT_FULLY_LOADED`，页面只达到 `interactive`，未达到要求的 `complete`；48/48 单元测试通过**不等于**真实网页通过。
- 第五轮的成功不删除历史失败，且 **单次成功不证明长时间/多次重启统计可靠性**。第五轮采用新的已固定测试源码，EXE 二进制保持同一 SHA。
- 不继续重复同一 Windows 2025 的公开首页验收，除非候选 EXE/hash、安全判据改变，或新故障证据要求复验；必要时应注明版本差异和原因。

## 5. 尚未通过 / 阻塞

1. Windows 2022 对**同一 EXE 的真实公开网页加载**本轮没有运行：`UNVERIFIED`（此前 Windows 2022 上的离线 Edge 沙盒/进程生命周期跨平台测试已通过，不应重跑）。
2. 个人 Windows 电脑上针对该准确 EXE 的实际安装/启动/退出：`UNVERIFIED`。用户没有可用 Windows Sandbox；不得以未经允许的普通测试账号替代，不得称 GitHub runner 为用户现场。
3. 正式 Authenticode 发布者签名及签名后新 SHA 的双平台验收：`BLOCKED`（暂无确认可用的正式证书与发布者身份）。
4. 真实签名发行清单、公钥/Publisher thumbprint 配置、在线更新/升级、启动失败回滚端到端：`UNVERIFIED`。目前自动更新故意 fail closed（关闭），并非更新验收已通过。
5. 真实视频/评论、模型理解或自主决策不属于本轮公开首页安全验收；不得由该回执推定通过。
6. 官方 GitHub Release：尚无；`main` 保持 `4745ed23cbb748cb4b070ed70390703d1261aea0`。

## 6. 下一步及安全边界

- **立即工作：归档这次已通过的 Windows 2025 公开首页与清理回执，避免重复收费；保留失败记录与精确 SHA。**
- 当前可不耗费新的 Windows CI 额度进行只读代码与发布门禁检查。
- 正式签名、私钥、公钥配置、真实在线更新和发布，在外部条件及单独授权明确之前保持关闭。
- 只有具备合法安全的用户本机隔离验收环境时，才按同一候选哈希核实用户电脑现场；不代替用户下载安装，不擅自操作本机。
- 本记录只新增在第五轮隔离实验分支的 `docs/` 路径，不修改 `main`、工作流或 EXE，不触发新的 Windows 2022/2025 运行。


## 9. 2026-11-17 Windows 2022 same-binary live-page result (supersedes section 5 item 1)

The Windows 2022 live public-homepage check was subsequently authorized and completed successfully. The earlier `UNVERIFIED` entry above accurately described the state at the time this report was first written; it is now superseded by the following evidence:

- Windows 2022 Run: [43927596418](https://github.com/yud78785/yutang-build/actions/runs/43927596418)
- Job: `133511097653`
- Run / Job: completed / success
- Test source: `d523b38f8eee385fce7587b6fd0a7c639da3c721`
- Exact original EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` (unchanged)
- Artifact source, artifact ID, ZIP digest, EXE byte count and EXE SHA-256 all verified before execution.
- Node.js: `22.23.4`; negative-path suite: `68 pass, 0 fail, 0 skipped`.
- Actual page gate: HTTP 200 and rendered.
- Sandbox: Renderer verified; Network Service AppContainer and Low Integrity verified.
- Cleanup: 24 candidate processes tracked, 0 remaining; CDP listeners 0; isolated directories removed.
- Final receipt: `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY`.
- No account or model key; no video playback claim; no personal-computer acceptance; no release authorization.

**Updated cross-platform conclusion:** the same immutable unsigned EXE SHA has now passed one real public-homepage load, sandbox check and complete candidate cleanup on both Windows Server 2025 (Run `43643545361`) and Windows Server 2022 (Run `43927596418`). This does not establish personal-PC acceptance, Authenticode trust, real video/model comprehension, online update or release readiness.

Full combined record: [Windows 2022 / 2025 same-EXE acceptance](https://github.com/yud78785/yutang-build/blob/experiment/windows-147-public-web-2022-one-shot-20261117/docs/windows-147-same-exe-public-web-cross-platform-acceptance-20261117.md).
