# YuTang Windows no-sign preflight: unactivated LF-checkout re-test template

This is **not** an active GitHub Actions workflow.
- Prior user authorization covered one run on each standard Windows runner. Run 43604551515 has completed and FAILED on both platforms (Windows 2025 Job 132476268748; Windows 2022 Job 132476269096).
- Root-cause assessment: old Git checkout lacked .gitattributes and both jobs stopped at SIGNER_SCRIPT_SHA256_MISMATCH. Audited LF source SHA equals harness pin, while calculated CRLF source SHA does not. Real Windows raw script SHA was not logged; CRLF remains the leading hypothesis until re-tested.
- Corrected code commit: 27da129f96a2e7a343933147096cab947b0f2293 adds .gitattributes LF rules, a targeted test and incident evidence. Signer logic and EXE are unchanged.
- Proposed new run branch (NOT CREATED): experiment/windows-147-nosign-eol-retest-20261114, seeded at the corrected code commit.
- Proposed active workflow file (NOT ADDED): .github/workflows/windows-147-nosign-eol-retest.yml.
- Inert workflow template: docs/templates/windows-147-nosign-preflight.eol-retest.inert.yml.

The retry template pins checkout SHA and push.before SHA to the corrected code commit. It checks Windows Sign-YuTangCandidate.ps1 is precisely SHA-256 2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1 before downloading the original Artifact. It prints the observed SHA for diagnostics. Then it checks original unsigned EXE SHA-256 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34 and size 125446071, without launching or signing the EXE, and performs the no-sign PowerShell rejection tests on Windows 2022 and 2025.

Manual activation constitutes a second GitHub Actions run and **requires separate authorization**. Do not add this workflow to .github/workflows or create/advance its run branch before that approval. Run 43604551515 remains FAILED even after repairs. Skipped jobs are NOT PASS. No Certum certificate or ID submission, no signed EXE, no signed EXE dual-platform acceptance, no auto-update enablement, no main modification, and no release.
