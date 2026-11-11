# YuTang Windows candidate — evidence-first safety gates

**Status: CANDIDATE / NOT RELEASE.** This repository contains build controls, not a finished integration with the current ChatGPT conversation. No claim is made that the EXE is safe for ordinary Windows computers.

## Candidate identities and evidence (2026-11-11 UTC)

- Repository: https://github.com/yud78785/yutang-build
- New candidate build: https://github.com/yud78785/yutang-build/actions/runs/42942891622
- New candidate build commit: `74fae764b9c510f745b4a9f45fad88b662bd00d3`
- Historical old candidate build: https://github.com/yud78785/yutang-build/actions/runs/42815316953
- Pinned upstream source: `LockyBee/dsh-douyin-agent@912873e2556d16a088d81dcbc6f7c0060614dd58`
- New candidate ZIP: 124,753,189 bytes, SHA-256 `b5febe43b2e947a86feda01484fbbc475776649ed7687d8d984f5992af6370e9`
- New candidate EXE: `Dafeiyu-Douyin-API-1.4.6-win-x64.exe`, 124,737,042 bytes, SHA-256 `e9f07dbed400bd77a8ab6350ea3a54d338d02d7a8f0c04d87cc621e148160290`
- GitHub artifact ID: `13822230296`, expires at `2026-11-18T02:05:10Z`; the candidate is unsigned and not released.
- Old candidate EXE (historical only): SHA-256 `84321ec6c827de90e95d0d03b76a693444f8ea8c22c9c71c709e2e496bde753a`.

## How to independently check the candidate without executing it

Requires only Python 3.10+ and the **original, unmodified ZIP** (not an extracted or repacked copy):

```sh
python3 tools/verify_candidate.py path/to/YuTang-Windows-CANDIDATE-NOT-RELEASE.zip
python3 -m unittest discover -s tests -v
```

The verifier is **read-only**: no extraction, network, subprocess, shell, PowerShell, account access, or execution of EXE. It verifies exact ZIP/EXE SHA-256 and sizes, rejects unexpected/duplicate entries and paths, decompresses for CRC, inspects the outer Windows PE/NSIS header, reads only the small fixed build report, and flags whether the outer EXE carries a PE certificate table. It does **not** validate an Authenticode signature, inspect inner Electron binaries, or analyze malware behavior. A PASS proves **file identity only**.

`artifact-verification.json` is the recorded result of running this tool against the fetched real Actions artifact. Unit tests include forged archives, CRC corruption, missing build disclaimer, duplicate filenames, malformed PE header, unexpected extra entries, bad hashes, and symlink rejection. The tests use synthetic binaries and cannot validate program runtime.

## Findings and strict release gates

| Gate | Current finding | Required to graduate from candidate |
|---|---|---|
| CI reproducibility | Workflow completed, exact Git commit and ZIP/EXE hashes established | Keep pinned source, audited dependencies, recorded provenance |
| EXE signing | **Outer NSIS launcher certificate table = 0 bytes (unsigned)** | Authenticode-sign from a verified publisher and validate the actual signature, or treat as untrusted and keep test-only |
| GitHub Actions dependencies | Workflow calls checkout/setup-node/upload-artifact by mutable `@v4` tags, not immutable action commit hashes | Pin action dependencies or adopt approved workflow dependency lockfile before future builds |
| Sandbox test | The original EXE proved RendererAppContainer, Lockdown, Untrusted integrity and Lowbox/AppContainer SID. The rebuilt EXE uses `--enable-features=NetworkServiceSandbox`; Edge internal diagnostics report sandbox type `Network` in the isolated A/B experiment. **The Network Service AppContainer SID was NOT observed, and Windows token restrictions have not been independently checked.** The new EXE's first cold start and dedicated browser both reached ready, but the earlier test incorrectly required a Network Service AppContainer SID and therefore failed. | Retest the new packaged EXE requiring the renderer token evidence and Edge's `Network` sandbox type; keep OS-level Network Service token inspection as an explicit unproven item. |
| Credentials / persistent state | Upstream supports existing `~/.dsh` browser profile and remembered settings; media key `.env` is plaintext | Use fresh disposable VM and throwaway profile, never personal accounts or keys for initial tests |
| Remote debugging | Upstream uses loopback CDP and a fixed dedicated Edge debugging port (9227) | Document local attack surface and validate ownership, binding and collision behavior; do not expose to LAN |
| Behavioral automation | CI smoke tests intentionally prohibit live Douyin, model requests and external messages | Separately prove one public video observation, one reasoned vision-model response, bounded idle/stop/resume, and evidence-backed memory behavior before any automation |
| Current ChatGPT integration | Independent Douyin application uses its own model/API key; a separate V3 PING relay exists | Need an explicit least-privilege authenticated command/result bridge; a Windows app alone does not make this conversation autonomous |
| Trust on user's Windows | **Not tested**; user explicitly forbids changing system security settings or executing unverified program | Do not request install, SmartScreen bypass, PowerShell policy changes, new user accounts or disabling protections |

### Security sources

- Electron official security guidance: https://www.electronjs.org/docs/latest/tutorial/security
- Microsoft SmartScreen reputation and unsigned apps: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- GitHub official secure-use reference for pinning actions: https://docs.github.com/en/actions/reference/security/secure-use
- Microsoft sandbox testing tools: https://github.com/microsoft/SandboxSecurityTools
- Pinned upstream desktop implementation: https://github.com/LockyBee/dsh-douyin-agent/tree/912873e2556d16a088d81dcbc6f7c0060614dd58/desktop

## Next meaningful work, ordered by value

1. Keep old successful CI evidence intact and **do not rerun the existing successful build**.
2. Run the new packaged EXE in a no-secrets ephemeral Windows runner with a cold Edge start before any unrelated Edge process; require renderer plus Network Service sandbox evidence, three launch/close cycles, unrelated Edge survival and zero residual processes.
3. Prove real public-video playback and visual frame capture without a login or account; distinguish page metadata from actual decoded video frames.
4. Verify model reasoning against known video fixtures, with explicit evidence, uncertainty and failure handling.
5. Prove fail-closed behavior for the authenticated V3 bridge independently, including Drive metadata and concurrency on Windows. Never merge unrelated bridge protocols into this Douyin candidate without an explicit interface contract.
6. Do not call any of this a release until source/dependency trust and live functionality gaps are closed.
