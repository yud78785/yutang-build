# YuTang 1.4.7 — original unsigned Windows artifacts, retained and reverified (2026-11-16)

## Scope and evidence identity

- **Source matrix run:** [GitHub Actions 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930), patch commit `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- **Fifth Windows 2025 public-homepage diagnostic:** [GitHub Actions 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361), exact EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` and receipt `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY`.
- All files here are **unsigned, non-release 1.4.7 candidates**, not a new build. No new runner/EXE was executed for this archival task.

## Byte-verified files before GitHub artifact expiry

| Exact GitHub artifact | Runner / purpose | Original ZIP bytes | ZIP SHA-256 | Embedded EXE SHA-256 |
|---|---|---:|---|---|
| `14092434238` | Windows 2025 original candidate | 125575315 | `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a` | `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` |
| `14092741259` | Windows 2022 independent build | 125575468 | `9f5b762380e4e1c12464eaeb508e69241fa066663634b5a53a16250e104c6322` | `19cbafd88291f98b40757b8af99883e32881e59a3a3aa04f980b5d875f1a584c` |
| `14093021418` | Windows 2022 cross-test of the **same 2025 EXE** | 169507 | `931181279e3b736c47f17c128dcb912b24f99fb05120a401bf4f060c5171642f` | **No EXE in archive**; receipt identifies original 2025 SHA `3201d433…dc241a34` |

Metadata from GitHub stated expiry at 2026-11-21 01:50:44 UTC, 01:50:49 UTC and 01:56:15 UTC respectively. All three ZIPs were downloaded before expiry, ZIP CRC checked and SHA-256 calculated. Both embedded EXE files were SHA-256 hashed without execution. Cross-test receipt status and exact SHA were independently parsed.

## Validated evidence, precisely scoped

- Windows 2025 original EXE: prior fifth diagnostic independently reported public HTTP 200 home page rendering, Renderer and Network Service sandbox, CDP loopback restriction and 0 remaining owned processes/port listeners. **This is not an actual target Douyin video/comment test.**
- Windows 2022 **same 2025 SHA** cross-test: source receipt `PASS_SAME_WINDOWS_2025_CANDIDATE_WINDOWS_2022_CROSS_TEST`; Renderer sandbox and Network Service AppContainer + Low Integrity true; 2 successful Edge restarts, desktop/host/guard forced exits, cleanup verified, final owned processes 0 and listeners 0. **Edge outbound network was firewalled; restart navigation HTTP 500 is expected, not a public-web or Douyin test.**
- Windows 2022 **independently built SHA**: receipt `PASS_WINDOWS_PACKAGED_SMOKE_AND_EDGE_SECURITY`, successful isolated packaging/sandbox/lifecycle tests. The ZIP's executable `19cbafd8…f1a584c` is **not byte-for-byte identical to** the Windows 2025 original, so never substitute one candidate's test for the other.
- The latest experiment branch contains source-only Douyin extraction work that has not been packaged or executed as either archived EXE.

## Private backup and independent readback

- All three original ZIPs were saved to the user's **private ChatGPT Library**, folder `/YuTang/Windows-147-verified-original`. This is not a GitHub release or a public download.
- The two original provenance JSON manifests are stored there alongside a new `library-readback-verification-20261116.json` manifest.
- Independent Library raw-byte readback **succeeded for all 3/3 ZIPs**. Each full ZIP SHA-256 and size matched the originally downloaded GitHub artifact; both embedded EXE SHA-256 values were independently rechecked from the Library copies. No executable was launched during verification.
- Google Drive upload of the original 125.6 MB ZIP returned HTTP 413 because the current connector has a 100 MiB transfer limit; **no Google Drive backup is claimed**.

## Remaining gates (do not misreport as pass)

- A legitimately available controllable browser to obtain real target Douyin video `7445301722639060233`, audio, comments and official AI summary is still unavailable. All remain **UNVERIFIED/BLOCKED**.
- Certificates, authenticode signing, update-channel trust configuration, signed new SHA-256, fresh dual-OS EXE acceptance, real update/rollback network testing and release have **not** been completed by this archival work.
- No change to `main` (verified `4745ed23cbb748cb4b070ed70390703d1261aea0` at review), no Actions rerun, merge, rebuild, paid browser agent, credential access or release.

**Next priority:** preserve artifact provenance, then resume only a real missing acceptance gate with a permitted execution environment. Do not repeat successful prior security runs or count source-only tests as EXE tests.

## Exact fifth diagnostic receipt excerpts (read from raw Windows job log)

The following are the actual final gate markers observed in Windows 2025 [Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361), job `132596128747` (2026-11-14 UTC), not extrapolated from a green check:

```text
2026-11-14T21:35:28.1214955Z WINDOWS_PUBLIC_PAGE_GATE_OK {"exeSha256":"3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34","httpStatus":200,"rendered":true,"cleanupPending":true}
2026-11-14T21:35:33.1024447Z WINDOWS_PUBLIC_WEB_CLEANUP_OK {"exeSha256":"3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34","verifiedDesktop":true,"trackedCandidateProcessCount":24,"trackedProcessesRemaining":0,"cdpListenersRemaining":0,"isolatedDirectoriesRemoved":true}
2026-11-14T21:35:33.1028333Z WINDOWS_PUBLIC_WEB_EXE_RECEIPT {"status":"PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY","exeSha256":"3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34","exeBytes":125446071,"sourceCandidate":"9cc16d7e64d59dc141e9c6687b8dd461934fcc35","documentHttpStatus":200,"renderedPage":true,"rendererSandboxVerified":true,"networkServiceAppContainer":true,"networkServiceLowIntegrity":true,"cdpLoopbackOnly":true,"noResidualCandidateProcesses":true,"trackedEdgeProcessCount":10,"accountUsed":false,"modelKeyUsed":false,"videoPlaybackClaimed":false,"personalComputerAcceptance":false,"releaseAuthorized":false}
```

Raw Windows job log also reported 68 passing negative-path unit tests with 0 failures. Those unit tests are separate from the real EXE gate; this receipt **explicitly** sets `videoPlaybackClaimed=false`, `personalComputerAcceptance=false` and `releaseAuthorized=false`.
