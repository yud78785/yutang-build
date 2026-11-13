# YuTang 1.4.7 Windows AppContainer / Low Integrity / HTTPS 验收记录

- 验收日期：2026-11-14
- 仓库：`yud78785/yutang-build`
- 候选来源运行：[`43467660911`](https://github.com/yud78785/yutang-build/actions/runs/43467660911)
- 候选来源提交：`1c332d55a88c4be2f3bbffda60548ced52b1f061`
- 本轮验收运行：[`43488935750`](https://github.com/yud78785/yutang-build/actions/runs/43488935750)
- 本轮验收执行时的实验分支提交：`904f8c630ff6a04e663eaaed61b02270add7eefa`
- 验收结论：双平台专项工作流 completed / success
- 发布状态：仅候选证据，不是正式发布

## 1. 候选 EXE 身份

本轮没有重新构建 EXE；直接下载并验证了上一轮已完成 Windows 实测的 1.4.7 候选产物。两个平台的候选 SHA-256 在本轮预检、原始回执和本轮结果 JSON 中一致。

| 平台 | Artifact ID | EXE SHA-256 |
|---|---:|---|
| Windows 2022 | `14060020678` | `f153896ecb7687d35f8f1b0b66ead1470fe91f611fcb2bf515f4e90c57b5f043` |
| Windows 2025 | `14059508987` | `c2cd51f7449a3ddc4413b4e06d1ea30ae9bbb070e11b7aee540788b9d3f71ef0` |

本轮专项证据 Artifact：

- Windows 2022：`14068527638`
- Windows 2025：`14068537542`

## 2. Windows 原生安全检查

两台系统的最终结果一致：

| 检查项 | Windows 2022 | Windows 2025 |
|---|---|---|
| Renderer AppContainer / Lockdown / Untrusted | 通过，3 个 Renderer | 通过，3 个 Renderer |
| Network Service sandbox 类型 | Network | Network |
| Network Service AppContainer | 通过 | 通过 |
| Network Service Low Integrity | Low | Low |
| Integrity RID | `4096` (`0x1000`) | `4096` (`0x1000`) |
| Network Service 进程归属 | 通过 | 通过 |
| Chromium 标准 AccessCheck 分类 | 普通 AppContainer | 普通 AppContainer |
| AccessCheck 返回值 | `3` | `3` |
| LPAC | 未启用 | 未启用 |

两台系统的 Network Service AppContainer SID：

`S-1-15-2-3198793396-582522597-508027057-302141039-3877798213-2012702509-1749897405`

LPAC 分类采用 Chromium 上游 `CheckLpacToken` 所使用的 AccessCheck 语义，不是通过未经验证的令牌字段猜测。返回值 `3` 表示普通 AppContainer；本轮没有把它误报为 LPAC。

## 3. 真实 Edge 公网 HTTPS 检查

测试由候选 EXE 启动并由候选运行环境中的 Edge 执行，访问公开测试页 `https://example.com/`。不是 Node 单独发起的网络请求。

| 检查项 | Windows 2022 | Windows 2025 |
|---|---|---|
| DNS 解析 IP | `104.20.23.154` | `172.66.147.243` |
| HTTP 状态 | `200` | `200` |
| HTTP 协议 | `h3` | `h2` |
| 安全传输 | TLS 1.3 over QUIC | TLS 1.3 |
| 证书颁发者 | Cloudflare TLS Issuing ECC CA 3 | Cloudflare TLS Issuing ECC CA 3 |
| 页面标题 | Example Domain | Example Domain |
| 页面正文与响应体 | 通过 | 通过 |
| CDP 请求 / 响应事件 | 2 / 2 | 2 / 2 |

Windows 2022 使用 HTTP/3（h3）与 QUIC。QUIC 的 TLS 安全握手按 RFC 9001 使用 TLS 1.3；不能因为 Chromium DevTools 将 `securityDetails.protocol` 显示为 `QUIC`，就把它误判为没有 TLS。

本轮没有修改 Windows 防火墙策略。

## 4. 进程与浏览器清理

| 检查项 | Windows 2022 | Windows 2025 |
|---|---|---|
| Edge 进程数量 | 7 | 7 |
| CDP 仅绑定 loopback | 通过 | 通过 |
| 禁用沙盒参数 | 0 个 | 0 个 |
| NetworkServiceSandbox 启动参数 | 存在 | 存在 |
| Browser-host 正常退出 | 退出码 0 | 退出码 0 |
| Edge / host / 候选清理 | 通过 | 通过 |
| 最终进程与监听残留 | 0 | 0 |

## 5. 安全边界

本轮结果 JSON 确认：

- 未使用真实账号。
- 未调用真实模型。
- 未发送真实消息。
- 未访问或登录抖音。
- 未修改防火墙策略。
- 未操作用户个人电脑。
- 未重新构建或替换候选 EXE。
- 未发布正式 Release。

候选 EXE 仍为未签名候选，不应将本轮安全专项通过解释为代码签名、正式发布或个人电脑安全验收通过。

## 6. LPAC 决策

**当前不升级 LPAC。**

理由：

1. 普通 AppContainer + Low Integrity 已在 Windows 2022 和 Windows 2025 取得真实令牌证据。
2. 两台系统上的真实 Edge 均成功完成公网 HTTPS 请求。
3. LPAC 会改变资源与能力访问边界；当前没有证据表明必须升级才能满足本轮目标。
4. 为追求更严格的标签而改变当前有效配置，会增加兼容性风险，没有必要。

保留当前配置作为 1.4.7 双平台安全基线。若未来有新的威胁模型要求，再单独评估 LPAC，不在本轮候选中修改。

## 7. 后续仍未验收的事项

- 正式代码签名与发布信任链。
- 个人 Windows 电脑上的一般安全与兼容性。
- 真实抖音视频播放与站点特定访问（本轮只访问 example.com）。
- 真实模型推理及自主行为（本轮明确没有执行）。

本轮只关闭“当前候选 Edge 的 AppContainer / Low Integrity 身份、LPAC 语义分类、真实公网 HTTPS 和专项进程清理”这组验收项。
