#!/usr/bin/env python3
"""One-shot, anonymous Douyin media probe using a pinned MIT upstream reader.

No login, cookies, proxy, retry, account, model API, or public plaintext artifact.
Only the encrypted result bundle leaves the ephemeral runner.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

TARGET_ID = "7445301722639060233"
TARGET_URL = f"https://www.douyin.com/video/{TARGET_ID}"
UPSTREAM_COMMIT = "97920577ef5ae718af5de2561ed3aa5b00d36f64"
MAX_REDIRECTS = 3
AUDIO_LIMIT = 20 * 1024 * 1024
VIDEO_LIMIT = 75 * 1024 * 1024


class ProbeError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def validate_video_id(value: str) -> bool:
    return isinstance(value, str) and value.isdigit() and 10 <= len(value) <= 30


def exact_aweme_detail(payload: object, expected_id: str) -> dict | None:
    if not isinstance(payload, dict):
        return None
    detail = payload.get("aweme_detail")
    if not isinstance(detail, dict) or str(detail.get("aweme_id", "")) != expected_id:
        return None
    if not isinstance(detail.get("video"), dict):
        return None
    return detail


def is_verified_detail(detail: object, expected_id: str) -> bool:
    return (
        isinstance(detail, dict)
        and str(detail.get("aweme_id", "")) == expected_id
        and isinstance(detail.get("video"), dict)
    )


def is_target_page_url(url: str, video_id: str) -> bool:
    try:
        parsed = urllib.parse.urlsplit(url)
        return parsed.scheme == "https" and parsed.hostname == "www.douyin.com" and parsed.path == f"/video/{video_id}"
    except Exception:
        return False


def validate_public_https_url(url: str, resolver=None) -> str:
    """Reject non-HTTPS, credentials, IP literals, and non-global DNS answers."""
    if resolver is None:
        resolver = socket.getaddrinfo
    try:
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ProbeError("MEDIA_URL_REJECTED")
        if parsed.port not in (None, 443):
            raise ProbeError("MEDIA_URL_REJECTED")
        host = parsed.hostname.rstrip(".").lower()
        try:
            ipaddress.ip_address(host)
            raise ProbeError("MEDIA_IP_LITERAL_REJECTED")
        except ValueError:
            pass
        if not host or host in {"localhost", "localhost.localdomain"}:
            raise ProbeError("MEDIA_HOST_REJECTED")
        answers = resolver(host, 443, type=socket.SOCK_STREAM)
        addresses = {item[4][0].split("%")[0] for item in answers}
        if not addresses:
            raise ProbeError("MEDIA_DNS_EMPTY")
        for address in addresses:
            ip = ipaddress.ip_address(address)
            if not ip.is_global or ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
                raise ProbeError("MEDIA_DNS_NONPUBLIC")
        return host
    except ProbeError:
        raise
    except Exception:
        raise ProbeError("MEDIA_URL_OR_DNS_INVALID") from None


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self):
        super().__init__()
        self.redirect_count = 0

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.redirect_count += 1
        if self.redirect_count > MAX_REDIRECTS:
            raise ProbeError("MEDIA_REDIRECT_LIMIT")
        validate_public_https_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def safe_download(url: str, out_path: Path, max_bytes: int, user_agent: str) -> dict:
    """One direct HTTPS GET; no cookies, proxy, retry, or URL logging."""
    validate_public_https_url(url)
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        SafeRedirectHandler(),
    )
    request = urllib.request.Request(url, headers={
        "User-Agent": user_agent,
        "Referer": "https://www.douyin.com/",
        "Accept": "*/*",
    })
    digest = hashlib.sha256()
    downloaded = 0
    try:
        with opener.open(request, timeout=60) as response:
            validate_public_https_url(response.geturl())
            total = int(response.headers.get("Content-Length") or 0) or None
            if total is not None and total > max_bytes:
                raise ProbeError("MEDIA_SIZE_LIMIT")
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with out_path.open("wb") as stream:
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    downloaded += len(chunk)
                    if downloaded > max_bytes:
                        raise ProbeError("MEDIA_SIZE_LIMIT")
                    digest.update(chunk)
                    stream.write(chunk)
            if total is not None and downloaded != total:
                raise ProbeError("MEDIA_DOWNLOAD_INCOMPLETE")
            if downloaded == 0:
                raise ProbeError("MEDIA_EMPTY")
            return {
                "bytes": downloaded,
                "sha256": digest.hexdigest(),
                "content_type": str(response.headers.get("Content-Type", "unknown")).split(";", 1)[0][:80],
            }
    except ProbeError:
        out_path.unlink(missing_ok=True)
        raise
    except urllib.error.HTTPError as exc:
        out_path.unlink(missing_ok=True)
        raise ProbeError(f"MEDIA_HTTP_{int(exc.code)}") from None
    except Exception:
        out_path.unlink(missing_ok=True)
        raise ProbeError("MEDIA_FETCH_FAILED") from None


class DouyinPageRedirectHandler(SafeRedirectHandler):
    ALLOWED_HOSTS = {"www.iesdouyin.com", "www.douyin.com"}

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        host = urllib.parse.urlsplit(newurl).hostname
        if host not in self.ALLOWED_HOSTS:
            raise ProbeError("SHARE_PAGE_REDIRECT_HOST_REJECTED")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def safe_fetch_text(url: str, max_bytes: int, user_agent: str) -> tuple[str, str, int]:
    """One anonymous bounded GET for the official Douyin share-page HTML."""
    validate_public_https_url(url)
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        DouyinPageRedirectHandler(),
    )
    request = urllib.request.Request(url, headers={
        "User-Agent": user_agent,
        "Referer": "https://www.douyin.com/",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml",
    })
    try:
        with opener.open(request, timeout=18) as response:
            final_url = response.geturl()
            validate_public_https_url(final_url)
            parsed = urllib.parse.urlsplit(final_url)
            if parsed.hostname not in DouyinPageRedirectHandler.ALLOWED_HOSTS:
                raise ProbeError("SHARE_PAGE_FINAL_HOST_REJECTED")
            expected_path = f"/share/video/{TARGET_ID}/"
            alternate_path = f"/video/{TARGET_ID}"
            if parsed.path not in {expected_path, alternate_path}:
                raise ProbeError("SHARE_PAGE_FINAL_IDENTITY_MISMATCH")
            total = int(response.headers.get("Content-Length") or 0) or None
            if total is not None and total > max_bytes:
                raise ProbeError("SHARE_PAGE_SIZE_LIMIT")
            chunks = []
            size = 0
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise ProbeError("SHARE_PAGE_SIZE_LIMIT")
                chunks.append(chunk)
            if not size or total is not None and size != total:
                raise ProbeError("SHARE_PAGE_INCOMPLETE")
            charset = response.headers.get_content_charset() or "utf-8"
            return b"".join(chunks).decode(charset, "replace"), final_url, int(response.status)
    except ProbeError:
        raise
    except urllib.error.HTTPError as exc:
        raise ProbeError(f"SHARE_PAGE_HTTP_{int(exc.code)}") from None
    except Exception:
        raise ProbeError("SHARE_PAGE_FETCH_FAILED") from None


def find_exact_aweme_detail(value: object, expected_id: str, depth: int = 0, budget: list[int] | None = None) -> dict | None:
    if budget is None:
        budget = [100000]
    budget[0] -= 1
    if budget[0] < 0 or depth > 40:
        return None
    if isinstance(value, dict):
        id_keys = ("aweme_id", "item_id", "group_id", "awemeId", "itemId")
        matched = any(str(value.get(key, "")) == expected_id for key in id_keys)
        if matched:
            for video_key in ("video", "video_info", "videoInfo"):
                candidate = value.get(video_key)
                if isinstance(candidate, dict) and ("play_addr" in candidate or "bit_rate" in candidate):
                    return {"aweme_id": expected_id, "video": candidate}
        for child in value.values():
            found = find_exact_aweme_detail(child, expected_id, depth + 1, budget)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_exact_aweme_detail(child, expected_id, depth + 1, budget)
            if found is not None:
                return found
    return None


def extract_router_data_objects(html: str, upstream, max_objects: int = 5) -> list[dict]:
    marker = "window._ROUTER_DATA"
    results = []
    offset = 0
    while len(results) < max_objects:
        position = html.find(marker, offset)
        if position < 0:
            break
        try:
            parsed = upstream._extract_json_object_after_marker(html[position:], marker)
            if isinstance(parsed, dict):
                results.append(parsed)
        except Exception:
            pass
        offset = position + len(marker)
    return results


def summarize_router_data(router_data: list[dict], expected_id: str) -> dict:
    counts = {"aweme_id": 0, "item_id": 0, "group_id": 0, "awemeId": 0, "itemId": 0}
    target_matches = 0
    video_candidates = []
    visited = 0

    def walk(value, path="", depth=0):
        nonlocal target_matches, visited
        if depth > 40 or visited >= 100000:
            return
        visited += 1
        if isinstance(value, dict):
            for key in counts:
                if key in value:
                    counts[key] += 1
                    if str(value.get(key, "")) == expected_id:
                        target_matches += 1
            for key, child in value.items():
                if isinstance(child, dict) and ("play_addr" in child or "bit_rate" in child) and any(k in child for k in ("duration", "cover", "play_addr")):
                    play_addr = child.get("play_addr") if isinstance(child.get("play_addr"), dict) else {}
                    bit_rates = child.get("bit_rate") if isinstance(child.get("bit_rate"), list) else []
                    video_candidates.append({
                        "path": (path + "." + str(key))[:180],
                        "keys": sorted(str(k) for k in child.keys())[:40],
                        "duration_ms": child.get("duration") if isinstance(child.get("duration"), (int, float)) else None,
                        "width": child.get("width") if isinstance(child.get("width"), int) else None,
                        "height": child.get("height") if isinstance(child.get("height"), int) else None,
                        "bit_rate_count": len(bit_rates),
                        "play_addr_url_count": len(play_addr.get("url_list", [])) if isinstance(play_addr.get("url_list"), list) else 0,
                    })
                walk(child, path + "." + str(key), depth + 1)
        elif isinstance(value, list):
            for index, child in enumerate(value[:10000]):
                walk(child, path + "[" + str(index) + "]", depth + 1)

    for index, obj in enumerate(router_data):
        walk(obj, "router_data[" + str(index) + "]")
    return {
        "router_data_object_count": len(router_data),
        "visited_nodes_capped": visited >= 100000,
        "visited_node_count": visited,
        "id_key_counts": counts,
        "exact_target_id_match_count": target_matches,
        "video_candidate_count": len(video_candidates),
        "video_candidates": video_candidates[:12],
        "top_level_keys": [sorted(str(k) for k in obj.keys())[:80] for obj in router_data],
    }


def fetch_share_page_detail(upstream, video_id: str) -> tuple[dict | None, int, list[dict]]:
    if video_id != TARGET_ID:
        raise ProbeError("TARGET_VIDEO_ID_NOT_PINNED")
    share_url = f"https://www.iesdouyin.com/share/video/{video_id}/"
    html, _final_url, status = safe_fetch_text(share_url, 4 * 1024 * 1024, upstream._MOBILE_UA)
    router_data = extract_router_data_objects(html, upstream)
    if not router_data:
        raise ProbeError("SHARE_PAGE_ROUTER_DATA_NOT_FOUND")
    for obj in router_data:
        detail = find_exact_aweme_detail(obj, video_id)
        if detail is not None and upstream._looks_like_douyin_video(detail.get("video")):
            return detail, status, router_data
    return None, status, router_data


def inspect_first_party_api_json(host: str, path: str, status: int, content_type: str, body: bytes, expected_id: str) -> dict | None:
    allowed_hosts = {"www.douyin.com", "www.iesdouyin.com", "iesdouyin.com"}
    mime_type = (content_type or "").split(";", 1)[0].strip().lower()
    normalized_path = path.rstrip("/").lower()
    is_aweme_detail_text = normalized_path.endswith("/aweme/v1/web/aweme/detail") and mime_type == "text/plain"
    if host not in allowed_hosts or status != 200 or not ("json" in mime_type or is_aweme_detail_text):
        return None
    if not any(token in path.lower() for token in ("/aweme/", "/api/", "/video/", "/feed/", "/detail/")):
        return None
    if len(body) > 2 * 1024 * 1024:
        return {"detail": None, "reason": "JSON_BODY_LIMIT", "diagnostic": {"body_bytes": len(body)}}
    try:
        payload = json.loads(body)
    except Exception:
        return {"detail": None, "reason": "INVALID_JSON", "diagnostic": {"body_bytes": len(body)}}
    detail = find_exact_aweme_detail(payload, expected_id)
    return {
        "detail": detail,
        "reason": None,
        "diagnostic": summarize_router_data([payload], expected_id),
    }


async def fetch_browser_api_detail(upstream, video_id: str) -> tuple[dict | None, int | None, list[dict], list[dict], dict]:
    if video_id != TARGET_ID:
        raise ProbeError("TARGET_VIDEO_ID_NOT_PINNED")
    from playwright.async_api import async_playwright

    diagnostics: list[dict] = []
    request_diagnostics: list[dict] = []
    captured_payloads: list[dict] = []
    captured_bytes = 0
    tasks: set[asyncio.Task] = set()
    browser = None
    detail_future = asyncio.get_running_loop().create_future()
    page_state = {"status": "not_started", "target_page_matched": False}

    async def inspect_response(response):
        nonlocal captured_bytes
        try:
            parsed = urllib.parse.urlsplit(response.url)
            host = (parsed.hostname or "").lower()
            path = parsed.path
            if host not in {"www.douyin.com", "www.iesdouyin.com", "iesdouyin.com"}:
                return
            if not any(token in path.lower() for token in ("/aweme/", "/api/", "/video/", "/feed/", "/detail/")):
                return
            content_type = response.headers.get("content-type", "")
            mime_type = content_type.split(";", 1)[0].strip().lower()
            is_aweme_detail_text = path.rstrip("/").lower().endswith("/aweme/v1/web/aweme/detail") and mime_type == "text/plain"
            if int(response.status) != 200 or not ("json" in mime_type or is_aweme_detail_text):
                if len(diagnostics) < 40:
                    diagnostics.append({
                        "host": host,
                        "path": path[:220],
                        "status": int(response.status),
                        "content_type": mime_type[:80],
                        "reason": "NON_200_OR_UNSUPPORTED_CONTENT_TYPE",
                    })
                return
            body = await response.body()
            inspected = inspect_first_party_api_json(host, path, int(response.status), content_type, body, video_id)
            if inspected is None:
                return
            diagnostics.append({
                "host": host,
                "path": path[:220],
                "status": int(response.status),
                "content_type": content_type.split(";", 1)[0][:80],
                "body_bytes": len(body),
                "reason": inspected.get("reason"),
                "diagnostic": inspected.get("diagnostic"),
            })
            if len(captured_payloads) < 12 and captured_bytes + len(body) <= 6 * 1024 * 1024:
                captured_payloads.append({
                    "host": host,
                    "path": path[:220],
                    "status": int(response.status),
                    "body_base64": base64.b64encode(body).decode("ascii"),
                })
                captured_bytes += len(body)
            detail = inspected.get("detail")
            if detail is not None and not detail_future.done():
                detail_future.set_result((detail, int(response.status)))
        except Exception:
            return

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=upstream._UA,
                locale="zh-CN",
                viewport={"width": 1280, "height": 720},
                extra_http_headers={"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"},
            )
            if await context.cookies():
                raise ProbeError("BROWSER_CONTEXT_NOT_ANONYMOUS")
            page = await context.new_page()

            def on_request(request):
                try:
                    parsed = urllib.parse.urlsplit(request.url)
                    host = (parsed.hostname or "").lower()
                    path = parsed.path
                    if host in {"www.douyin.com", "www.iesdouyin.com", "iesdouyin.com"} and any(
                        token in path.lower() for token in ("/aweme/", "/api/", "/video/", "/feed/", "/detail/")
                    ):
                        if len(request_diagnostics) < 40:
                            request_diagnostics.append({
                                "host": host,
                                "path": path[:220],
                                "method": request.method,
                                "resource_type": request.resource_type,
                            })
                except Exception:
                    return

            def on_response(response):
                if detail_future.done() and len(captured_payloads) >= 12:
                    return
                task = asyncio.create_task(inspect_response(response))
                tasks.add(task)
                task.add_done_callback(tasks.discard)

            page.on("request", on_request)
            page.on("response", on_response)
            try:
                await page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=25_000)
            except Exception:
                # A navigation timeout is not treated as a successful page load.
                pass
            parsed_final = urllib.parse.urlsplit(page.url)
            page_state = {
                "status": "target_page" if is_target_page_url(page.url, video_id) else "page_identity_mismatch",
                "target_page_matched": is_target_page_url(page.url, video_id),
                "host": (parsed_final.hostname or "")[:120],
                "path": parsed_final.path[:220],
                "first_party_api_requests": request_diagnostics,
            }
            if not page_state["target_page_matched"]:
                return None, None, diagnostics, captured_payloads, page_state
            try:
                detail, response_status = await asyncio.wait_for(asyncio.shield(detail_future), timeout=14)
                return detail, response_status, diagnostics, captured_payloads, page_state
            except asyncio.TimeoutError:
                await page.wait_for_timeout(2500)
                if not detail_future.cancelled() and detail_future.done():
                    detail, response_status = detail_future.result()
                    return detail, response_status, diagnostics, captured_payloads, page_state
                return None, None, diagnostics, captured_payloads, page_state
    except ProbeError:
        raise
    except Exception as exc:
        page_state = {"status": "browser_capture_failed", "error_type": type(exc).__name__[:80], "target_page_matched": False}
        return None, None, diagnostics, captured_payloads, page_state
    finally:
        for task in list(tasks):
            if not task.done():
                task.cancel()
        if browser is not None:
            try:
                await browser.close()
            except Exception:
                pass


def ffprobe(path: Path) -> dict:
    try:
        proc = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels",
            "-of", "json", str(path),
        ], capture_output=True, text=True, timeout=30, check=False)
        if proc.returncode != 0:
            raise ProbeError("FFPROBE_FAILED")
        data = json.loads(proc.stdout)
        streams = data.get("streams")
        if not isinstance(streams, list):
            raise ProbeError("FFPROBE_STREAMS_MISSING")
        duration = float((data.get("format") or {}).get("duration") or 0)
        return {"duration_s": round(duration, 3), "streams": [
            {key: item.get(key) for key in ("codec_type", "codec_name", "width", "height", "sample_rate", "channels") if item.get(key) is not None}
            for item in streams if isinstance(item, dict)
        ]}
    except ProbeError:
        raise
    except Exception:
        raise ProbeError("FFPROBE_FAILED") from None


def extract_frames(video_path: Path, frame_dir: Path, duration_s: float) -> list[dict]:
    if duration_s <= 1:
        return []
    frame_dir.mkdir(parents=True, exist_ok=True)
    fractions = (0.08, 0.24, 0.40, 0.56, 0.72, 0.88)
    result = []
    for index, fraction in enumerate(fractions, start=1):
        timestamp = min(max(0.1, duration_s * fraction), duration_s - 0.25)
        target = frame_dir / f"frame_{index:02d}.jpg"
        proc = subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{timestamp:.3f}",
            "-i", str(video_path), "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "5", "-y", str(target),
        ], capture_output=True, timeout=45, check=False)
        if proc.returncode == 0 and target.exists() and target.stat().st_size > 1024:
            result.append({"file": f"frames/{target.name}", "time_s": round(timestamp, 3)})
        else:
            target.unlink(missing_ok=True)
    return result


def make_contact_sheet(work_dir: Path, frame_rows: list[dict]) -> bool:
    if len(frame_rows) < 2:
        return False
    from PIL import Image, ImageDraw
    cell_w, cell_h, label_h = 480, 290, 24
    sheet = Image.new("RGB", (cell_w * 2, (cell_h + label_h) * 3), "white")
    draw = ImageDraw.Draw(sheet)
    for index, row in enumerate(frame_rows[:6]):
        image_path = work_dir / row["file"]
        with Image.open(image_path) as source:
            thumb = source.convert("RGB")
            thumb.thumbnail((cell_w, cell_h))
            x = (index % 2) * cell_w
            y = (index // 2) * (cell_h + label_h)
            sheet.paste(thumb, (x, y))
            draw.text((x + 6, y + cell_h + 4), f"{row['time_s']:.1f}s", fill="black")
    sheet.save(work_dir / "contact_sheet.jpg", quality=86, optimize=True)
    return True


def encrypt_bundle(work_dir: Path, output_dir: Path, public_key: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / "payload.tar.gz"
    encrypted = output_dir / "payload.tar.gz.enc"
    passphrase_file = output_dir / "passphrase.tmp"
    wrapped_key = output_dir / "passphrase.rsa"
    hmac_file = output_dir / "payload.tar.gz.enc.hmac"
    with tarfile.open(archive, "w:gz") as bundle:
        bundle.add(work_dir, arcname="result")
    passphrase = secrets.token_hex(64)
    passphrase_file.write_text(passphrase, encoding="ascii")
    try:
        subprocess.run([
            "openssl", "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "250000",
            "-pass", f"file:{passphrase_file}", "-in", str(archive), "-out", str(encrypted),
        ], check=True, capture_output=True)
        subprocess.run([
            "openssl", "pkeyutl", "-encrypt", "-pubin", "-inkey", str(public_key),
            "-in", str(passphrase_file), "-out", str(wrapped_key),
            "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256",
        ], check=True, capture_output=True)
        mac_key = bytes.fromhex(passphrase)[32:]
        digest = hmac.new(mac_key, encrypted.read_bytes(), hashlib.sha256).hexdigest()
        hmac_file.write_text(digest + "\n", encoding="ascii")
        (output_dir / "ENCRYPTION.txt").write_text(
            "Private one-time bundle. RSA-3072 OAEP-SHA256 wraps a random passphrase; "
            "OpenSSL AES-256-CBC with PBKDF2-SHA256 (250000 iterations) encrypts the tar.gz; "
            "HMAC-SHA256 authenticates the ciphertext. The matching private key is not in this repository.\n",
            encoding="utf-8",
        )
        return {
            "encrypted_bytes": encrypted.stat().st_size,
            "encrypted_sha256": hashlib.sha256(encrypted.read_bytes()).hexdigest(),
            "wrapped_key_sha256": hashlib.sha256(wrapped_key.read_bytes()).hexdigest(),
            "hmac_sha256": digest,
        }
    finally:
        archive.unlink(missing_ok=True)
        passphrase_file.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--upstream-root", required=True)
    parser.add_argument("--public-key", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    if args.video_id != TARGET_ID or not validate_video_id(args.video_id):
        raise ProbeError("TARGET_VIDEO_ID_NOT_PINNED")
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        if os.environ.get(key):
            raise ProbeError("PROXY_ENVIRONMENT_NOT_ALLOWED")
    upstream_root = Path(args.upstream_root).resolve()
    public_key = Path(args.public_key).resolve()
    if not (upstream_root / "server.py").is_file() or not public_key.is_file():
        raise ProbeError("PINNED_UPSTREAM_OR_PUBLIC_KEY_MISSING")
    sys.path.insert(0, str(upstream_root))
    import server as upstream
    import recognition

    work_dir = Path(tempfile.mkdtemp(prefix="yutang-media-result-"))
    media_dir = Path(tempfile.mkdtemp(prefix="yutang-media-temp-"))
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    result = {
        "schema": 1,
        "target_video_id": TARGET_ID,
        "source_url": TARGET_URL,
        "source_method": "anonymous_iesdouyin_share_router_data_exact_id",
        "upstream_repo": "ZY-ZhichaoYu/shared-video-transcriber",
        "upstream_commit": UPSTREAM_COMMIT,
        "authenticated": False,
        "proxy_used": False,
        "detail_id_verified": False,
        "detail_http_status": None,
        "audio": {"status": "not_attempted"},
        "transcription": {"status": "not_attempted"},
        "video": {"status": "not_attempted"},
        "frames": [],
    }
    try:
        detail, detail_status, router_data_objects = fetch_share_page_detail(upstream, TARGET_ID)
        browser_api_diagnostic = []
        browser_api_payloads = []
        browser_page_state = {"status": "not_attempted", "target_page_matched": False}
        if detail is None:
            detail, browser_api_status, browser_api_diagnostic, browser_api_payloads, browser_page_state = asyncio.run(
                fetch_browser_api_detail(upstream, TARGET_ID)
            )
            if detail is not None:
                detail_status = browser_api_status
                result["source_method"] = "anonymous_first_party_browser_api_exact_id"
        result["detail_id_verified"] = is_verified_detail(detail, TARGET_ID)
        result["detail_http_status"] = detail_status
        if not result["detail_id_verified"]:
            result["status"] = "FIRST_PARTY_API_VIDEO_OBJECT_NOT_FOUND"
            result["router_data_diagnostic"] = summarize_router_data(router_data_objects, TARGET_ID)
            result["browser_api_diagnostic"] = browser_api_diagnostic
            result["browser_page_state"] = browser_page_state
            (work_dir / "router_data.json").write_text(json.dumps(router_data_objects, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            (work_dir / "browser_api_responses.json").write_text(json.dumps(browser_api_payloads, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            (work_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            encrypted = encrypt_bundle(work_dir, output_dir, public_key)
            print("MEDIA_PROBE_RESULT " + json.dumps({
                "status": result["status"],
                "target_video_id": TARGET_ID,
                "detail_id_verified": False,
                "detail_http_status": detail_status,
                "router_data_diagnostic": result["router_data_diagnostic"],
                "browser_api_diagnostic": browser_api_diagnostic,
                "browser_page_state": browser_page_state,
                "encrypted_artifact": encrypted,
            }, ensure_ascii=False))
            return 0
        video = detail["video"]
        audio_url = upstream._pick_url_for_transcription(video)
        audio_path = media_dir / "audio.bin"
        try:
            audio_stats = safe_download(audio_url, audio_path, AUDIO_LIMIT, upstream._UA)
            audio_probe = ffprobe(audio_path)
            if not any(s.get("codec_type") == "audio" for s in audio_probe["streams"]):
                raise ProbeError("DOWNLOADED_MEDIA_HAS_NO_AUDIO")
            result["audio"] = {"status": "downloaded", **audio_stats, **audio_probe}
            try:
                asr = recognition.transcribe(str(audio_path), model_size="tiny", language=None)
                transcript = str(asr.get("transcript") or "")
                segments = asr.get("segments") if isinstance(asr.get("segments"), list) else []
                (work_dir / "transcript.txt").write_text(transcript, encoding="utf-8")
                safe_segments = [{"start": s.get("start"), "end": s.get("end"), "text": s.get("text", "")}
                                 for s in segments if isinstance(s, dict)]
                (work_dir / "segments.json").write_text(json.dumps(safe_segments, ensure_ascii=False, indent=2), encoding="utf-8")
                result["transcription"] = {
                    "status": "completed" if transcript.strip() else "empty",
                    "model": "tiny",
                    "language": asr.get("language"),
                    "duration_s": round(float(asr.get("duration") or 0), 3),
                    "segment_count": len(safe_segments),
                    "character_count": len(transcript),
                    "review_count": int(asr.get("review_count") or 0),
                }
            except Exception:
                result["transcription"] = {"status": "failed", "reason_code": "WHISPER_TRANSCRIPTION_FAILED"}
        except ProbeError as exc:
            result["audio"] = {"status": "failed", "reason_code": exc.code}

        video_url = None
        candidates = upstream._sorted_progressive_candidates(video)
        if candidates:
            video_url = candidates[0][1]
        else:
            candidates = upstream._sorted_candidates(video)
            if candidates:
                video_url = candidates[0][1]
        if video_url:
            video_path = media_dir / "video.bin"
            try:
                video_stats = safe_download(video_url, video_path, VIDEO_LIMIT, upstream._UA)
                video_probe = ffprobe(video_path)
                if not any(s.get("codec_type") == "video" for s in video_probe["streams"]):
                    raise ProbeError("DOWNLOADED_MEDIA_HAS_NO_VIDEO")
                frame_rows = extract_frames(video_path, work_dir / "frames", video_probe["duration_s"])
                result["video"] = {"status": "downloaded", **video_stats, **video_probe}
                result["frames"] = frame_rows
                result["contact_sheet_created"] = make_contact_sheet(work_dir, frame_rows)
            except ProbeError as exc:
                result["video"] = {"status": "failed", "reason_code": exc.code}
        else:
            result["video"] = {"status": "unavailable", "reason_code": "NO_VIDEO_CANDIDATE"}

        if result["audio"]["status"] == "downloaded" and result["transcription"]["status"] == "completed" and result["video"]["status"] == "downloaded" and len(result["frames"]) >= 4:
            result["status"] = "AUDIO_TRANSCRIBED_AND_VIDEO_FRAMES_EXTRACTED"
        elif result["audio"]["status"] == "downloaded":
            result["status"] = "AUDIO_DOWNLOADED_PARTIAL"
        elif result["video"]["status"] == "downloaded":
            result["status"] = "VIDEO_FRAMES_ONLY_PARTIAL"
        else:
            result["status"] = "MEDIA_EXTRACTION_BLOCKED"
        (work_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        if result["status"] == "MEDIA_EXTRACTION_BLOCKED":
            print("MEDIA_PROBE_RESULT " + json.dumps({k: result[k] for k in ("status", "target_video_id", "detail_id_verified", "detail_http_status", "audio", "video")}, ensure_ascii=False))
            return 2
        encrypted = encrypt_bundle(work_dir, output_dir, public_key)
        summary = {
            "status": result["status"],
            "target_video_id": TARGET_ID,
            "detail_id_verified": result["detail_id_verified"],
            "detail_http_status": result["detail_http_status"],
            "audio_bytes": result["audio"].get("bytes"),
            "audio_sha256": result["audio"].get("sha256"),
            "audio_streams": result["audio"].get("streams"),
            "transcription_status": result["transcription"].get("status"),
            "transcription_language": result["transcription"].get("language"),
            "transcription_segments": result["transcription"].get("segment_count"),
            "transcription_characters": result["transcription"].get("character_count"),
            "video_bytes": result["video"].get("bytes"),
            "video_sha256": result["video"].get("sha256"),
            "video_streams": result["video"].get("streams"),
            "frame_count": len(result["frames"]),
            "encrypted_artifact": encrypted,
        }
        print("MEDIA_PROBE_RESULT " + json.dumps(summary, ensure_ascii=False))
        return 0
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
        shutil.rmtree(media_dir, ignore_errors=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ProbeError as exc:
        print("MEDIA_PROBE_BLOCKED " + exc.code)
        raise SystemExit(2)
    except Exception:
        print("MEDIA_PROBE_BLOCKED UNEXPECTED_FAILURE")
        raise SystemExit(2)
