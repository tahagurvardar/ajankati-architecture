# Managed task preflight implementation plan

Scope: the user's Phase 1C-3A specification. Offline only; no provider launcher,
credential access, runtime changes, or edits to R1–R4 evidence.

Architecture: strict Zod contracts, canonical SHA-256 plans, worker-owned offline
identity inspection, and a ledger on the existing Store SQLite connection.
Human decisions record consent to an exact plan; they cannot establish missing
sandbox/tool-gate evidence. Execution remains unconditionally disabled.

- [x] Write failing contract, identity, approval replay/expiry, ownership,
  transaction rollback and restart tests in tests/managed-preflight.test.ts.
- [x] Add packages/contracts/src/managed-task.ts; reject unknown fields, unsafe
  Windows path spellings, unbounded validity and operations beyond read-file.
- [x] Add packages/storage/src/managed-task.ts on Store's connection, migration
  v3 with backup, immutable inserts, single-use offline review reservation and
  fail-closed recovery. Prove only SQLite transaction atomicity, not filesystem
  inspection or external delivery atomicity.
- [x] Add apps/worker/src/managed-preflight.ts for snapshot inspection and status;
  expose static runtime blockers through SessionHost without enabling commands.
- [x] Run focused tests then all four requested validation commands; document
  failures, exact counts, trust boundaries and future launch gates in Turkish.
- [ ] Review focused diff, commit, push current branch and open PR against main.
  Do not merge or execute a live task.

Review focus: stale task revision/title, workspace replacement and junctions,
untrusted evidence assertions, parent/child workspace conflicts, clock rollback,
crash after consumption. Existing mock workflow remains unchanged.
