# Phase 1C-2C implementation plan

Scope: the user's native ownership/stdio milestone; no inference enablement.
Keep SessionHost, SQLite v2, diagnostic ConPTY and A+C UI intact.

1. Add a separate Node-API stdio owner: unnamed kill-on-close job,
   creation-time JOB_LIST, CREATE_SUSPENDED, explicit stdio HANDLE_LIST,
   membership check before resume. No shell, PATH, or renderer executable input.
   Pin the Codex SHA-256 in native code; lock the image and its canonical path
   components against replacement while launching. Fail closed on any failure.
2. Test with a compiled harmless tree fixture and separate test-only addon:
   lifecycle, owner death at launch checkpoints, inherited handles, identity,
   pipes, rapid restart, limits and handle counts. Test code never ships in dist.
3. Put blocking native operations in a dedicated worker thread. Bounded reads,
   timed overlapped writes, acknowledgements and one in-flight batch bound memory.
   Keep a hard deadline and require zero job membership before reporting cleanup.
4. Add a separate initialize/initialized-only protocol driver and opt-in CLI probe.
   Do not connect the inference-capable fixture driver to production IPC.
   Prepare fresh profile/environment, review upstream config/auth behavior first;
   if isolation cannot be established, document blocker and do not run Codex.
5. Run real Windows tests, pnpm verify, desktop smoke and production audit.
   Measure idle worker RAM/CPU; report scope and limitations. Commit only intended
   files, push this feature branch, open PR, do not merge.

Alternatives: post-spawn assignment has an unowned interval; suspended creation
without JOB_LIST can orphan a suspended process on owner death. Both rejected.
Extending diagnostic ConPTY would enlarge its existing trust boundary; a separate
stdio addon keeps that verified path unchanged. Job Object is not a sandbox.

Review focus: launch failures before a returned process handle, path replacement,
owner death with active I/O, unread/full pipes, stale callbacks and cleanup failure.
Windows API contract and observed tests are separate evidence; tests cannot
exhaustively interrupt every instruction within the kernel's CreateProcess call.
