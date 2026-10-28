# Phase 1C-2A implementation plan

Specification: the milestone request; existing architecture/security documents remain constraints.

1. Inspect node-pty 1.1.0 and available Windows tools. Reject post-launch PID attachment of a general executable.
2. Add a narrow Node-API Job Object owner and a fixed native diagnostic bootstrap. The worker holds a non-inheritable job handle with KILL_ON_JOB_CLOSE. The trusted bootstrap joins before creating any descendants; the fixed Node diagnostic is created suspended with JOB_LIST, checked, then resumed. No renderer paths or arguments; no shell.
3. Keep node-pty and its bundled ConPTY transport. Gate terminal readiness on native containment, retain the job until all processes exit, and poison the host after uncertain cleanup. Add a worker-owned deadline. No provider enablement or DB changes.
4. First add failing real nested-child tests; implement, then add startup/crash, failure injection, deadline and restart coverage. Test hooks must not appear in renderer IPC and native failure hooks must be compiled only in a separate test binary.
5. Run verify, desktop smoke, production audit, review the diff, record actual Windows evidence and limitations. Commit/push this branch and create a PR if checks pass; do not merge.

Alternatives: replacing all ConPTY I/O adds substantial threading/pipe code; patching node-pty adds a vendor fork. A trusted fixed bootstrap retains the tested transport. Its own startup precedes job association, but it accepts only a job name and cannot spawn anything before successful association. This is a lifecycle boundary, not a sandbox or a guarantee against malicious same-user code.

Review focus: worker death during bootstrap; job handle leakage into descendants; zero active processes before restart; native launch/association failures; no PID-based termination; unchanged provider approval and SQLite behavior.
