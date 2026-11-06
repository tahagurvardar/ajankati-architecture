# Native Windows path boundary implementation plan

Goal: offline handle-based inspection for Phase 1C-3B, no provider execution.
Architecture: a separate N-API addon retains root-to-leaf handles, rejects every
reparse tag and noncanonical path, records final path and volume/128-bit file ID.
Worker obtains evidence itself and includes it in the existing strict plan digest.
Existing lstat, realpath, exact executable hash and SQLite invariants remain.

- [x] Add real Windows regression tests; observe missing boundary failure.
- [x] Implement native acquire/snapshot/close with non-inheritable handles and
  deterministic cleanup, plus build packaging and a worker-only wrapper.
- [x] Hold handles throughout existing identity/hash inspection; bind native
  metadata to strict identity objects. No renderer evidence API.
- [x] Test aliases, traversal, links, wrong types, sharing conflicts, replacement
  before/after acquisition, closed/forged owners and canonical TEMP fixtures.
- [x] Run frozen install, verify, desktop smoke with CLI probes disabled, audit.
- [ ] Write Turkish evidence and remaining risks; commit, push, open PR; no merge.

Constraints: R1–R4 unchanged; no secrets/config reads; no live tasks. Sandbox,
network, tools, human channel remain unknown. Native gate also remains unknown:
inspection leases are released before a future launcher/use, and writable
mapped views/filesystem filter behavior are not proven isolated.

Review focus: ancestor replacement, DOS aliases, unknown tags, cleanup on error,
old persisted plans lacking native evidence, SQLite rollback/recovery unchanged.
