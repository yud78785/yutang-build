# YuTang 抖音云端优先：先复用开源成熟方案

日期：2026-11-18  
状态：**方案选定，尚未部署/未进行真实数据闭环验收**  
项目：`yud78785/yutang-build`；本文件位于独立研究分支，不覆盖现有 Windows 候选，不修改 `main`。

## 决策（改变以前的工作方式）

遇到平台读取、评论、视频下载和转写障碍，**先查官方文档与成熟开源仓库，复用上游**，不再先编写专用网页采集器。只有上游不支持且有真实失败证据，才开发小型适配代码。

产品采用两个互不混淆的能力路径：

1. **视频链接 → 已有数据接口 → 视频/评论/可下载媒体 → 云端转写、取帧和模型理解。** 对固定视频的分析无需先让远程 Edge 页面播放；不得把“下载并分析视频”冒充“实时浏览器自动观看成功”。
2. **真实网站浏览（独立、备用）：** 在前一条路径无法满足浏览交互时，用官方 Playwright Docker + 有界面 noVNC（只读、非 root、沙盒）观察浏览器，保存实际媒体进度。默认不运行，不能把 HTTP 200 当成画面播放成功。

## 上游优先级、证据及许可证

**主方案：Evil0ctal/Douyin_TikTok_Download_API**

- 仓库：https://github.com/Evil0ctal/Douyin_TikTok_Download_API
- 首选固定 **v5.1.11**（截至核验时 GitHub 最新正式发行版，发布于 2026-11-08；固定版本而非追踪 latest）。发行说明：https://github.com/Evil0ctal/Douyin_TikTok_Download_API/releases/tag/v5.1.11
- 许可证 **Apache-2.0**，可修改及在相应条款下用于商业作品；仍须遵守平台规则及作品权利。
- 官方中文上手教程：https://github.com/Evil0ctal/Douyin_TikTok_Download_API/blob/v5.1.11/documents/zh/01-quickstart.md
- 官方部署规格：https://github.com/Evil0ctal/Douyin_TikTok_Download_API/blob/v5.1.11/documents/zh/02-installation.md
- REST 契约：https://github.com/Evil0ctal/Douyin_TikTok_Download_API/blob/v5.1.11/documents/en/11-api.md
- 原生功能：`POST /api/v1/parse`（短链/分享文本等）、`GET /api/v1/douyin/video`、`GET /api/v1/douyin/video/comments`、`GET /api/v1/douyin/video/comments/replies`；下载器与转写器为可选 profile。MCP 支持 `parse_url`、`get_video`、`list_comments`、`download_media`、`transcribe_video` 等工具。
- Docker 部署：宿主机仅需 Docker Compose v2.24+；核心服务可靠预算 **4 GiB RAM**，启用浏览器 profile 建议 **8 GiB RAM**，建议 **15 GB** 可用磁盘。下载器、中文转写器需单独启用。默认服务只绑定 `127.0.0.1:8000`，不直接向互联网公开后台。
- 不凭空声称无需登录即可取得所有数据；可访问范围取决于上游平台、会话和请求环境。不可登录、访问受限、`UPSTREAM_RISK_CONTROL` 等应按失败状态处理，禁止无限轮询或绕开平台限制。
- 公开 demo 只用于功能演示，不作为生产基础设施，也不据其状态断言当前服务已可用。以前演示环境曾报告可用身份为零，不重复消耗公共池。

**备选一：NanmiCoder/MediaCrawler**

- 仓库：https://github.com/NanmiCoder/MediaCrawler
- 文档：https://github.com/NanmiCoder/MediaCrawler/blob/main/docs/index.md
- 抖音视频和评论采集成熟，但许可证为 **NON-COMMERCIAL LEARNING LICENSE 1.1**；仅用来学习架构、公开文档与接口模式，不把源码直接放进潜在商业产品。是否需要扫码登录需按实际功能核验。

**备选二：JoeanAmier/TikTokDownloader**

- 仓库：https://github.com/JoeanAmier/TikTokDownloader
- GitHub 元数据许可 **GPL-3.0**；支持单视频、评论与保存。若要分发或集成必须遵守 GPL 义务，因此不是默认闭源产品依赖。

**视频 AI 参考：RanT711/video-parser**

- 仓库：https://github.com/RanT711/video-parser
- MIT，已有视频时间戳帧、语音转写、结构化解读流程，可学习其分层设计和来源标记；仓库规模小，不能未审计就当成熟生产组件。
- 上游 DTK 提供的离线中文语音转写**不是画面理解**；真要视觉理解，还需 FFmpeg 取帧和一个有图像输入能力的模型。成本和质量需单独测量，不能宣称已完成。

**浏览器备用：Playwright 官方 Docker 文档**

- https://playwright.dev/docs/docker
- 文档给出在 Docker/GitHub Codespaces 用 `desktop-lite` 和 noVNC 查看可见浏览器的办法。若用于爬取不可信网站，官方建议单独用户与 seccomp 沙盒，而非 root 关闭沙盒；本项目维持该边界。
- 用于“可见浏览器”的独立证据，不自动算作 “视频被理解”。

## 接入路线：先验产品可用性，不再追版本数

0. **先证真**：找到一个我们有权处理的公开抖音视频链接，记录其格式；不提供平台账号/密码/私有 Cookie。
1. **云端部署试验**：在经许可的临时 Linux 宿主机上，按 v5.1.11 中文教程部署隔离实例，固定版本，限制只读凭据、公开端口与资源上限；先验证 `/healthz` 和 `/readyz`。没有可用云端环境或预算时不得声称已部署。
2. **一个真实链接闭环**：仅一次/有限次数请求，记录 `parse` 原始状态与可核验媒体信息、评论接口返回的条数/来源；若失败保存错误码及上游状态，不伪造内容。
3. **媒体理解闭环**：若许可和平台规则允许下载，启用 downloader；取可归属的视频帧，云端中文语音转写后与帧一起交给视觉模型，输出带时间戳的报告；不能从只有标题的返回值推断视频画面。
4. **编入鱼塘**：仅在上述真实数据闭环成立后，写最薄一层 REST/MCP 适配器，保留旧 EXE 为独立兼容路径。所有 UI 体现 `SOURCE_RETRIEVED`、`PLAYBACK_OBSERVED`、`AI_ANALYZED` 等不同证据级别。
5. 终验：不用用户本地 GPU；视频与评论可真正读取、AI 可理解、结果可复核、错误有明确回执；涉及云端付费需实际预算批准。无登录自动化、无点赞/关注/评论/私信。

## 与当前 Windows 候选的关系

- 当前已经独立验收的 Windows 诊断候选：Actions #44337671135，EXE SHA-256 `ac690007d58cc1ac10e09f670f7313e1e3ee3c31ea8640bdc7e3bb33b04ba0d1`，**47/47 离线回归 PASS，但真实抖音浏览现场仍 UNVERIFIED**。
- 历史 GitHub Windows 无头公网探针 #44210748884 返回 `HTTP 200` + `PAGE_RESPONDED_NO_VISIBLE_VIDEO`，这是那一个候选的失败/未验证证据，不是当前或外部上游 API 的测量结果。
- **本次只做第三方文档/许可证调查，不运行新的 Docker、不消耗 Actions、不修改 Windows EXE、不修改 `main`、不发布。**
