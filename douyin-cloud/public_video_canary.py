"""One bounded cloud experiment for a single public Douyin video.

Adapted observation strategy (not implementation) from MIT-licensed
xiaoke949/douyin-guest-dl @ 853553ee6cd57b4a5f753a25b440468d5f72e4fb.
Watch only browser-issued responses, not account cookies, page text or media.
No media downloads, challenge solving, login, retries or platform API calls.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

PUBLIC_VIDEO_ID = "7708352061931622655"
PUBLIC_URL = f"https://www.douyin.com/video/{PUBLIC_VIDEO_ID}"
SCHEMA = "yutang.cloud.public_video_probe.v1"
UPSTREAM_COMMIT = "853553ee6cd57b4a5f753a25b440468d5f72e4fb"

# Read-only player metadata: never read DOM text, page HTML, cookies or URLs.
PLAYER_JS = """() => {
  const all = Array.from(document.querySelectorAll('video'));
  const visible = all.filter(v => {
    const r = v.getBoundingClientRect();
    const s = getComputedStyle(v);
    return r.width >= 80 && r.height >= 80 && r.bottom > 0 &&
      r.right > 0 && r.left < innerWidth && r.top < innerHeight &&
      s.display !== 'none' && s.visibility !== 'hidden';
  });
  const v = visible.find(v => !v.paused && v.readyState >= 2) || visible[0];
  return {
    total: all.length,
    visible: visible.length,
    media_time: v && Number.isFinite(v.currentTime) ? v.currentTime : null,
    paused: v ? !!v.paused : null,
    ready: v ? v.readyState : null
  };
}"""


def finite(value: Any, upper: float) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(number) or number < 0 or number > upper:
        return None
    return round(number, 2)


def safe_sample(raw: Any) -> dict[str, Any]:
    value = raw if isinstance(raw, dict) else {}
    def count(key: str) -> int | None:
        v = value.get(key)
        return v if type(v) is int and 0 <= v <= 200 else None
    ready = value.get("ready")
    return {
        "total": count("total"),
        "visible": count("visible"),
        "media_time": finite(value.get("media_time"), 86400),
        "paused": value.get("paused") if type(value.get("paused")) is bool else None,
        "ready": ready if type(ready) is int and 0 <= ready <= 4 else None,
    }


def summarize(http_status: Any, origin: bool, detail_seen: bool,
              raw_samples: list[Any], error_code: str | None = None) -> dict[str, Any]:
    status = http_status if type(http_status) is int and 100 <= http_status <= 599 else None
    samples = [safe_sample(item) for item in raw_samples[-30:]]
    observed = 0.0
    advancing = 0
    for previous, current in zip(samples, samples[1:]):
        a, b = previous["media_time"], current["media_time"]
        if (a is None or b is None or previous["paused"] is not False or
                current["paused"] is not False or
                (previous["ready"] or 0) < 2 or (current["ready"] or 0) < 2):
            continue
        delta = b - a
        # Samples are ~1 second apart. Ignore player seek jumps.
        if 0.10 <= delta <= 2.75:
            observed += delta
            advancing += 1
    verified = observed >= 3.0 and advancing >= 2
    max_total = max((s["total"] or 0 for s in samples), default=0)
    max_visible = max((s["visible"] or 0 for s in samples), default=0)
    if verified:
        classification = "PUBLIC_VIDEO_PLAYBACK_OBSERVED"
    elif status in (401, 403, 429) or (status is not None and status >= 500):
        classification = "HTTP_RESTRICTED_OR_ERROR"
    elif detail_seen:
        classification = "PUBLIC_VIDEO_METADATA_OBSERVED"
    elif max_visible:
        classification = "VIDEO_ELEMENT_PRESENT_NO_VERIFIED_PLAYBACK"
    elif status is not None and 200 <= status < 400 and origin:
        classification = "PAGE_RESPONDED_NO_VISIBLE_VIDEO"
    else:
        classification = "CLOUD_BROWSER_OR_SITE_UNVERIFIED"
    safe_errors = {"BROWSER_UNAVAILABLE", "NAVIGATION_FAILED", "PROBE_FAILED"}
    return {
        "schema": SCHEMA,
        "public_video_id": PUBLIC_VIDEO_ID,
        "cloud_runner": "github-ubuntu-chrome-headless",
        "upstream_method_repo": "xiaoke949/douyin-guest-dl",
        "upstream_method_commit": UPSTREAM_COMMIT,
        "http_status": status,
        "douyin_origin": bool(origin),
        "detail_response_seen": bool(detail_seen),
        "media_element_max_count": max_total,
        "visible_media_element_max_count": max_visible,
        "sample_count": len(samples),
        "observed_playback_s": round(observed, 2),
        "advancing_samples": advancing,
        "real_public_playback_observed": verified,
        "classification": classification,
        "error_code": error_code if error_code in safe_errors else None,
        "comments_read": False,
        "ai_vision_or_audio_understood": False,
        "limitations": "Cloud-only headless test; no user-desktop playback or audio proven.",
    }


async def observe_once() -> dict[str, Any]:
    samples: list[Any] = []
    detail_seen = False
    http_status = None
    origin = False
    error_code = None
    tasks: set[asyncio.Task[Any]] = set()
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(channel="chrome", headless=True)
            try:
                context = await browser.new_context(accept_downloads=False)
                page = await context.new_page()

                async def observe_response(response: Any) -> None:
                    nonlocal detail_seen
                    parsed = urlsplit(response.url)
                    if parsed.hostname not in ("www.douyin.com", "douyin.com"):
                        return
                    if "/aweme/v1/web/aweme/detail" not in parsed.path:
                        return
                    try:
                        body = await response.json()
                        detail = body.get("aweme_detail") if isinstance(body, dict) else None
                        detail_seen |= (isinstance(detail, dict) and
                                        str(detail.get("aweme_id")) == PUBLIC_VIDEO_ID)
                    except Exception:
                        pass

                def capture(response: Any) -> None:
                    parsed = urlsplit(response.url)
                    if parsed.hostname in ("www.douyin.com", "douyin.com") and "/aweme/v1/web/aweme/detail" in parsed.path:
                        t = asyncio.create_task(observe_response(response))
                        tasks.add(t)
                        t.add_done_callback(tasks.discard)

                page.on("response", capture)
                try:
                    response = await page.goto(PUBLIC_URL, wait_until="domcontentloaded", timeout=25000)
                    http_status = response.status if response else None
                except Exception:
                    error_code = "NAVIGATION_FAILED"
                origin = urlsplit(page.url).hostname in ("www.douyin.com", "douyin.com")
                for _ in range(21):
                    try:
                        samples.append(await page.evaluate(PLAYER_JS))
                    except Exception:
                        samples.append({})
                    await asyncio.sleep(1)
                if tasks:
                    await asyncio.wait(tasks, timeout=2)
                await context.close()
            finally:
                await browser.close()
    except Exception:
        error_code = error_code or "BROWSER_UNAVAILABLE"
    return summarize(http_status, origin, detail_seen, samples, error_code)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    report = asyncio.run(observe_once())
    target = Path(args.out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    # Output only strictly sanitized status values, not any site content.
    print("YUTANG_CLOUD_CLASSIFICATION=" + report["classification"])
    print("YUTANG_CLOUD_REAL_PLAYBACK=" + str(report["real_public_playback_observed"]))
    print("YUTANG_CLOUD_DETAIL_RESPONSE=" + str(report["detail_response_seen"]))


if __name__ == "__main__":
    main()
