#!/usr/bin/env python3
"""Offline, read-only verifier for one immutable YuTang Windows CI candidate ZIP.

Uses Python stdlib only. Does not extract, execute, upload, fetch, or modify data.
The pinned hashes here identify ONE known candidate, not proof it is safe to run.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

EXPECTED = {
    "zip_sha256": "b5febe43b2e947a86feda01484fbbc475776649ed7687d8d984f5992af6370e9",
    "zip_size": 124753189,
    "exe_name": "Dafeiyu-Douyin-API-1.4.6-win-x64.exe",
    "exe_sha256": "e9f07dbed400bd77a8ab6350ea3a54d338d02d7a8f0c04d87cc621e148160290",
    "exe_size": 124737042,
    "result_name": "YUTANG-RESULT.txt",
    "source_commit": "912873e2556d16a088d81dcbc6f7c0060614dd58",
    "actions_run": 42942891622,
    "runner_commit": "74fae764b9c510f745b4a9f45fad88b662bd00d3",
}

class VerificationError(ValueError):
    pass

def digest_stream(reader, limit=None):
    h = hashlib.sha256()
    count = 0
    while True:
        data = reader.read(1024 * 1024)
        if not data:
            break
        count += len(data)
        if limit is not None and count > limit:
            raise VerificationError("file exceeded expected maximum size")
        h.update(data)
    return count, h.hexdigest()

def pe_info(header: bytes):
    """Inspect PE header and certificate TABLE only. NOT a signature verifier."""
    if len(header) < 512 or header[:2] != b"MZ":
        raise VerificationError("EXE missing DOS MZ header")
    pe_offset = struct.unpack_from("<I", header, 0x3c)[0]
    if pe_offset > 1024 * 1024 or pe_offset + 160 > len(header):
        raise VerificationError("PE header offset invalid or unavailable")
    if header[pe_offset:pe_offset + 4] != b"PE\x00\x00":
        raise VerificationError("EXE missing PE signature")
    machine, sections, timestamp, sym, symcount, opt_size, characteristics = struct.unpack_from("<HHIIIHH", header, pe_offset + 4)
    if machine != 0x14c or not (1 <= sections <= 96):
        raise VerificationError("unexpected executable PE machine/sections")
    optional = pe_offset + 24
    magic = struct.unpack_from("<H", header, optional)[0]
    if magic != 0x10b:
        raise VerificationError("unexpected PE optional header: expected PE32")
    directory_start = optional + 96
    if opt_size < 96 + 8 * 5:
        raise VerificationError("PE optional header too small for certificate directory")
    if directory_start + 40 > len(header):
        raise VerificationError("PE certificate directory unavailable")
    offset, size = struct.unpack_from("<II", header, directory_start + 8 * 4)
    if bool(offset) != bool(size):
        raise VerificationError("inconsistent PE certificate directory")
    return {"machine": "x86 (PE32)",
            "certificate_table_present": bool(offset and size),
            "note": "PE certificate table presence is not cryptographic Authenticode validation"}

def verify(archive: Path, expected=None):
    expected = EXPECTED if expected is None else expected
    archive = Path(archive)
    if not archive.is_file() or archive.is_symlink():
        raise VerificationError("archive must be a regular non-symlink file")
    if archive.stat().st_size != expected["zip_size"]:
        raise VerificationError("ZIP size mismatch")
    with archive.open("rb") as f:
        length, sha = digest_stream(f, limit=expected["zip_size"])
    if length != expected["zip_size"] or sha.lower() != expected["zip_sha256"].lower():
        raise VerificationError("ZIP SHA256 mismatch")
    if not zipfile.is_zipfile(archive):
        raise VerificationError("not a ZIP archive")
    with zipfile.ZipFile(archive, "r", allowZip64=False) as z:
        entries = z.infolist()
        allowed = {expected["exe_name"], expected["result_name"]}
        names = [x.filename for x in entries]
        if len(entries) != 2 or set(names) != allowed or len(set(names)) != 2:
            raise VerificationError("unexpected/missing/duplicate ZIP member")
        for x in entries:
            if x.is_dir() or x.flag_bits & 1 or x.filename.startswith("/") or ".." in x.filename:
                raise VerificationError("unsafe ZIP member")
            # ZIP attributes may be zero on Windows, but reject Unix symlink.
            if (x.external_attr >> 16) & 0o170000 == 0o120000:
                raise VerificationError("ZIP member is a symlink")
        exe = z.getinfo(expected["exe_name"])
        result = z.getinfo(expected["result_name"])
        if exe.file_size != expected["exe_size"] or result.file_size > 4096:
            raise VerificationError("unexpected ZIP member size")
        with z.open(exe) as f:
            header = f.read(4096)
            info = pe_info(header)
        with z.open(exe) as f:
            total, actual_exe_sha = digest_stream(f, limit=expected["exe_size"])
        if total != expected["exe_size"] or actual_exe_sha.lower() != expected["exe_sha256"].lower():
            raise VerificationError("EXE SHA256 mismatch")
        try:
            txt = z.read(expected["result_name"]).decode("utf-8-sig")
        except UnicodeDecodeError as e:
            raise VerificationError("invalid YUTANG-RESULT encoding") from e
        required_lines = [
            "STATUS: WINDOWS CI CANDIDATE ONLY - NOT AN END-TO-END SECURITY RELEASE",
            "PINNED COMMIT: " + expected["source_commit"],
            "FILE: " + expected["exe_name"],
            "SHA256: " + expected["exe_sha256"],
            "NOT PROVEN: real Douyin playback, model reasoning, continuous autonomy, memory synchronization, signed release trust",
            "NOT PROVEN: real Douyin playback, model reasoning, continuous autonomy, memory synchronization, signed release trust",
        ]
        if not all(line in txt.splitlines() for line in required_lines):
            raise VerificationError("candidate report missing expected source/limitations")
        return {"verdict": "PASS_FILE_IDENTITY_ONLY",
                "zip_sha256": sha, "exe_sha256": actual_exe_sha,
                "exe_bytes": total, "zip_bytes": length,
                "pe": info, "source_commit": expected["source_commit"],
                "actions_run": expected["actions_run"],
                "proven": ["two exact ZIP members", "CRC and size checked by decompression", "immutable SHA-256 values", "PE header and certificate table metadata", "unmodified candidate warning notice"],
                "not_proven": ["file safety or malware-free status", "code signing trust", "running EXE-to-Edge sandbox behavior", "Douyin and model end-to-end behavior"]}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip", help="path to original GitHub Actions candidate ZIP")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(verify(Path(args.zip)), indent=2, ensure_ascii=False))
    except (VerificationError, zipfile.BadZipFile, OSError, EOFError) as e:
        print(json.dumps({"verdict": "FAIL_CLOSED", "error": str(e)}, ensure_ascii=False), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
