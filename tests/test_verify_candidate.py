import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from verify_candidate import VerificationError, verify, pe_info


def test_exe(cert=False):
    exe = bytearray(2048)
    exe[:2] = b"MZ"
    struct.pack_into("<I", exe, 0x3c, 0x80)
    exe[0x80:0x84] = b"PE\x00\x00"
    struct.pack_into("<HHIIIHH", exe, 0x84, 0x14c, 5, 0, 0, 0, 224, 0x10f)
    struct.pack_into("<H", exe, 0x98, 0x10b)
    if cert:
        struct.pack_into("<II", exe, 0x98 + 96 + 4 * 8, 256, 100)
    return bytes(exe)


def candidate(tmp, names=None, exe=None, result=None, compression=zipfile.ZIP_DEFLATED):
    import hashlib
    exe = test_exe() if exe is None else exe
    exename = "candidate.exe"
    resultname = "YUTANG-RESULT.txt"
    esha = hashlib.sha256(exe).hexdigest()
    source = "".join("a" for _ in range(40))
    result = result if result is not None else "\n".join([
        "STATUS: WINDOWS CI CANDIDATE ONLY - NOT AN END-TO-END SECURITY RELEASE",
        "PINNED COMMIT: " + source,
        "FILE: " + exename,
        "SHA256: " + esha,
        "NOT PROVEN: real Douyin playback, model reasoning, continuous autonomy, memory synchronization, signed release trust",
        "NOT PROVEN: real Douyin playback, model reasoning, continuous autonomy, memory synchronization, signed release trust",
    ])
    p = Path(tmp) / "sample.zip"
    with zipfile.ZipFile(p, "w", compression=compression) as z:
        for name in (names if names is not None else [exename, resultname]):
            z.writestr(name, exe if name == exename else result)
    exp = {"zip_sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
           "zip_size": p.stat().st_size,"exe_name":exename,"exe_sha256":esha,
           "exe_size":len(exe),"result_name":resultname,"source_commit":source,
           "actions_run":123, "runner_commit":"b"*40}
    return p, exp


class VerifyOffline(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.p, self.expect = candidate(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_good_fixture(self):
        self.assertEqual(verify(self.p,self.expect)["verdict"],"PASS_FILE_IDENTITY_ONLY")

    def test_zip_hash_mismatch(self):
        self.expect["zip_sha256"] = "0" * 64
        with self.assertRaisesRegex(VerificationError,"ZIP SHA256"):
            verify(self.p,self.expect)

    def test_zip_size_mismatch(self):
        self.expect["zip_size"] += 1
        with self.assertRaisesRegex(VerificationError,"ZIP size"):
            verify(self.p,self.expect)

    def test_exe_hash_mismatch(self):
        self.expect["exe_sha256"] = "f" * 64
        with self.assertRaisesRegex(VerificationError,"EXE SHA256"):
            verify(self.p,self.expect)

    def test_missing_warning(self):
        self.p, self.expect = candidate(self.temp.name, result="unexpected")
        with self.assertRaisesRegex(VerificationError,"candidate report"):
            verify(self.p,self.expect)

    def test_duplicate_entry(self):
        self.p,self.expect=candidate(self.temp.name,names=["candidate.exe","candidate.exe","YUTANG-RESULT.txt"])
        with self.assertRaisesRegex(VerificationError,"unexpected/missing/duplicate"):
            verify(self.p,self.expect)

    def test_path_traversal(self):
        self.p,self.expect=candidate(self.temp.name,names=["candidate.exe","../evil.txt"])
        with self.assertRaisesRegex(VerificationError,"unexpected/missing/duplicate"):
            verify(self.p,self.expect)

    def test_other_member(self):
        self.p,self.expect=candidate(self.temp.name,names=["candidate.exe","YUTANG-RESULT.txt","private.txt"])
        with self.assertRaisesRegex(VerificationError,"unexpected/missing/duplicate"):
            verify(self.p,self.expect)

    def test_malformed_pe(self):
        self.p,self.expect=candidate(self.temp.name,exe=b"X"*2048)
        with self.assertRaisesRegex(VerificationError,"MZ"):
            verify(self.p,self.expect)

    def test_cert_table_does_not_claim_trust(self):
        info=pe_info(test_exe(cert=True))
        self.assertTrue(info["certificate_table_present"])
        self.assertIn("not cryptographic",info["note"])

    def test_symlink_archive_rejected(self):
        sym = Path(self.temp.name)/"symbolic.zip"
        os.symlink(self.p, sym)
        with self.assertRaisesRegex(VerificationError,"non-symlink"):
            verify(sym,self.expect)

    def test_unsigned_fixture(self):
        info=pe_info(test_exe())
        self.assertFalse(info["certificate_table_present"])

    def test_crc_detects_damage_when_hashes_restored(self):
        # Zipfile validates CRC when decompression is reached even when archive SHA pin is updated.
        self.p, self.expect = candidate(self.temp.name, compression=zipfile.ZIP_STORED)
        data=bytearray(self.p.read_bytes())
        n=data.find(b"MZ")
        self.assertGreater(n,0)
        data[n] ^= 1
        self.p.write_bytes(bytes(data))
        import hashlib
        self.expect["zip_sha256"]=hashlib.sha256(data).hexdigest()
        with self.assertRaises((zipfile.BadZipFile, VerificationError,EOFError)):
            verify(self.p,self.expect)

if __name__ == "__main__":
    unittest.main()
