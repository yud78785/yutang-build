"""Bounded cloud read-only comment probe on a previously playback-verified video.

Reference only (no copied source): MediaCrawler media_platform/douyin/client.py
uses /aweme/v1/web/comment/list/ for Douyin comments. The browser itself
may issue this request when a user-visible comment panel is opened.
This code NEVER calls that endpoint directly, sends comments, or saves text.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from public_video_canary import PUBLIC_VIDEO_ID, PUBLIC_URL

SCHEMA = "yutang.cloud.public_comments_probe.v1"
OPEN_COMMENT_SELECTORS = [
    '[data-e2e="feed-comment-icon"]',
    '[data-e2e="comment-icon"]',
    'button[aria-label="打开评论"]',
    'button[aria-label="查看评论"]',
]
DOM_COMMENT_COUNTER_JS = """() => {
  const panel=document.querySelector('.comment-mainContent') || document.querySelector('[data-e2e="comment-list"]');
  function visible(el) { if(!el) return false; const r=el.getBoundingClientRect(), st=getComputedStyle(el);
    return r.width>0 && r.height>0 && st.display!=='none' && st.visibility!=='hidden'; }
  const selectors = ['[data-e2e="comment-item"]', '[data-e2e="comment-content"]',
    '[class*="comment-content"]', '[class*="CommentContent"]'];
  const texts=new Set();
  for (const sel of selectors) for (const el of (panel || document).querySelectorAll(sel)) {
    const r=el.getBoundingClientRect(), s=getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || s.display==='none' || s.visibility==='hidden') continue;
    const text=(el.innerText || el.textContent || '').trim();
    if (text.length >= 4 && text.length < 600) texts.add(text.slice(0,200));
    if (texts.size >= 5) break;
  }
  const nodeCount=panel?panel.querySelectorAll('[data-e2e="comment-item"]').length:0;
  return {panel_present:!!panel,panel_visible:visible(panel),item_nodes:Math.min(50,nodeCount),
          comment_text_count:Math.min(5,texts.size),
          login_hint:/扫码登录|登录后评论|请先登录/.test(document.body?.innerText || '')};
}"""


def get_response_comment_count(url: Any, payload: Any) -> int | None:
    """Count attributable nonempty comment text, without returning the text."""
    if not isinstance(url, str):
        return None
    parts = urlsplit(url)
    if (parts.hostname not in ('www.douyin.com','douyin.com') or
            parts.path != '/aweme/v1/web/comment/list/'):
        return None
    ids = parse_qs(parts.query).get('aweme_id', [])
    if ids != [PUBLIC_VIDEO_ID]:
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get('comments'), list):
        return None
    return sum(1 for comment in payload['comments'][:20] if
               isinstance(comment,dict) and isinstance(comment.get('text'),str) and
               1 <= len(comment['text'].strip()) <= 3000)


def result(verified_url: bool, comment_response_seen: bool,
           response_text_count: int, visible_dom_count: int,
           comment_open_clicked: bool, browser_error: bool=False,
           panel_exists: bool=False, panel_visible: bool=False,
           item_nodes: int=0, login_hint: bool=False) -> dict[str,Any]:
    if not verified_url:
        state='VIDEO_IDENTITY_NOT_CONFIRMED'
    elif comment_response_seen and response_text_count>0:
        state='PUBLIC_COMMENT_TEXT_OBSERVED'
    elif visible_dom_count>0 and (comment_open_clicked or panel_visible):
        state='PUBLIC_VISIBLE_DOM_COMMENT_OBSERVED'
    elif comment_response_seen:
        state='COMMENT_RESPONSE_EMPTY'
    elif panel_exists:
        state='STANDALONE_COMMENT_PANEL_EMPTY'
    elif comment_open_clicked:
        state='COMMENT_PANEL_OPENED_NO_TEXT'
    else:
        state='COMMENTS_UNVERIFIED'
    if browser_error and state=='COMMENTS_UNVERIFIED':
        state='BROWSER_OR_SITE_UNVERIFIED'
    return {
        'schema':SCHEMA,
        'public_video_id':PUBLIC_VIDEO_ID,
        'cloud_environment':'github-ubuntu-chrome-headless',
        'correct_video_url':bool(verified_url),
        'comment_panel_open_clicked':bool(comment_open_clicked),
        'own_comment_response_seen':bool(comment_response_seen),
        'response_comment_text_count':min(max(int(response_text_count),0),20),
        'visible_dom_comment_count':min(max(int(visible_dom_count),0),5),
        'standalone_comment_panel_present':bool(panel_exists),
        'standalone_comment_panel_visible':bool(panel_visible),
        'comment_item_nodes':min(max(int(item_nodes),0),50),
        'login_hint':bool(login_hint),
        'classification':state,
        'public_comment_text_observed':state in ('PUBLIC_COMMENT_TEXT_OBSERVED', 'PUBLIC_VISIBLE_DOM_COMMENT_OBSERVED'),
        'comments_submitted':False,
        'comment_text_or_usernames_persisted':False,
        'user_login_or_cookies_used':False,
        'limitations':'Counts only; no comment text retained, no AI interpretation or Windows desktop proof.'
    }


async def probe_one_video() -> dict[str,Any]:
    seen=False
    texts=0
    dom_count=0
    clicked=False
    correct_id=False
    failed=False
    panel_exists=False
    panel_visible=False
    item_nodes=0
    login_hint=False
    tasks:set[asyncio.Task[Any]]=set()
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            browser=await pw.chromium.launch(channel='chrome',headless=True)
            try:
                context=await browser.new_context(accept_downloads=False)
                page=await context.new_page()
                async def record(response:Any)->None:
                    nonlocal seen, texts
                    try:
                        body=await response.json()
                        count=get_response_comment_count(response.url,body)
                        if count is not None:
                            seen=True
                            texts=max(texts,count)
                    except Exception:
                        pass
                def response_hook(response:Any)->None:
                    parsed=urlsplit(response.url)
                    if parsed.hostname in ('www.douyin.com','douyin.com') and parsed.path=='/aweme/v1/web/comment/list/':
                        task=asyncio.create_task(record(response))
                        tasks.add(task)
                        task.add_done_callback(tasks.discard)
                page.on('response',response_hook)
                try:
                    await page.goto(PUBLIC_URL,wait_until='domcontentloaded',timeout=25000)
                except Exception:
                    failed=True
                await asyncio.sleep(4)
                parts=urlsplit(page.url)
                correct_id=(parts.hostname in ('www.douyin.com','douyin.com') and
                            parts.path.rstrip('/').endswith('/video/'+PUBLIC_VIDEO_ID))
                if correct_id:
                    try:
                        first=await page.evaluate(DOM_COMMENT_COUNTER_JS)
                        if isinstance(first,dict):
                            dom_count=first.get('comment_text_count',0) if type(first.get('comment_text_count')) is int else 0
                            panel_exists=first.get('panel_present') is True
                            panel_visible=first.get('panel_visible') is True
                            item_nodes=first.get('item_nodes',0) if type(first.get('item_nodes')) is int else 0
                            login_hint=first.get('login_hint') is True
                    except Exception:
                        pass
                    for selector in ([] if dom_count>0 else OPEN_COMMENT_SELECTORS):
                        try:
                            loc=page.locator(selector).first
                            if await loc.count() and await loc.is_visible() and await loc.is_enabled():
                                await loc.click(timeout=1500)
                                clicked=True
                                break
                        except Exception:
                            pass
                    await asyncio.sleep(10)
                    try:
                        value=await page.evaluate(DOM_COMMENT_COUNTER_JS)
                        if isinstance(value,dict):
                            dom_count=max(dom_count,value.get('comment_text_count',0))
                            panel_exists|=value.get('panel_present') is True
                            panel_visible|=value.get('panel_visible') is True
                            item_nodes=max(item_nodes,value.get('item_nodes',0))
                            login_hint|=value.get('login_hint') is True
                    except Exception:
                        pass
                if tasks:
                    await asyncio.wait(tasks,timeout=2)
                await context.close()
            finally:
                await browser.close()
    except Exception:
        failed=True
    return result(correct_id,seen,texts,dom_count,clicked,browser_error=failed,
                  panel_exists=panel_exists,panel_visible=panel_visible,
                  item_nodes=item_nodes,login_hint=login_hint)


def main()->None:
    ap=argparse.ArgumentParser()
    ap.add_argument('--out',required=True)
    args=ap.parse_args()
    data=asyncio.run(probe_one_video())
    target=Path(args.out)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(data,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')
    print('YUTANG_CLOUD_COMMENTS='+data['classification'])
    print('YUTANG_CLOUD_COMMENT_TEXT_OBSERVED='+str(data['public_comment_text_observed']))


if __name__=='__main__':main()
