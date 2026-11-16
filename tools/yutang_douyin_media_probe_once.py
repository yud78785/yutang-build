#!/usr/bin/env python3
"""One-shot, anonymous Douyin media probe using a pinned MIT upstream reader.

No login, cookies, proxy, retry, account, model API, or public plaintext artifact.
Only the encrypted result bundle leaves the ephemeral runner.
"""
from __future__ import annotations

import argparse
import asyncio
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


async def fetch_exact_detail(video_id: str, user_agent: str) -> tuple[dict, int]:
    """Capture one first-party detail response and require the exact aweme_id."""
    from playwright.async_api import async_playwright

    future = asyncio.get_running_loop().create_future()
    tasks: set[asyncio.Task] = set()
    browser = None
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=user_agent,
                locale="zh-CN",
                viewport={"width": 1280, "height": 720},
                extra_http_headers={"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"},
            )
            if await context.cookies():
                raise ProbeError("ANONYMOUS_CONTEXT_NOT_EMPTY")
            page = await context.new_page()

            async def parse_response(response):
                try:
                    if response.status != 200:
                        return
                    payload = await response.json()
                    detail = exact_aweme_detail(payload, video_id)
                    if detail is not None and not future.done():
                        future.set_result((detail, int(response.status)))
                except Exception:
                    return

            def on_response(response):
                if future.done():
                    return
                try:
                    parsed = urllib.parse.urlsplit(response.url)
                    if parsed.scheme != "https" or parsed.hostname != "www.douyin.com":
                        return
                    if "/aweme/v1/web/aweme/detail" not in parsed.path:
                        return
                    task = asyncio.create_task(parse_response(response))
                    tasks.add(task)
                    task.add_done_callback(tasks.discard)
                except Exception:
                    return

            page.on("response", on_response)
            try:
                await page.goto(TARGET_URL, wait_until="commit", timeout=20_000)
            except Exception:
                # The exact detail response may arrive even if navigation reports a timeout.
                pass
            if not is_target_page_url(page.url, video_id):
                raise ProbeError("VIDEO_PAGE_IDENTITY_MISMATCH")
            try:
                detail, status = await asyncio.wait_for(future, timeout=18)
            except asyncio.TimeoutError:
                raise ProbeError("EXACT_DETAIL_RESPONSE_NOT_OBSERVED") from None
            if str(detail.get("aweme_id", "")) != video_id:
                raise ProbeError("VIDEO_ID_MISMATCH")
            return detail, status
    except ProbeError:
        raise
    except Exception:
        raise ProbeError("ANONYMOUS_PLAYWRIGHT_DETAIL_FAILED") from None
    finally:
        for task in list(tasks):
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
    upstream._DETAIL_RESPONSE_RETRIES = 1
    upstream._DETAIL_RESPONSE_TIMEOUT = 18.0

    work_dir = Path(tempfile.mkdtemp(prefix="yutang-media-result-"))
    media_dir = Path(tempfile.mkdtemp(prefix="yutang-media-temp-"))
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    result = {
        "schema": 1,
        "target_video_id": TARGET_ID,
        "source_url": TARGET_URL,
        "source_method": "anonymous_playwright_aweme_detail_exact_id",
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
        detail, detail_status = asyncio.run(fetch_exact_detail(TARGET_ID, upstream._UA))
        result["detail_id_verified"] = str(detail.get("aweme_id")) == TARGET_ID
        result["detail_http_status"] = detail_status
        if not result["detail_id_verified"]:
            raise ProbeError("VIDEO_ID_MISMATCH")
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
