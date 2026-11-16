import hashlib
import hmac
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "yutang_douyin_media_probe_once.py"
spec = importlib.util.spec_from_file_location("media_probe", SCRIPT)
media_probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media_probe)


def public_resolver(host, port, type):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]


def private_resolver(host, port, type):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]


class FakeResponse:
    def __init__(self, body, total=None):
        self.body = body
        self.offset = 0
        self.headers = {"Content-Type": "video/mp4"}
        if total is not None:
            self.headers["Content-Length"] = str(total)

    def __enter__(self): return self
    def __exit__(self, *args): return False
    def geturl(self): return "https://cdn.example.test/media.bin"

    def read(self, size):
        chunk = self.body[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk


class FakeOpener:
    def __init__(self, response): self.response = response
    def open(self, request, timeout): return self.response


class TargetIdentityTests(unittest.TestCase):
    def test_only_expected_numeric_video_id_shape(self):
        self.assertTrue(media_probe.validate_video_id("7445301722639060233"))
        for value in ("", "abc", "123", "https://www.douyin.com/video/7445301722639060233", "1" * 31):
            self.assertFalse(media_probe.validate_video_id(value))

    def test_only_exact_public_target_page_is_accepted(self):
        good = "https://www.douyin.com/video/7445301722639060233"
        self.assertTrue(media_probe.is_target_page_url(good, "7445301722639060233"))
        for url in (
            "https://www.douyin.com/video/7577614489533680959",
            "https://evil.example/video/7445301722639060233",
            "http://www.douyin.com/video/7445301722639060233",
            "https://www.douyin.com/login",
        ):
            self.assertFalse(media_probe.is_target_page_url(url, "7445301722639060233"))

    def test_detail_must_match_exact_aweme_id_and_contain_video(self):
        good = {"aweme_detail": {"aweme_id": "7445301722639060233", "video": {"play_addr": {}}}}
        self.assertEqual(media_probe.exact_aweme_detail(good, "7445301722639060233"), good["aweme_detail"])
        wrong = {"aweme_detail": {"aweme_id": "7577614489533680959", "video": {"play_addr": {}}}}
        self.assertIsNone(media_probe.exact_aweme_detail(wrong, "7445301722639060233"))
        no_video = {"aweme_detail": {"aweme_id": "7445301722639060233"}}
        self.assertIsNone(media_probe.exact_aweme_detail(no_video, "7445301722639060233"))
        self.assertIsNone(media_probe.exact_aweme_detail([], "7445301722639060233"))


class NetworkBoundaryTests(unittest.TestCase):
    def test_accepts_https_public_host(self):
        with patch.object(media_probe.socket, "getaddrinfo", side_effect=public_resolver):
            self.assertEqual(media_probe.validate_public_https_url("https://cdn.example.test/video.mp4?sig=redacted"), "cdn.example.test")

    def test_rejects_http_userinfo_and_nonstandard_port(self):
        with patch.object(media_probe.socket, "getaddrinfo", side_effect=public_resolver):
            for url in ("http://cdn.example.test/a", "https://user:pass@cdn.example.test/a", "https://cdn.example.test:8443/a"):
                with self.subTest(url=url), self.assertRaises(media_probe.ProbeError):
                    media_probe.validate_public_https_url(url)

    def test_rejects_ip_literal_and_private_dns(self):
        with self.assertRaisesRegex(media_probe.ProbeError, "MEDIA_IP_LITERAL_REJECTED"):
            media_probe.validate_public_https_url("https://93.184.216.34/a")
        with patch.object(media_probe.socket, "getaddrinfo", side_effect=private_resolver):
            with self.assertRaisesRegex(media_probe.ProbeError, "MEDIA_DNS_NONPUBLIC"):
                media_probe.validate_public_https_url("https://cdn.example.test/a")

    def test_rejects_empty_or_failed_dns(self):
        with patch.object(media_probe.socket, "getaddrinfo", return_value=[]):
            with self.assertRaisesRegex(media_probe.ProbeError, "MEDIA_DNS_EMPTY"):
                media_probe.validate_public_https_url("https://cdn.example.test/a")
        with patch.object(media_probe.socket, "getaddrinfo", side_effect=OSError("dns")):
            with self.assertRaisesRegex(media_probe.ProbeError, "MEDIA_URL_OR_DNS_INVALID"):
                media_probe.validate_public_https_url("https://cdn.example.test/a")

    def test_download_is_bounded_and_checks_length_and_hash(self):
        response = FakeResponse(b"abcdef", total=6)
        with patch.object(media_probe.socket, "getaddrinfo", side_effect=public_resolver), \
             patch.object(media_probe.urllib.request, "build_opener", return_value=FakeOpener(response)):
            with tempfile.TemporaryDirectory() as root:
                path = Path(root) / "media.bin"
                result = media_probe.safe_download("https://cdn.example.test/media.bin", path, 10, "test-agent")
                self.assertEqual(path.read_bytes(), b"abcdef")
                self.assertEqual(result["bytes"], 6)
                self.assertEqual(result["sha256"], hashlib.sha256(b"abcdef").hexdigest())
        response = FakeResponse(b"01234567890", total=11)
        with patch.object(media_probe.socket, "getaddrinfo", side_effect=public_resolver), \
             patch.object(media_probe.urllib.request, "build_opener", return_value=FakeOpener(response)):
            with tempfile.TemporaryDirectory() as root:
                path = Path(root) / "too-large.bin"
                with self.assertRaisesRegex(media_probe.ProbeError, "MEDIA_SIZE_LIMIT"):
                    media_probe.safe_download("https://cdn.example.test/media.bin", path, 10, "test-agent")
                self.assertFalse(path.exists())

    def test_redirect_handler_rejects_unsafe_redirect(self):
        handler = media_probe.SafeRedirectHandler()
        with self.assertRaises(media_probe.ProbeError):
            handler.redirect_request(None, None, 302, "Found", {}, "http://127.0.0.1/private")


    def test_share_router_search_requires_exact_aweme_id(self):
        payload = {"outer": [{"aweme_detail": {"aweme_id": "7577614489533680959", "video": {}}},
                             {"aweme_id": "7445301722639060233", "video": {"play_addr": {}}}]}
        found = media_probe.find_exact_aweme_detail(payload, "7445301722639060233")
        self.assertEqual(found["aweme_id"], "7445301722639060233")
        self.assertIsNone(media_probe.find_exact_aweme_detail(payload, "7000000000000000000"))

    def test_share_page_parser_rejects_redirect_identity_and_mismatched_data(self):
        fake_upstream = type("Upstream", (), {
            "_MOBILE_UA": "test-agent",
            "_extract_json_object_after_marker": staticmethod(lambda html, marker: {
                "aweme_detail": {"aweme_id": "7445301722639060233", "video": {"play_addr": {}, "duration": 1000}}
            }),
            "_looks_like_douyin_video": staticmethod(lambda video: isinstance(video, dict) and "play_addr" in video and "duration" in video),
        })()
        with patch.object(media_probe, "safe_fetch_text", return_value=("html", "https://www.iesdouyin.com/share/video/7445301722639060233/", 200)):
            detail, status = media_probe.fetch_share_page_detail(fake_upstream, "7445301722639060233")
            self.assertEqual(detail["aweme_id"], "7445301722639060233")
            self.assertEqual(status, 200)
        fake_wrong = type("Upstream", (), {
            "_MOBILE_UA": "test-agent",
            "_extract_json_object_after_marker": staticmethod(lambda html, marker: {
                "aweme_detail": {"aweme_id": "7577614489533680959", "video": {"play_addr": {}, "duration": 1000}}
            }),
            "_looks_like_douyin_video": staticmethod(lambda video: isinstance(video, dict) and "play_addr" in video and "duration" in video),
        })()
        with patch.object(media_probe, "safe_fetch_text", return_value=("html", "https://www.iesdouyin.com/share/video/7445301722639060233/", 200)):
            with self.assertRaisesRegex(media_probe.ProbeError, "SHARE_PAGE_EXACT_VIDEO_ID_NOT_FOUND"):
                media_probe.fetch_share_page_detail(fake_wrong, "7445301722639060233")

    def test_share_page_redirect_only_allows_official_hosts(self):
        handler = media_probe.DouyinPageRedirectHandler()
        with self.assertRaises(media_probe.ProbeError):
            handler.redirect_request(None, None, 302, "Found", {}, "https://evil.example/video/7445301722639060233")


class EncryptionTests(unittest.TestCase):
    def test_bundle_is_encrypted_authenticated_and_roundtrips(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            work = root / "work"
            work.mkdir()
            (work / "transcript.txt").write_text("private test transcript", encoding="utf-8")
            (work / "result.json").write_text(json.dumps({"video_id": "7445301722639060233"}), encoding="utf-8")
            key = root / "private.pem"
            pub = root / "public.pem"
            subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(key)], check=True, capture_output=True)
            subprocess.run(["openssl", "pkey", "-in", str(key), "-pubout", "-out", str(pub)], check=True, capture_output=True)
            output = root / "encrypted"
            info = media_probe.encrypt_bundle(work, output, pub)
            encrypted = output / "payload.tar.gz.enc"
            wrapped = output / "passphrase.rsa"
            mac = output / "payload.tar.gz.enc.hmac"
            self.assertEqual(hashlib.sha256(encrypted.read_bytes()).hexdigest(), info["encrypted_sha256"])
            self.assertNotIn(b"private test transcript", encrypted.read_bytes())
            passfile = root / "passphrase.txt"
            subprocess.run(["openssl", "pkeyutl", "-decrypt", "-inkey", str(key), "-in", str(wrapped), "-out", str(passfile), "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256"], check=True, capture_output=True)
            passphrase = passfile.read_text(encoding="ascii")
            mac_key = bytes.fromhex(passphrase)[32:]
            expected = hmac.new(mac_key, encrypted.read_bytes(), hashlib.sha256).hexdigest()
            self.assertEqual(mac.read_text(encoding="ascii").strip(), expected)
            archive = root / "plain.tar.gz"
            subprocess.run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "250000", "-pass", f"file:{passfile}", "-in", str(encrypted), "-out", str(archive)], check=True, capture_output=True)
            extract = root / "extract"
            extract.mkdir()
            import tarfile
            with tarfile.open(archive, "r:gz") as bundle:
                bundle.extractall(extract, filter="data")
            self.assertEqual((extract / "result" / "transcript.txt").read_text(encoding="utf-8"), "private test transcript")


if __name__ == "__main__":
    unittest.main(verbosity=2)
