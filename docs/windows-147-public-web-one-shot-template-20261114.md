# YuTang Windows 1.4.7 — inactive public-web one-shot Actions template

**NOT AN ACTIVE WORKFLOW. NO WINDOWS JOB HAS BEEN STARTED.**

Source test commit: `ea8d289411f917a785e768982efe865e3063c7ab` on `experiment/windows-147-public-web-proof-20261114`.

The template `docs/templates/windows-147-public-web-one-shot.inert.yml` is intentionally stored **outside** `.github/workflows` and is never triggered by edits to this document. It is derived from the same explicit one-shot branch-push design previously tested for the no-sign PowerShell check.

## Future activation — needs separate authorization

Only after a separately granted, scoped GitHub Actions approval:
1. Review that the repository is still public and the standard `windows-2022` and `windows-2025` runners apply.
2. Create an isolated run branch named `experiment/windows-147-public-web-run-20261114` at **exact commit `ea8d289411f917a785e768982efe865e3063c7ab`**.
3. On that existing branch, add **only** the reviewed template as `.github/workflows/windows-147-public-web-one-shot.yml` in a separate, non-force push; only one transition from the pinned `github.event.before` SHA is eligible.
4. The workflow itself checks out the immutable source commit (not an unreviewed branch tip), downloads original unsigned Artifact from Run `43541915930`, verifies exact EXE name, length `125446071` and SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
5. On each runner, run the negative unit cases, then perform the single real public-homepage navigation probe using the **unmodified EXE**. Never reuse an earlier offline/sandbox green status as internet acceptance.
6. Collect and read both raw job logs. Only two completed successful jobs and two exact `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY` receipts count. Queued, skipped and failed jobs **do not pass**.

Security limits: checkout and artifact download actions are pinned by SHA; permissions `contents:read` and `actions:read` only; no signing, credential injection into EXE, publishing, artifact upload, main merge, real account, user PC control or browser extension. The probe only explicitly navigates to the software's built-in public Douyin homepage; as with any browser, that page may load subordinate network resources and is not a strict egress whitelist.

The previous Run `43541915930` already passed the old sandbox/Job Object/forced exit acceptance; repeating all those suites is unnecessary. This new run is solely a **different network condition** and only for the **same SHA** EXE.

Known caveats: A CI-hosted IP can be blocked or presented with CAPTCHA by the site, which makes this a BLOCKED/FAILED functional test. Neither this workflow nor a successful browser render establishes user-PC safety, a signed public release, autonomous AI abilities, or video understanding. No workaround for login/captcha is authorized.

The one-shot condition guards against ordinary repeat pushes, but is **not** a cryptographic exactly-once guarantee under branch history rewriting; the active workflow must not be created without separate approval.