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

## 2026-11-14 immutable-action and single-addition hardening

This change is **template only**: neither file is under `.github/workflows`, and no Windows Actions run has been scheduled or triggered.

To avoid changing executable dependencies unexpectedly between preparation and later review, both inert templates now pin the exact public GitHub commit IDs checked through the official repositories' `refs/tags/v4`:

- `actions/checkout@11d5960a326750d5838078e36cf38b85af677262`
- `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093`

Each template also compares `git rev-parse HEAD` against the audited code commit `c8cf9be7c175d00774e7e5cc5a763d587b77ec6e` before downloading the unsigned artifact. **Correction:** the older branch-push template used `github.event.head_commit.added` to detect the first workflow-file addition. GitHub's official Actions documentation explicitly states that `added` / `modified` / `removed` commit fields are not included in the Actions `push` event payload. That original check was unusable and must never be activated.

**Replacement guard:** the branch-push template now pins the approved push `before` SHA, rejects branch creation / deletion / forced pushes, and checks the source branch name at the job-level `if`. This is a controlled single-transition gate, not a global exactly-once guarantee: the branch could be deleted and recreated from the same seed, or an administrator could rewrite history. GitHub may show skipped jobs as `Success`; a skipped job is NEVER a Windows PowerShell PASS or signed-EXE acceptance. Executing and removing any active workflow still requires an independently approved, explicitly bounded Windows Actions action.

Local Node.js 22.16.0 isolated regression: `13/13` template assertions passed (old 7 plus new 6), `0` failures; both YAML documents loaded with PyYAML BaseLoader and had read-only GitHub permission, Windows 2022/2025 matrix and expected steps. Local TAP log SHA-256: `6109d89ab2ca2716aff837307d815e3d5e5c2c39b31069eea79f8209f6c7579e`.

The pinned dependency changes do not alter the already accepted unsigned EXE SHA `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`. PowerShell runtime, real signing and signed EXE acceptance are still **NOT RUN**.

## 2026-11-14 corrective fix: gate on supported push.before instead of unavailable head_commit.added

Verified against official GitHub Docs:
- Actions `push` payload removes commit-level `added`, `modified`, and `removed` attributes.
- `push.before`, `created`, `forced`, and `deleted` are documented webhook fields.
- A job-level `if` is evaluated before `strategy.matrix`, so a rejected event is skipped before Windows runner allocation.
- A skipped job can appear as `Success` in the GitHub UI. Treat it as NOT RUN, not passing.

The revised inert branch-push template now requires:
- Branch `experiment/windows-147-nosign-run-20261114` and event `push`.
- **Before commit exactly** `ee411c1a9c2684d6fdc82cfa8c2542de83fd776f`.
- `created == false`, `forced == false`, `deleted == false`.
- The existing exact workflow path filter `.github/workflows/windows-147-nosign-one-shot.yml`.
- A redundant Windows step checking the same `before` SHA if a Windows job is allowed to start.

**Activation protocol is not executed:** only after express approval for Windows Actions, create the dedicated run branch AT the pinned before-SHA in one operation, then submit a separate, reviewed single commit adding the exact workflow file. Do not create a new branch and add the active workflow simultaneously; that is explicitly rejected. Any changes to code/seed or direct reactivation require a separately reviewed new gate. No active workflow is registered now.

The correction was tested locally with Node.js v22.16.0 and PyYAML BaseLoader:
- Three template suites, **15/15 pass, 0 fail, 0 skipped**; all tests are offline, not Actions runs.
- Local TAP log SHA-256: `9dc4e59ae8a15a55d591b8e67295df8edf777e12cc7d479f083f92c99cdc5916`.
- Exact branch template blob: `29a53a8cd29aea58e0e1301d5519116d04a350d6`.
- Security template tests blob: `7a6ced182f4e0396c840a2496c5b06cfcd977ce9`.
- One-shot tests blob: `467c156a31bcecdd869a2a33c4078e7dde7a7014`.

This changes only an inert workflow template, tests, and documentation. It does not modify the accepted unsigned EXE, build/runtime sources, main, updater trust settings, or release state. Genuine Windows PowerShell preflight is still pending.

## 2026-11-14 verification: public standard Windows runner cost (NO RUN STARTED)

The earlier draft described the proposed Windows Actions check as "paid" or
potentially consuming Windows billed minutes. That is **incorrect for the
currently verified configuration**:

- GitHub repository visibility was checked as **public** for
  `yud78785/yutang-build`.
- The proposed matrix labels `windows-2022` and `windows-2025` are standard
  GitHub-hosted runner types, **not larger paid runners**.
- GitHub's current official billing documentation explicitly says that
  GitHub Actions compute on standard GitHub-hosted runners is free for public
  repositories. The proposed workflow contains no artifact upload.
- Official sources (checked 2026-11-14):
  https://docs.github.com/en/actions/concepts/billing-and-usage
  https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job
- This conclusion depends on the repository remaining public and on using
  only the stated standard runner types. A later move to a private repository
  or larger runners would require a new billing review.

**Cost correction is not permission to execute.** The user's existing rule
to avoid unapproved GitHub Actions runs remains in effect. As of this review,
the branch `experiment/windows-147-nosign-event-before-fix-20261114` still
has **zero new Actions runs**, its workflow exists only as an inert document
template, and no active workflow was added to `.github/workflows`.

The preserved unsigned acceptance evidence remains:
- Source/build SHA: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Run `43541915930` (completed, success); Windows 2025 candidate artifact
  `14092434238`.
- Inner EXE ZIP path:
  `desktop/release-api/Dafeiyu-Douyin-API-1.4.7-win-x64.exe`.
- Inner EXE size: `125446071` bytes.
- Inner EXE SHA-256:
  `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- The SHA was independently recomputed by streaming the artifact ZIP entry
  in this local review. ZIP SHA-256 is not a substitute for inner EXE SHA.

Once separately authorized, the only new acceptance step is one no-sign
PowerShell check on Windows 2022 and 2025 for this exact unsigned EXE. This is
NOT an Electron/Edge re-test, not an Authenticode signature or signed-EXE test,
not an update/rollback test, and not permission to publish or merge.
