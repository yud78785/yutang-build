# YuTang 1.4.7 Windows no-sign preflight — INERT workflow template

Status: NOT RELEASE; NOT REGISTERED as an active GitHub Actions workflow.
Date: 2026-11-14.

This document and `docs/templates/windows-147-nosign-preflight.manual-only.yml` prepare a future explicitly authorized Windows 2022 / Windows 2025 PowerShell preflight, with **no automatic triggering and no new Windows Actions run**.

## Why the template is inert

It is stored under `docs/templates/`, not `.github/workflows/`.
It has only `workflow_dispatch`, not push, pull_request, schedule or workflow_run. GitHub's official documentation states that a manually dispatchable workflow must first exist on the default branch. **Do not mistake a template on an experimental branch for a runnable Actions button.** Promoting this template into an active workflow or dispatching it requires separate explicit authorization and may incur GitHub Actions billing.

## Candidate and code pins

- Code checkout commit: `c8cf9be7c175d00774e7e5cc5a763d587b77ec6e`.
- Original unsigned acceptance run: `43541915930`, Artifact ID `14092434238`.
- Exact Artifact name: `YuTang-OpenRouter-Desktop-1.4.7-SecurityHardening-windows-2025-CANDIDATE-NOT-RELEASE`.
- Inside the Artifact: `desktop/release-api/Dafeiyu-Douyin-API-1.4.7-win-x64.exe`.
- EXE size: `125446071`; EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Artifact archive digest: `sha256:718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`. This hashes the **ZIP**, not the inner EXE.
- Download needs only ephemeral GitHub token with `actions:read`; no PFX, signing key, SimplySign code, personal document or token is stored in the repo.

## Planned Windows check only, not performed

Each Windows runner would download the pinned unsigned candidate, verify its hash and size, execute the existing PowerShell harness without any `-Sign` switch, assert the JSON receipt says `PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY`, recheck the source hash and emit a read-only log. No signing, EXE launch, updater activation, installation, upload artifact or publication is requested.

## Offline checks completed for the inert template

- `yaml.BaseLoader` parse and structural assertions: pass.
- `tests/windows147-nosign-workflow-template.test.mjs`: **4/4 passed** on Node.js 22.16.0 Linux isolated environment.
- Template Git blob SHA: `b20dbecbc004d33b6925c3bc18d3dd4f04fb0df4`.
- Test Git blob SHA: `056a8b7fde5a747fc9db7edb49b8ba56ca6b221b`.
- Prior 40/40 offline checks belong to parent code commit `c8cf9be7`; they are not new Windows tests.

## Blockers and release guardrails

1. Real Windows PowerShell 5.1 runtime execution is still pending.
2. No Certum/SimplySign real certificate has been purchased or used. SSLmentor Serbia individual eligibility, VAT-inclusive quote and reissue terms still need written confirmation.
3. Signed EXE creation, new signed SHA, Authenticode chain/timestamp inspection and the exact signed-EXE Windows 2022/2025 security acceptance remain pending.
4. Real update download, bad-signature rejection, upgrades, user-data preservation and crash rollback remain pending.
5. Automatic update trust key and publisher thumbprint remain unconfigured; `main`, old EXE, formal releases and all sensitive credentials remain untouched.

Do not promote or run this template without explicit permission.

## One-shot branch-only alternative (preferred without touching main)

The additional inert template `docs/templates/windows-147-nosign-preflight.branch-one-shot.yml` is designed to be promoted ONLY after a separate, explicit authorization to spend Windows Actions quota. It has an exact `push` branch+path filter for `experiment/windows-147-nosign-run-20261114` and `.github/workflows/windows-147-nosign-one-shot.yml`. Unlike `workflow_dispatch`, the restricted `push` trigger can operate solely on its feature branch and does not require putting the workflow on `main`.

**Not activated:** no such runnable workflow is being installed under `.github/workflows`, and the one-shot run branch is not created or pushed by this change. Do not start the Windows jobs until authorized. The planned jobs only download the accepted unsigned artifact and execute no-sign PowerShell checks; real signing and signed-EXE validation remain separate.

Offline YAML parse/structure checks and `tests/windows147-nosign-one-shot-template.test.mjs` passed **3/3** on Linux Node.js 22.16.0; this is NOT Windows runtime evidence. Tested one-shot template blob: `e007340ecfb17caa7c5afce1abc2e8c6ff395b74`; test blob: `6c528ffb9d2d9969616db097b4456ff28655bd2a`.
