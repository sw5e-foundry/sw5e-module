# Legacy world migration: coordinator audit

The 1.4.2 coordinator isolates errors thrown while transforming or writing an
individual document. It intentionally blocks version advancement when pack
enumeration, Foundry's pack migration, or lock restoration fails. This audit
follows the path before and around that per-document boundary.

| Stage | Earlier behavior | Current behavior |
| --- | --- | --- |
| Migration data acquisition | Ran after the active run was set but before its cleanup guard | Runs inside the guarded migration body |
| World document source reads | Some `toObject()` and invalid-document reads ran before `tryBuildCandidate` | Reads for Actors, Items, Macros, RollTables, Scenes, and token ActorDeltas are caught and recorded per document |
| Pack-only world detection | An empty Actor/Item/Scene world skipped migration even with world packs | Migratable world packs count toward eligibility |
| Legacy Item pack hydration | `pack.migrate()` encountered unregistered Item types before SW5E normalization | The world Item pack index is scanned before hydration; known historical types are changed in bounded, verified batches |
| Pack write phase | Called `pack.migrate()` again after successful collection | Writes the already collected candidates without a second pack migration |
| Explicit single-pack migration | Called `pack.migrate()` again after candidate collection | Uses the successful first pack migration |
| Pack unlock/restore | Unlock could fail outside the restoration guard | Restore is attempted if an unlock changed the lock state |

The preflight resolves target types through the same legacy mapping used by
`normalizeLegacyMasterItemSource`. It supplies the complete indexed `system`
object with the type change, uses `recursive: false`, checks the returned IDs,
and verifies that each repaired Item can be loaded. An incomplete batch blocks
the run and leaves the migration version unchanged. The logged error names the
pack and IDs. A later run can resume from the remaining legacy types.

Other pack infrastructure failures remain blocking. These include index
enumeration, an unrecognized invalid document type, `pack.migrate()` for
another reason, `getDocuments()`, and lock restoration. Treating these as
successful document skips could advance the version with a partially migrated
pack. The settings menu provides **Analyze World** and **Repair and Force
Migration** for a GM, with a backup acknowledgement before the latter.

Test with a disposable copy of a world containing legacy modification Items.
After a backup, open the world as GM, inspect the Migration Tools report, run
the repair migration, and compare the original Item data with the resulting
`loot` Items. The Node harness covers batch return validation and ordering;
it does not replace a Foundry runtime test with a real LevelDB world pack.
