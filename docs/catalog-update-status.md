# Catalog update implementation status

Implemented for 2.13.0 against baseline a36b8579ca55a93b11f8de3cfbda547eb1fd8d6d.

| Plan area | Delivered | Remaining boundary |
| --- | --- | --- |
| Baseline/replay | Versioned and hashed replay reports, customer/synthetic cohorts, negative fixtures, full ID and first-selection comparison in CI | Production exports remain private; a resolved string is not an image-quality judgment |
| Identity schema | Versioned graph, first-class generations, derivatives/specifications, appearance identities, aliases, homologation and scoped compatibility types, reference/scope validation | Sparse enrichment: 20 identities and 33 catalog links, not a complete global hierarchy |
| Resolver | Optional exact/scoped resolver, explicit ambiguity and missing evidence, preserved search API | No general suffix stripping or automatic render fallback |
| GCC | Manufacturer-backed Saudi Pegas MY2025 record with per-row attribution | SASO endpoint access timed out; GSO bulk reuse requires permission; broader Saudi coverage remains external work |
| EEA/RDW | Opt-in enriched aggregation, schema-aware EEA columns, evidence sidecars, threshold-preservation tests; RDW live query verified | Full historical enriched refresh is a separate operational run; the EEA combined-table sample returned no rows, so it does not establish populated-year coverage |
| EPA | Repeatable 2022–2027 bulk importer, raw evidence/hash, 5,601 distinct source records, source-only identity review queue, stable legacy IDs | Evidence does not automatically map configurations to marketed derivatives or approve image sharing |
| Release/downstream | Additive package exports, backward-compatible selection type alias, documentation, deterministic generation, compatibility and replay CI gates | Downstream asset bindings require review; broad strict rendering must remain in shadow until assets and identity scopes are established |

The new snapshot has 1,607 makes, 38,831 model names, and 215,446 model/year/type records from 11 sources: 4,787 additions and 822 provenance changes, with no removed rows, changed existing IDs, or changed first selections.

Validation includes unit tests, type checking, deterministic offline regeneration, package build, replay assertions, and a private replay through the downstream application's actual resolver. An EPA spelling collision discovered by that replay was fixed with a reviewed separator-only mapping for AMG G63 → AMG G 63; no body or performance terms were dropped.

Local package measurement: approximately 2.27 MB compressed versus 2.16 MB for 2.12.0 (about 5% growth). A first strict resolution took about 120 ms and a repeated scoped lookup about 0.14 ms on the development machine. Search cold-load heap measured about 150 MB versus 134 MB; these are single-process observations, not portable service-level guarantees. Raw source evidence is excluded from the npm package.

No production database rows, asset bindings, or sharing approvals are changed by this catalog release. The absence of an approval remains unknown. The two current application concerns are separate: catalog dependency adoption can deliver new names immediately; broad generation-aware cache sharing needs reviewed assets and a staged policy rollout.
