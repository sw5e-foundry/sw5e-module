# Legacy world Item pack preflight

World migration on this line stays at stamp `2.0.0`. Before `pack.migrate()` hydrates a world Item pack, the preflight scans the pack index and reports:

- pack collection
- Items inspected
- documents requiring repair
- document name and id
- legacy type and proposed replacement type
- activity preservation status
- advancement preservation status
- failures
- skipped locked or non-world packs

Repair then writes only eligible documents, re-reads them, and lets the normal pack migration continue. A partial batch does not advance the migration stamp. A later run resumes from the Item types that are still legacy.

The GM settings menu **SW5E Migration Tools** can analyze without writing. Repair and force migration asks for a backup acknowledgement and uses the same `migrateWorld` path as startup.

Live migration testing must use a disposable copied world. Foundry is stopped while the copy is made, the source world stays untouched, the copy has its own world id, and a backup exists before migration runs.
