# YuTang Windows 1.4.7 — inactive public-web one-shot Actions template

**NOT AN ACTIVE WORKFLOW. NO WINDOWS JOB HAS BEEN STARTED.**

Source test commit: `de28dd978f6ded50753e3dd720a434a0d76918fb` on `experiment/windows-147-public-web-proof-20261114`.

The template `docs/templates/windows-147-public-web-one-shot.inert.yml` is intentionally stored **outside** `.github/workflows` and is never triggered by edits to this document. It is derived from the same explicit one-shot branch-push design previously tested for the no-sign PowerShell check.

## Future activation — needs separate authorization

Only after a separately granted, scoped GitHub Actions approval:
1. Review that the repository is still public and the standard `windows-2022` and `windows-2025` runners apply.
2. Create an isolated run branch named `experiment/windows-147-public-web-run-20261114` at **exact commit `de28dd978f6ded50753e3dd720a434a0d76918fb`**.
3. On that existing branch, add **only** the reviewed template as `.github/workflows/windows-147-public-web-one-shot.yml` in a separate, non-force push; only one transition from the pinned `github.event.before` SHA is eligible.
4. The workflow itself checks out the immutable source commit (not an unreviewed branch tip), downloads original unsigned Artifact from Run `43541915930`, verifies exact EXE name, length `125446071` and SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
5. On each runner, run the negative unit cases, then perform the single real public-homepage navigation probe using the **unmodified EXE**. Never reuse an earlier offline/sandbox green status as internet acceptance.
6. Collect and read both raw job logs. Only two completed successful jobs and two exact `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY` receipts count. Queued, skipped and failed jobs **do not pass**.

Security limits: checkout and artifact download actions are pinned by SHA; permissions `contents:read` and `actions:read` only; no signing, credential injection into EXE, publishing, artifact upload, main merge, real account, user PC control or browser extension. The probe only explicitly navigates to the software's built-in public Douyin homepage; as with any browser, that page may load subordinate network resources and is not a strict egress whitelist.

The previous Run `43541915930` already passed the old sandbox/Job Object/forced exit acceptance; repeating all those suites is unnecessary. This new run is solely a **different network condition** and only for the **same SHA** EXE.

Known caveats: A CI-hosted IP can be blocked or presented with CAPTCHA by the site, which makes this a BLOCKED/FAILED functional test. Neither this workflow nor a successful browser render establishes user-PC safety, a signed public release, autonomous AI abilities, or video understanding. No workaround for login/captcha is authorized.

The one-shot condition guards against ordinary repeat pushes, but is **not** a cryptographic exactly-once guarantee under branch history rewriting; the active workflow must not be created without separate approval.

## Pre-activation correction

The immutable probe source was revised at `de28dd978f6ded50753e3dd720a434a0d76918fb` to (1) treat null PowerShell TCP listener output as no listeners; (2) accept only a successful HTTP response from the **top-level CDP frame** rather than an iframe; (3) require `document.readyState === 'complete'`, in addition to the rendered DOM and in-memory screenshot checks. After these changes, Node 22 local test-only-stub results were **20/20 passed**, and the exact source/test Git blobs matched the locally tested bytes. These are **offline unit results**, not Windows browser results. No Actions workflow has been activated.


## Final fail-closed readiness correction

Reviewed test source commit `de28dd978f6ded50753e3dd720a434a0d76918fb`: this correction requires the main-frame response to be exactly HTTP 200 (not a generic 2xx), verifies browser/EXE/worker cleanup and deletion of isolated temporary state *before* emitting a PASS receipt, and fails if process or directory cleanup cannot be confirmed. Node v22.16.0 locally executed 23/23 negative and contract cases using a test-only stub for the previously accepted lifecycle module (offline, **not** Windows execution). Exact local-tested Git blob SHA-1: source `a7ff7b379698f8a64ba72d497dd3ef7bff03fb55`, negative tests `132c77c2eadd10b9c6292ad138dfe0be84654ff1`; local TAP SHA-256 `a3dfe4b495ef005586b6f21d907bdf24d35274ff0e2f7c0d5e36375d89ac2ec6`. No actual public-web test has been run.


## 2026-11-14 descendant-PID cleanup protection

Final audited test source commit: `de28dd978f6ded50753e3dd720a434a0d76918fb`. Prior test checks could miss orphaned Renderer subprocesses that no longer display the candidate profile path in their Windows command line. The updated probe records every Edge descendant PID using the **original accepted** `hasHostAncestor` lineage check before and after homepage rendering, then requires all recorded Edge subprocess PIDs to be absent after shutdown, in addition to existing isolated-profile, API worker, Job Guard and CDP listener checks. It does NOT kill unrelated Edge processes.

The new pure/static Node 22 local tests explicitly verify a renderer with no profile flag is captured by lineage and that an orphaned renderer remains a release-blocking survivor. **25/25 offline tests passed, 0 skipped**. Local TAP SHA-256: `b676b4b2f7f0a0eb5613deede85fd7cb02a052dfc40558cfe078683a30398bb4`. Git blob SHA-1: audited probe `eba73997c8c01042bf2e287561a8cf1e28056ec6`, tests `96d8e10579dc25afc7f46b30f253f88926d0ab76`. Offline results do not constitute Windows EXE online acceptance.

The workflow template remains **inactive**, and now uses `github.event.before` and checkout SHA `de28dd978f6ded50753e3dd720a434a0d76918fb`. No Windows Actions job, real account, EXE release, signing or `main` modification has been triggered by this correction.
