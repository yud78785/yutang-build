# YuTang 1.4.7 Windows: offline, read-only prerequisites (NOT RELEASE)

Scope: standalone PowerShell 5.1 inspection tool; does not modify the accepted EXE or the production launcher.

Sources: the same unsigned Windows 2025 EXE from Run 43541915930, Artifact 14092434238; Windows 2022 cross-tested the SAME binary.
Accepted EXE SHA-256: 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34. Size 125446071 bytes.
Source/runner commit: 9cc16d7e64d59dc141e9c6687b8dd461934fcc35.

Tool: tools/Check-YuTangWindowsReadiness.ps1.
Checks only whether the system is Windows, Microsoft Edge is installed, CDP TCP port 9227 is free, and (if an EXE is provided) its filename, size and SHA-256 match the accepted unsigned candidate.
Does not start the program or browser; does not access network, registry, credentials, user browser profiles, firewall settings or existing running processes beyond reading the local TCP listener list; does not create files or use signing tools.
No user has been asked to run this tool; it is provided for a future voluntary preflight only. It is not proof of user-machine safety.

Optional future usage on Windows PowerShell 5.1:
  powershell.exe -NoProfile -NonInteractive -File .\tools\Check-YuTangWindowsReadiness.ps1
  powershell.exe -NoProfile -NonInteractive -File .\tools\Check-YuTangWindowsReadiness.ps1 -CandidateExe 'D:\Existing\Dafeiyu-Douyin-API-1.4.7-win-x64.exe'

Output: compact JSON without user paths or secrets. BLOCKED exits 2; environment-only check reports ENVIRONMENT_ONLY_NOT_EXE_ACCEPTANCE; exact candidate match reports PASS_STATIC_PREREQUISITES_ONLY. Neither is an actual EXE launch or safety acceptance.

REAL REMAINING GAP:
Windows 2025 original Artifact includes windows-edge-lifecycle-normal.json with externalEdgeNetworkBlocked:true and videoPlaybackTested:false. The runner tests Edge sandbox, CDP loopback, restarts and forced-exit cleanup, but real online navigation and normal user desktop safety were not demonstrated. The packaged smoke receipt also reports startup.visible:false, so it cannot prove an interactive visible window on a personal Windows desktop.
The next true functional gate should test EXACT original unsigned EXE SHA on a disposable Windows host with normal browser networking to an approved public no-login URL, check rendered page, process isolation and cleanup. It must NOT use real accounts, credentials, videos or remote desktop controls. A new CI Actions run requires separate approval. Do not re-run the already accepted sandbox/Job Object tests just to repeat them.

No certificate purchase, signing, paid tier, main merge, active Actions workflow, Release or personal PC action was made in this branch.
