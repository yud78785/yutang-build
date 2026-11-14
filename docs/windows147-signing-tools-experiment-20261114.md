# YuTang local-only Ed25519 signing core (experimental, NOT RELEASE)

This branch was created from the last accepted unsigned build control commit 9cc16d7e64d59dc141e9c6687b8dd461934fcc35. It does not change the runtime EXE sources, the updater trust constants, GitHub Releases, or Windows Actions.

- Accepted unsigned Windows 2025 EXE SHA-256: 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34.
- Acceptance run: 43541915930. The exact Windows 2025 EXE passed a Windows 2022 cross-test.
- This key-generation and manifest-signature code is independent of the Certum/SimplySign Authenticode key.
- Code uses Ed25519 for signing exact JSON bytes, scrypt + AES-256-GCM for an optional encrypted local key envelope.
- Run only mock-only offline core tests with: node --test tests/windows147-signing.test.mjs.
- No real signing keys, private-key envelopes, passwords, TOTP codes, ID documents or cloud tokens belong in this repository.
- All signing of real EXEs must happen on a controlled Windows signing workstation, using a manual SimplySign authorization and SignTool. Sign a new copy, never modify the accepted unsigned source file.
- Signing changes the EXE SHA-256. The signed EXE must receive new Windows 2022/2025 acceptance for the exact post-signature SHA.
- Auto-update stays fail-closed and no Release is authorized.
- Windows SignTool CLI and additional CLI safety tests were exercised separately in a local 9-test toolkit and are not yet repository-integrated in this branch.
- Reseller Serbia eligibility, final individual VAT, renewal/reissue and identity requirements remain pending formal reseller confirmation.
