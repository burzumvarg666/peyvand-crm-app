The workspace snapshot is an unfinished recovery prototype. It has not been deployed to production and is not a replacement for a database or Auth backup.

Run `workspace-snapshot.sql` only against a disposable database after applying the migrations.
For the in-memory round-trip test, install `@electric-sql/pglite@0.5.13` locally without changing production dependencies, then run `node tests/workspace-snapshot-roundtrip.mjs`. The test creates synthetic users; it does not test real Supabase Auth, credentials, storage objects, platform configuration, or recovery over existing data. Its privileged restore bypasses triggers and is solely a test fixture, not a production restoration procedure.
