# YuTang Windows Job Object guard

This helper is started by the dedicated browser-host process before Edge is launched.

- It accepts exactly one owner PID and verifies that PID equals its immediate parent process.
- It creates a Windows Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
- It assigns the browser-host process to that job before the host starts Edge.
- It prints `READY <pid>` only after the assignment is verified.
- It then waits for the browser-host process to exit. Closing the helper (including a crash or forced termination) closes the job handle and asks Windows to terminate all processes in the job.
- The helper itself is not assigned to the job, so it can observe the owner exiting and close the job after an ordinary host exit.

The candidate must fail closed if the helper is missing or does not complete its readiness handshake. This is process-lifecycle containment, not a substitute for Edge's renderer/network sandbox.
