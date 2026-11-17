"""YuTang Douyin Watch: click-to-run Windows desktop GUI.

Unlike a visual/audio LLM, this mode watches actual HTML video playback and
reads *visible webpage text*. It never claims to understand inaccessible frames.
"""
from __future__ import annotations
import argparse
import os
import queue
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

from agent_core import WatchConfig, BrowserWatcher, data_dir


class App:
    def __init__(self, root: tk.Tk):
        self.root=root
        root.title('鱼塘 · 抖音自主浏览（只读测试版）')
        root.geometry('760x600')
        root.minsize(620,490)
        self.bus=queue.Queue()
        self.stop_event=threading.Event()
        self.worker=None
        self.url=tk.StringVar(value='https://www.douyin.com/')
        self.count=tk.StringVar(value='8')
        self.timeout=tk.StringVar(value='180')
        self.comments=tk.BooleanVar(value=True)
        self.frames=tk.BooleanVar(value=True)
        self.close_requested=False
        self.stat=tk.StringVar(value='未启动')
        self.progress=tk.StringVar(value='视频进度：—')
        self._build()
        root.protocol('WM_DELETE_WINDOW',self.on_close)
        root.after(120,self._poll)

    def _build(self):
        frame=ttk.Frame(self.root,padding=16)
        frame.pack(fill='both',expand=True)
        ttk.Label(frame,text='鱼塘 · 抖音自主浏览',font=('Microsoft YaHei UI',17,'bold')).pack(anchor='w')
        ttk.Label(frame,text='公开网页 · 可见 Edge · 不点赞/关注/发评论/私信 · 无需 API Key',foreground='#555').pack(anchor='w',pady=(3,12))
        form=ttk.Frame(frame);form.pack(fill='x')
        ttk.Label(form,text='起始网址').grid(row=0,column=0,sticky='w',pady=4)
        ttk.Entry(form,textvariable=self.url).grid(row=0,column=1,columnspan=3,sticky='ew',padx=8,pady=4)
        ttk.Label(form,text='视频数量').grid(row=1,column=0,sticky='w',pady=4)
        tk.Spinbox(form,from_=1,to=50,width=7,textvariable=self.count).grid(row=1,column=1,sticky='w',padx=8)
        ttk.Label(form,text='单条等待上限（秒）').grid(row=1,column=2,sticky='e',padx=(12,4))
        tk.Spinbox(form,from_=15,to=300,increment=15,width=7,textvariable=self.timeout).grid(row=1,column=3,sticky='w')
        form.columnconfigure(1,weight=1)
        ttk.Checkbutton(form,text='读取可见评论（不发表或点赞）',variable=self.comments).grid(row=2,column=0,columnspan=4,sticky='w',pady=6)
        ttk.Checkbutton(form,text='仅本机保存视频画面样本（每条最多3张；不采集音频）',variable=self.frames).grid(row=3,column=0,columnspan=4,sticky='w',pady=6)
        buttons=ttk.Frame(frame);buttons.pack(fill='x',pady=12)
        self.start_button=ttk.Button(buttons,text='打开 Edge 并开始',command=self.start)
        self.start_button.pack(side='left')
        self.stop_button=ttk.Button(buttons,text='停止并关闭本次 Edge',command=self.stop,state='disabled')
        self.stop_button.pack(side='left',padx=10)
        ttk.Button(buttons,text='打开观看记录',command=self.open_records).pack(side='left')
        ttk.Separator(frame,orient='horizontal').pack(fill='x',pady=8)
        ttk.Label(frame,textvariable=self.stat,font=('Microsoft YaHei UI',11,'bold')).pack(anchor='w')
        ttk.Label(frame,textvariable=self.progress).pack(anchor='w',pady=(4,9))
        log_frame=ttk.Frame(frame);log_frame.pack(fill='both',expand=True)
        self.log=tk.Text(log_frame,height=12,wrap='word',state='disabled',font=('Consolas',10))
        sb=ttk.Scrollbar(log_frame,orient='vertical',command=self.log.yview)
        self.log.configure(yscrollcommand=sb.set)
        self.log.pack(side='left',fill='both',expand=True)
        sb.pack(side='right',fill='y')
        ttk.Label(frame,text='提示：若抖音要求登录，请只在 Edge 里自行操作。程序不读取密码。视频无法播放会停止，不会伪造完成记录。',wraplength=700,foreground='#555').pack(anchor='w',pady=(10,0))
        self._log('先打开一个可以正常播放的抖音视频，程序会识别当前播放进度并尝试继续浏览。')

    def _log(self,message: str):
        self.log.configure(state='normal')
        self.log.insert('end',str(message)+'\n')
        self.log.see('end')
        self.log.configure(state='disabled')

    def start(self):
        if self.worker and self.worker.is_alive():return
        try: config=WatchConfig(url=self.url.get().strip(),count=int(self.count.get()),
                                max_seconds_per_video=int(self.timeout.get()),
                                read_comments=self.comments.get(),
                                capture_frames=self.frames.get())
        except (ValueError,TypeError) as e:
            messagebox.showerror('参数错误',str(e));return
        self.stop_event=threading.Event()
        def publish(kind,payload):self.bus.put((kind,payload))
        watcher=BrowserWatcher(config,self.stop_event,publish)
        # A daemon worker can be killed before Edge and Playwright close on window exit.
        self.worker=threading.Thread(target=watcher.run,daemon=False,name='douyin-watcher')
        self.start_button.configure(state='disabled')
        self.stop_button.configure(state='normal')
        self.stat.set('浏览器启动中…')
        self.worker.start()

    def stop(self):
        self.stop_event.set()
        self.stat.set('正在安全停止…')
        self.stop_button.configure(state='disabled')

    def open_records(self):
        folder=data_dir();folder.mkdir(parents=True,exist_ok=True)
        try:
            if os.name=='nt': os.startfile(str(folder))
            else: self._log('观看记录目录：'+str(folder))
        except Exception as e: messagebox.showerror('打开失败',str(e))

    def _poll(self):
        try:
            for _ in range(100):
                kind,data=self.bus.get_nowait()
                if kind=='started':
                    self._log('记录文件：'+data['csv'])
                elif kind=='status':
                    self.stat.set(data['message']);self._log(data['message'])
                elif kind=='video':
                    self.stat.set(f'正在观看第 {data["index"]} 条：{data["title"][:60]}')
                    self.progress.set('视频进度：等待播放')
                    self._log(f'第 {data["index"]} 条：{data["title"][:120]}')
                elif kind=='progress':
                    dur=data.get('duration');d='未知' if dur is None else str(round(dur,1))+'s'
                    self.progress.set(f'视频进度：{data["current"]}s / {d}（程序已等待 {data["elapsed"]}s）')
                elif kind=='record':
                    self._log(f'记录 #{data["index"]} {data["status"]} | 可见评论 {data["comments"]} 条 | 页面AI总结 {"有" if data["ai_summary"] else "未取得"}')
                elif kind=='frame':
                    self._log(f'第 {data["index"]} 条：保存本地画面 {data["mark"]}%（{data["filename"]}）')
                elif kind=='error':
                    self.stat.set('需检查：'+data['message']);self._log('⚠ '+data['message'])
                elif kind=='done':
                    self._log(data['message'])
                elif kind=='finished':
                    self._log('本次浏览器会话已结束。')
                    self.start_button.configure(state='normal')
                    self.stop_button.configure(state='disabled')
        except queue.Empty: pass
        self.root.after(120,self._poll)

    def on_close(self):
        if self.worker and self.worker.is_alive():
            if self.close_requested:
                return
            if not messagebox.askyesno('正在运行','本次自动浏览尚未停止。先停止并等待本次 Edge 关闭，然后退出？'):
                return
            self.close_requested=True
            self.stop()
            self._wait_for_browser_cleanup()
            return
        self.root.destroy()

    def _wait_for_browser_cleanup(self):
        # Keep Tk's event loop alive while the non-daemon worker closes Edge.
        # Never call join() on the UI thread.
        if self.worker and self.worker.is_alive():
            self.root.after(200,self._wait_for_browser_cleanup)
            return
        self.root.destroy()


def self_test() -> None:
    from agent_core import (WatchConfig,watching_complete,verified_full_watch,is_live_or_unknown,
                             video_identity,safe_url,clip)
    assert WatchConfig(count=1).count == 1
    assert WatchConfig().capture_frames is True
    assert verified_full_watch({'duration':10,'current_time':9.5},{'duration':10,'current_time':8},9.5,True,9)
    assert not verified_full_watch({'duration':10,'current_time':9.5},{'duration':10,'current_time':8},9.5,False,9)

    try: WatchConfig(url='https://example.com')
    except ValueError: pass
    else: raise AssertionError('external URL accepted')
    assert safe_url('https://www.douyin.com/video/123?cookie=secret') == 'https://www.douyin.com/video/123'
    assert safe_url('https://www.douyin.com.evil.example/video/1') == ''
    assert watching_complete({'duration':10,'current_time':9.6},{'duration':10,'current_time':8},9.6)
    assert not watching_complete({'duration':10,'current_time':3},{'duration':10,'current_time':2},3)
    assert is_live_or_unknown({'duration':None})
    assert video_identity({'src_key':'a','url':'b'}) != video_identity({'src_key':'z','url':'b'})
    assert clip(' a\n b ') == 'a b'
    print('YUTANG_DOUYIN_SELF_TEST_PASS',flush=True)


def browser_smoke() -> None:
    """Verify that the *packaged* Edge browser driver can launch, without Douyin."""
    from playwright.sync_api import sync_playwright
    from agent_core import PROBE_JS
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='msedge', headless=True)
        try:
            page = browser.new_page()
            page.set_content('<div data-e2e="feed-active-video"><video style="width:320px;height:240px"></video><p data-e2e="video-desc">Windows Edge Smoke</p></div>')
            result = page.evaluate(PROBE_JS)
            assert result['found'] and result['title'] == 'Windows Edge Smoke', result
        finally:
            browser.close()
    print('YUTANG_DOUYIN_EDGE_BROWSER_SMOKE_PASS', flush=True)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--self-test',action='store_true',help='offline packaged EXE smoke test')
    ap.add_argument('--browser-smoke',action='store_true',help='launch a local Edge DOM smoke test; no internet')
    args=ap.parse_args()
    if args.browser_smoke:
        browser_smoke();return
    if args.self_test:
        self_test();return
    root=tk.Tk()
    try: ttk.Style(root).theme_use('vista')
    except tk.TclError: pass
    App(root)
    root.mainloop()

if __name__=='__main__':main()
