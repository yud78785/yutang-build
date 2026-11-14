# Exact unsigned 1.4.7 artifact preservation record (NOT RELEASE)

Date: 2026-11-14. Original candidate belongs to product patch commit `9cc16d7e64d59dc141e9c6687b8dd461934fcc35` and workflow run `43541915930`. This record is evidence preservation only; it does not sign, publish or build a new EXE.

## Windows 2025 exact source artifact

- Artifact ID: `14092434238`, ZIP size **125575315 bytes**.
- Artifact ZIP SHA-256: `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- ZIP contents verified as a valid archive; no corrupt members.
- Embedded binary path: `desktop/release-api/Dafeiyu-Douyin-API-1.4.7-win-x64.exe`.
- Extracted EXE size: **125446071 bytes**.
- Actual extracted EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Verified embedded `verification-1.4.7.json`, `windows-candidate-receipt.json` and `.exe.sha256` all reference the same EXE hash. Receipt status `PASS_WINDOWS_PACKAGED_SMOKE_AND_EDGE_SECURITY`; signature `NotSigned`, `release=false`.
- GitHub artifact expiration: **2026-11-21 01:50:44 UTC**. A connector download was completed and preserved as a conversation ZIP file on 2026-11-14. Google Drive upload of this large ZIP failed: **HTTP 413, 125575315 > 104857600 bytes (100 MiB connector limit)**. Do NOT mark Drive backup as completed; a durable external copy of this ZIP still requires user verification or an approved alternative upload route.

## Windows 2022 same-file cross-test evidence

- Artifact ID: `14093021418`, ZIP size **169507 bytes**.
- Artifact ZIP SHA-256: `931181279e3b736c47f17c128dcb912b24f99fb05120a401bf4f060c5171642f`.
- Valid archive; cross receipt status `PASS_SAME_WINDOWS_2025_CANDIDATE_WINDOWS_2022_CROSS_TEST`.
- `sameBinaryAsWindows2025=true`, `sourceCandidateReceiptVerified=true`, `release=false`.
- Same EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Verified Google Drive upload inside the user's existing private `YuTang-Cloud-Build` folder: https://drive.google.com/file/d/1VE2lYcdXEHYoc2G1EPhTQAFdYWYZ5Wxl/view?usp=drivesdk. Drive metadata returned byte size 169507 and `shared=false`.
- GitHub Artifact expiration: **2026-11-21 01:56:15 UTC**.

## Preservation and release gates

- Archive before expiration: retain the exact original ZIP and corresponding same-file evidence, verifying ZIP SHA and extracted EXE SHA after saving. The ZIP digest is distinct from the inner EXE digest; both must be kept.
- Do not modify, resign or repackage the original evidence in-place. Its historical Windows pass relates only to the unsigned EXE SHA above.
- Do not confuse a saved ZIP, a successful Linux synthetic signing test or a Windows PowerShell static assertion with a signed EXE Windows acceptance.
- No new Windows Actions, signing, key creation, identity verification, code changes to the accepted EXE, `main` merge, public Release or updates were triggered by this archival step.
- When a real publisher certificate is obtained, sign a separately copied candidate. A new SHA-256 must pass actual Windows 2022/2025 checks before signing the Ed25519 manifest and conducting real update/download/rollback E2E acceptance.

## Local archive verification commands (future)

On a local Windows computer, compare SHA-256 of the saved ZIP with the value in this record:
```powershell
(Get-FileHash -LiteralPath 'C:\path\YuTang-1.4.7-Windows2025-Unsigned-EXE-Artifact-14092434238-NOT-RELEASE.zip' -Algorithm SHA256).Hash.ToLowerInvariant()
```
The result MUST be `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`. Use a separate safe extraction location and verify the extracted EXE hash. Do not run the unsigned EXE on the user's PC merely to preserve evidence.
