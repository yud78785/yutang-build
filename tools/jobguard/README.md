# YuTang Windows Job Object guard

This helper is built only for Windows x64 and is packaged beside the isolated API runtime.

- Browser-host mode: accepts exactly --owner-pid <pid>, verifies that PID is its immediate parent, creates a Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, assigns the browser-host process to it, prints READY <pid>, then waits for the browser-host to exit. If the host or helper is forcibly terminated, closing the job handle terminates the host and its Edge descendants.
- Desktop mode: accepts --owner-pid <desktop-pid> --target-pid <api-worker-pid>. It verifies that the desktop is the helper's immediate parent and that the API worker is the desktop's direct child, pins the worker process handle, assigns only the worker to the Job Object, prints READY <desktop-pid> <api-worker-pid>, then waits for either the desktop process or API worker to exit. If the worker crashes first, the helper closes the job and kills any surviving children; if the desktop exits first, it kills the worker tree. This avoids putting Electron's updater into the job.
- The helper itself is never assigned to the job. It owns the only job handle and closes it on normal exit, forced termination or crash.

The application must fail closed if the helper is missing, the PID ancestry is wrong, the Job Object cannot be created/assigned, or the readiness handshake does not arrive. This is process-lifecycle containment, not a substitute for Edge's renderer/network sandbox.
