# YuTang 1.4.7 同一 EXE Windows 2022 / Windows 2025 真实公开网页验收记录

记录日期：2026-11-17

## 1. 最终结论

**同一个原始未签名 EXE，已分别在 GitHub Actions Windows Server 2025 和 Windows Server 2022 上完成一次真实公开首页加载、沙盒检查与完整清理。**

验收范围仅为公开首页；不是视频播放、评论采集、模型理解、个人 Windows 电脑安装或正式发布验收。

## 2. 唯一二进制身份（两平台完全一致）

- 产品：YuTang 1.4.7 portable candidate
- 文件：`Dafeiyu-Douyin-API-1.4.7-win-x64.exe`
- EXE bytes：`125446071`
- **EXE SHA-256：`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`**
- 来源产品提交：`9cc16d7e64d59dc141e9c6687b8dd461934fcc35`
- 原始构建 Run：[43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930)
- Windows 2025 Artifact：`14092434238`
- ZIP size：`125575315`
- ZIP SHA-256：`718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`

Windows 2022 作业先验证来源 Run、Artifact ID、名称、大小、ZIP digest、来源提交和未过期状态，再下载文件并在执行前核对 EXE 文件名、字节数及 SHA-256。执行时没有重新构建、修改或签名 EXE。

## 3. Windows 2025 真实公开网页验收

- Run：[43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361)
- Job：`132596128747`
- 测试系统：Windows Server 2025
- 测试源码：`d523b38f8eee385fce7587b6fd0a7c639da3c721`
- 实际回执：`PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY`
- `WINDOWS_PUBLIC_PAGE_GATE_OK`：HTTP 200，`rendered=true`
- `WINDOWS_PUBLIC_WEB_CLEANUP_OK`：24 个候选进程已追踪，剩余 0；CDP listeners 0；隔离目录已删除。
- 沙盒回执：Renderer verified；Network Service AppContainer 与 Low Integrity verified。
- 真实页面范围：`https://www.douyin.com/` 公开首页；未登录、未使用模型 Key、未声称视频播放。

## 4. Windows 2022 同一 EXE 真实公开网页验收

- Run：[43927596418](https://github.com/yud78785/yutang-build/actions/runs/43927596418)
- Job：`133511097653`
- 激活提交：`67ba14a63aba14828e2d701cf2dc5e78b3ef9866`
- 测试源码固定：`d523b38f8eee385fce7587b6fd0a7c639da3c721`
- Windows：Microsoft Windows Server 2022
- Node.js：`22.23.4`
- Run / Job：completed / success
- 原始 EXE SHA-256：与第 2 节完全相同
- Artifact 来源校验：通过
- EXE 文件名、125446071 bytes 和 SHA-256：通过
- 68 项拒绝路径 / 单元测试：`68 pass, 0 fail, 0 skipped`
- `WINDOWS_PUBLIC_PAGE_GATE_OK`：HTTP 200，`rendered=true`
- `WINDOWS_PUBLIC_WEB_CLEANUP_OK`：`verifiedDesktop=true`；24 个候选进程被追踪；`trackedProcessesRemaining=0`；`cdpListenersRemaining=0`；`isolatedDirectoriesRemoved=true`。
- 最终回执：`PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY`
- Renderer sandbox verified：true
- Network Service AppContainer：true
- Network Service Low Integrity：true
- CDP loopback only：true
- No residual candidate processes：true
- tracked Edge process count：10
- accountUsed：false
- modelKeyUsed：false
- videoPlaybackClaimed：false
- personalComputerAcceptance：false
- releaseAuthorized：false

## 5. 历史失败仍保留

下列失败记录不删除，也不因后续成功而改写：

- Run `43616296326`：失败。
- Run `43627404909`：失败。
- Run `43630798705`：失败。
- Run `43634463515`：失败；公开页面仅达到 `interactive`，未达到要求的 `complete`。

第五轮 Windows 2025 和本轮 Windows 2022 是后续独立真实执行，使用同一原始 EXE SHA；历史失败保留为调试轨迹。

## 6. 验收矩阵更新

| 验收项 | Windows 2025 | Windows 2022 |
|---|---|---|
| 同一 EXE SHA | 通过 | 通过 |
| 真实公开首页 HTTP 200 | 通过 | 通过 |
| 页面真实渲染 | 通过 | 通过 |
| Renderer 沙盒 | 通过 | 通过 |
| Network Service AppContainer | 通过 | 通过 |
| Network Service Low Integrity | 通过 | 通过 |
| CDP loopback | 通过 | 通过 |
| 候选进程清理 | 24 tracked / 0 remaining | 24 tracked / 0 remaining |
| CDP listener 清理 | 0 | 0 |
| 隔离目录清理 | 通过 | 通过 |

**更新后的准确结论：同一原始 EXE 已通过 Windows 2022 与 Windows 2025 的一次真实公开首页加载、安全沙盒与进程清理验收。**

## 7. 尚未通过或仍需独立验收

1. 用户个人 Windows 电脑上的实际安装、启动与退出：`UNVERIFIED`。
2. 正式 Authenticode 签名：当前候选仍为 `NotSigned`。
3. 签名后新 EXE 的 SHA-256 及双平台验收：未执行。
4. Ed25519 发布清单的正式公钥配置与可信签名：未配置。
5. 真实在线更新、安装切换、启动健康确认与崩溃回滚：未完成端到端实测；更新仍保持 fail-closed。
6. 视频播放、评论读取、音频理解、模型推理和自主决策：不属于本轮网页验收，不能推定通过。
7. 正式 GitHub Release：无；`main` 未修改。

## 8. 下一步

- 不重复 Windows 2022 / 2025 的同一 EXE 公开首页测试，除非 EXE SHA、安全判据或实际故障发生变化。
- 保全原始 ZIP、EXE 与回执；当前原始 GitHub Artifact 的到期时间为 `2026-11-21T01:50:44Z`。
- 继续做只读发布门禁检查；签名、真实更新和用户电脑现场测试保持独立。
- 本记录提交仅写入本实验分支的 `docs/`，不修改 `main`，不触发新 Windows Actions，不创建 Release。

