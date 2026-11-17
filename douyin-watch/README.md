# 鱼塘 · 抖音自主浏览（Windows 便携实验版）

目标：不用 Python、Node.js 或浏览器扩展，打开一个 EXE，让真实 Windows Edge 可见地播放抖音公开视频，读取能看见的标题/评论/已有 AI 总结，自动切换下一条，输出 CSV 证据，并在本机保存有限的真实播放器画面取样（不采集音频）。

## 1. 使用

1. Windows 10/11 需要已安装 **Microsoft Edge**，双击 `YuTangDouyinWatch.exe`。
2. 默认网址 `https://www.douyin.com/`，设置本次最多 1–50 条；点击 **打开 Edge 并开始**。
3. 如果页面需要登录或先打开视频，**只在弹出的 Edge 手动操作**。不要把密码、短信验证码发送给程序。
4. 程序查看实际活动 `<video>` 播放进度，必须观察到从接近开头到至少 85% 的进度，才能认定完整播放。默认在 10%/50%/85% 附近保存最多三张本地视频画面取样，再读取本条可见评论及现成 AI 总结；确认视频身份未改变后才记录。若未完整播放，不自动跳到下一条。
5. 随时点 **停止并关闭本次 Edge**。关闭程序窗口时会先等待本次 Edge 完成清理。点 **打开观看记录** 可查看 UTF-8 CSV 和每次会话独立的 `DouyinWatch-...-frames/` 文件夹；每条最多三张，跨会话不会覆盖。CSV 对网页文本文字进行表格公式防护。

## 2. 明确边界

- 实现的是 **本地只读自动浏览控制器**，不是视觉/语音大模型。能保存实际视频区域的 **PNG 画面证据**，但**不能自动解释画面、录制/听懂声音，也不能自行生成 AI 总结**。CSV 的 `audio_status` 只反映视频播放器是否静音，**不是声音已经被听到或理解的证据**。只有网页已显示 AI 总结时，才读取现成内容。拿不到的内容标为空，绝不填造。
- 不绕过抖音风控、验证码、地理限制或登录要求；不请求任何私有接口，不抓取/传播账号 Cookie。
- 不点赞、收藏、评论、关注、私信、转发，不上传记录到服务端。
- 由于抖音网页是不断变化的单页应用，选择器可能失效；无法确认新视频就停止，不能视为实战验收通过。
- Edge 使用 `%LOCALAPPDATA%\YuTangDouyinWatch\edge-profile` 独立资料目录；CSV 仅保存在 `%LOCALAPPDATA%\YuTangDouyinWatch`。
- 当前为**未签名实验候选**，不是正式发布版本，不要忽略 Windows 安全警告强行运行。2026-11-17 Actions #44135162273 已通过**旧源码** Windows 离线 Edge 测试与打包，本分支新增的画面与退出清理改动**尚未运行 Windows CI，更没有抖音现场 PASS**。

## 3. 开发 / 验证

```
python -m pip install -r requirements-win.txt
python -m unittest discover -s tests -v
python app.py --self-test
python app.py
```

Windows 单文件构建（仅隔离实验分支的 GitHub Actions 一次性构建）：

```
pyinstaller --noconfirm --clean --onefile --windowed --name YuTangDouyinWatch --collect-all playwright app.py
```

下载 CI ZIP 后 EXE 的 `--self-test` 必须 PASS 才算包装成功。**云端 Windows 构建成功不代表真实抖音播放通过**；真实功能需要用户电脑上的 Edge 现场验证。

源码参考：抖音帮助页 `https://www.douyin.com/help` 对 ↓ 切视频的说明；只读检测优先使用 `[data-e2e="feed-active-video"]` 和真正活动的 `<video>`。零调用外部大模型；不需要提供 API Key。
