# Catalog update plan

Planning baseline: `@meterapp/vehicle-db` 2.12.0, commit `a36b8579ca55a93b11f8de3cfbda547eb1fd8d6d`, inspected September 24, 2026. This plan adapts the supplied vehicle catalog and variant strategy to this checkout. External source availability, field names, counts, and redistribution terms remain investigation items; the supplied report's embedded citations are not independently verified here.

## Outcome and scope

Improve coverage of valid customer vehicles, especially Saudi/GCC requests, while preserving distinctions that affect the resulting image. Keep the existing offline make/model/year API and all published selections compatible. Deliver the work as separate, reviewable PRs.

The catalog owns vehicle identities, evidence, aliases, and portable, reviewed visual-compatibility facts. The downstream Car Image API owns assets, the versioned asset-sharing policy, render availability, and the decision to serve an image. Finding a catalog record must not by itself prove that a particular render exists or that its parent's image is safe.

The target hierarchy is `Make → Model line → Generation → Derivative → Specification`. Generation is a first-class entity in the first schema release. Enrichment can remain incomplete, but an unknown generation must stay explicitly unresolved rather than being guessed from the model name or a registration year.

## What is already implemented

- README reports 1990–2027, nine sources, 1,603 makes, 37,048 model names, and 210,659 records. Do not schedule a blanket “add 2027” task.
- `scripts/european-names.ts` already strips `BLUEHDI` during import. This does not establish that free-form customer queries containing it resolve correctly; replay that path separately.
- `scripts/catalog-types.ts` uses five-column source tuples; `scripts/build-db.ts` adds a source mask and merges by year/make/name/type.
- `src/search.ts` implements autocomplete; its `variants` are year-specific selections, not automotive derivatives.
- Published IDs are protected through source retention, legacy make IDs, and `data/model-id-compatibility.json`. New source precedence can still change unpinned selections.
- EEA/RDW importers aggregate remotely and already support raw input/output. Preserve that efficient workflow when adding evidence.
- No replay corpus or replay runner was found in this checkout. Production replay and renderer changes require downstream inputs/work.

## PR 1 — Establish the baseline and compatibility gates

Add `scripts/replay-catalog.ts`, a small sanitized fixture set, and a report format. Record package version, catalog commit, fixture hash, resolver version, source filters, and run date. Run the local search path separately from the actual downstream resolver so importer improvements are not mistaken for production fixes.

Inputs should distinguish real customer requests from synthetic sweeps and include request frequency, requested year/market/type, reviewed expected identity, and evidence where available. Keep private traffic outside the public repository; commit only sanitized regression cases.

Classify results into matched, alias/typo, specification noise, missing year evidence, unsupported market model, unresolved generation, unsupported derivative, ambiguous, and unresolved. Only classify a year combination as invalid when authoritative evidence supports that conclusion; absence from this catalog is insufficient. Render correctness/availability is a separate downstream field. Record resolution depth and asset-policy version, and distinguish exact-asset service, approved asset sharing, denied sharing, and unavailable renders.

Add a full snapshot comparison covering existing make IDs, year/make/model/type selections, and the first selection returned without a type filter. Report additions, removals, ID replacements, and provenance changes.

**Acceptance:** reproducible baseline; customer and synthetic results reported separately; no inferred production improvement without production replay; compatibility check catches changed stored selections. If traffic is unavailable, ship the harness and fixtures and explicitly leave the production baseline pending.

## PR 2 — Add versioned identity and evidence sidecars

Keep existing tuples unchanged. Add schemas and validation in `scripts/identity-types.ts`, with curated files under `data/identity/` and aggregated source evidence under `data/evidence/`. Do not put sidecars in `data/sources/`: the current builder treats every JSON there as a source catalog.

Represent:

| Entity | Minimum information |
| --- | --- |
| Vehicle line | Stable ID, make, marketed family name |
| Generation | Stable ID, line ID, name/codes with source context, market-scoped year/date evidence and year basis |
| Derivative | Stable ID, generation ID, name, body style where known, scoped market/year evidence |
| Catalog link | Existing year/make/model/type selection → deepest established identity; allow multiple candidates or unresolved depth |
| Specification | Derivative link where established, trim/powertrain/engine/drivetrain, original text |
| Alias | Make/type context, target kind and ID, alias kind, applicable years/markets, evidence |
| Visual identity | Stable ID, derivative/specification references, body and appearance revision, scoped year/date/market evidence |
| Visual compatibility | Reviewed allow/deny fact between visual identities, explicit scope, evidence, rationale, review date and revision; absence means unknown |
| Source evidence | Source ID and stable evidence key, raw name/configuration, counts, retrieval date, URL, year and year basis |
| Homologation | Approval/type/variant/version, source/market context, optional reviewed derivative link |

Use separate stable IDs for new entities; never replace existing `modelId`s. Permit sparse enrichment: most existing rows can remain unclassified or linked only to a line. Fully established derivatives belong to a generation; unresolved source observations remain evidence until that relationship is known. A derivative name recurring in successive generations creates distinct derivative identities, with optional family relationships for browsing.

Generation codes are sourced labels, not IDs or universal grouping rules. Some codes distinguish bodies within a generation family; only group them when evidence supports it. Allow generations to overlap in a market/year, since a model year alone may not identify the vehicle. Preserve model year, manufacture date, and first-registration year as different evidence types.

Represent facelifts and appearance revisions through scoped visual identities within a generation; do not invent a new generation for every cosmetic change. Specifications that visibly change the vehicle can require their own visual identity. A model-year boundary must not silently authorize sharing across a generation, facelift, or body change.

Validate references, ID collisions, parent cycles, conflicting scoped aliases, overlapping contradictory mappings, and source attribution. Legitimate overlapping generations are allowed and surfaced as ambiguity. Regulatory codes are evidence, never customer-facing model names by default. No alias or parent edge implicitly establishes visual equivalence.

**Acceptance:** deterministic sidecars, unchanged legacy output, invalid relationships rejected, raw evidence retained without requiring a speculative derivative assignment. Include fixtures for two generations of one model line, a transition-year overlap, and a facelift within one generation. Raw evidence stays out of the npm runtime bundle.

## PR 3 — Introduce conservative identity resolution

Add `resolveVehicle()` through an optional `@meterapp/vehicle-db/resolve` entry point with a discriminated result containing status, candidate/selected catalog identity, line/generation/derivative/specification IDs when known, resolution depth, visual-identity candidates, evidence references, and unresolved tokens. Keep `searchVehicles()` as autocomplete with its existing contract.

Resolution order: lexical normalization → scoped alias/line candidates → jointly constrain generation and derivative using supplied body, year, market, and source evidence → validated specification parsing → final scope checks. Joint constraint solving lets a derivative identify a generation when year alone cannot. A candidate from fuzzy search is not automatically an exact vehicle identity. Unexplained suffixes must remain unresolved rather than being discarded to force a base match.

Use statuses such as `MATCHED`, `UNKNOWN_MAKE`, `UNKNOWN_MODEL`, `UNRESOLVED_TOKENS`, `GENERATION_UNRESOLVED`, `AMBIGUOUS`, `YEAR_UNVERIFIED`, and `KNOWN_DERIVATIVE_UNSUPPORTED`. `MATCHED` requires a unique identity at the requested resolution depth; a line-only result must not masquerade as a generation/derivative match. The renderer requires a uniquely resolved visual identity or returns an unresolved-identity result before asset lookup. It adds `RENDER_UNAVAILABLE` or `NOT_RENDER_EQUIVALENT` from its own asset/policy data. Unsupported market/year conclusions require scoped evidence, not simply an empty filtered result.

Keep the `variants` property and `VehicleSearchVariant` export compatible. If useful, add `VehicleSearchSelection` as a type alias; defer removal or property renaming to a major version.

Seed a small evidence-backed set from actual misses. Candidate cases from the report include Prado, Macan misspellings, Jumper specification strings, Silverado EV, BMW body derivatives, Huracán STO, and CT5-V. Verify exact year, market, and body before adding each mapping; the report's illustrative years are not source evidence. Do not blanket-map Corvette Stingray, SHS-P, or BlueHDi to a shared render.

**Acceptance:** tests prohibit Silverado EV → Silverado 1500, Gran Coupé → Coupé, and STO → generic Huracán; cover ambiguous aliases, unknown suffixes, missing year/market evidence, cross-generation names, and transition-year ambiguity. Positive fixtures match only within verified scope. Existing search behavior and stored IDs remain compatible.

### Visual compatibility and downstream asset policy

Implement the portable compatibility schema in PR 2 and the downstream evaluator in PR 7. Treat asset sharing as a scoped allowlist with three states:

| Effective decision | Asset behavior |
| --- | --- |
| Explicit reviewed allow | Sharing may proceed only if the actual asset and request satisfy the approved scope |
| No applicable decision | Unknown; do not share |
| Explicit deny | Block sharing and retain the reason |

Store downstream approvals with `requestedVisualIdentityId`, `assetVisualIdentityId`, decision, explicit year/date/market scope, evidence references, reviewer, and policy revision. Use directional approvals: approval to use B's asset for A does not imply the reverse or permit a chain through C. Never traverse the family tree or compute transitive equivalence to find a fallback. Missing request context cannot satisfy a restricted approval. Reject contradictory rules during validation and fail closed on any runtime conflict; an applicable deny blocks an allow.

An asset should carry its visual-identity binding and supported scope. Catalog compatibility facts can inform a downstream approval, but cannot independently establish that a particular image depicts the correct body, facelift, or trim. Binding an asset to a broad line must not make it valid for every child. Changes to evidence or asset bindings require reevaluating affected approvals.

The request flow is: resolve a supported identity → select its visual identity → look up an exact scoped asset → otherwise evaluate directly approved alternative assets → serve or return `RENDER_UNAVAILABLE`, with `NOT_RENDER_EQUIVALENT` recorded when an explicit deny applies. A parent asset is eligible only through the same explicit approval as any other asset. Resolution remains `MATCHED` even when the renderer has no usable image.

Downstream tests must cover exact assets, scoped approvals, no rule, explicit denial, conflicting rules, reversed/chained approvals, missing market, generation/facelift boundaries, and matched identities without assets. This makes catalog coverage, visual resolution, and render availability independently measurable.

## PR 4 — Investigate and import GCC coverage

Start the source investigation while the identity work is underway; require the evidence schema before merging enriched data. Investigate both GSO and SASO, choosing the first usable, permitted source based on measured customer coverage rather than assuming a fixed source ten.

For each source, document official access method, authentication, pagination, refresh cadence, field meanings, year semantics, reuse/attribution terms, and a representative sample. Verify the supplied report's claimed configuration fields and latest-year availability. Measure distinct customer identities added, not configuration row count.

Implement the selected importer with cached/resumable retrieval, bounded retries, offline fixture input, stable IDs, preserved raw configuration evidence, source metadata, and `retainPublishedEntries` behavior. Preserve separate body/derivative distinctions and Arabic/English names when supplied; add transliteration aliases only with evidence. Do not deduce production years from registration or approval dates.

Merge a focused snapshot for the highest-frequency verified misses before expanding historical coverage. If redistribution is unresolved, keep the source out of committed/public snapshots and proceed with permitted SASO data or independently sourced manufacturer facts. Discovery and other PRs can continue.

**Acceptance:** access and reuse documented, fixture-based importer tests, no duplicate vehicles from configurations, measured customer coverage gain, stable legacy selections, complete source attribution.

## PR 5 — Preserve EEA/RDW configuration evidence

Extend `scripts/import-eea-co2.ts` and `scripts/import-rdw-nl.ts` after checking actual schemas across their historical datasets. Capture available approval/type/variant/version or execution fields, raw commercial names, source-scoped keys, and evidence counts in aggregate sidecars. Do not ingest vehicle-level identifiers such as plates or VINs.

Preserve existing canonical output initially. Adding configuration fields to grouping splits counts: recombine counts at the current model/country/year grain before applying existing noise thresholds and choosing canonical spellings. Test pagination and null/missing fields, and benchmark increased query volume before full refresh.

**Acceptance:** same canonical catalog from equivalent input evidence; no accidental threshold losses; richer identifiers available for review; raw-to-canonical decisions auditable. Regulatory-code equality alone cannot create visual-equivalence mappings.

## PR 6 — Expand EPA/FuelEconomy systematically

Add `scripts/import-fueleconomy-us.ts` using an officially verified bulk feed/API and documented model-year semantics. Start with recent years represented in customer misses, then backfill supported years once reconciliation is stable.

Import model/configuration evidence and compare against vPIC. Produce a review queue for identities that disagree or introduce meaningful body/performance derivatives. Deduplicate configurations into existing identities only with justified mapping; retain their specification evidence.

Keep the existing `fueleconomy-maserati-us` source ID and published selections. Initially add the general source after existing sources in priority and verify all IDs; migrate legacy provenance only through a separately reviewed compatibility change. Add the refresh command, source attribution, and importer fixtures.

**Acceptance:** repeatable refresh, preserved Maserati IDs/provenance, reviewed disagreements, quantified additional supported model-years, no blanket collapsing of distinct configurations.

## PR 7 — Release and integrate downstream

For every data release run `npm run build:data`, `npm test`, `npm run typecheck`, and `npm run build`; verify regenerated files are committed and rebuilding creates no diff. Run the new full compatibility comparison and replay gates. Measure packed size, cold-load memory, and search/resolution latency against PR 1; agree budgets before enabling additional runtime data.

Update README and CONTRIBUTING to explain derivatives, source year semantics, evidence requirements, and the distinction between catalog presence and render support. CONTRIBUTING currently excludes trims wholesale; replace that with an evidence-based rule for visually meaningful derivatives. Preserve zero runtime dependencies and offline execution.

Use additive minor releases with package and lockfile versions aligned. This repository automatically publishes new versions on main, so release review must happen before merge. In a coordinated downstream PR, bind assets to scoped visual identities and implement the versioned allow/deny evaluator above. Adopt the new resolver and asset policy in shadow mode first, compare decisions against reviewed requests, then enable strict resolution. Keep autocomplete usable for interactive selection. Log catalog/resolver/policy versions and selected asset identity so incorrect sharing can be traced and rolled back.

**Release gates:** zero unreviewed stored-ID changes; all negative identity fixtures pass; each claimed coverage improvement has source evidence; customer-weighted valid resolution improves without new reviewed wrong-identity matches. End-to-end render claims require downstream validation. Roll back downstream adoption by pinning the prior package; correct published data through a new release.

## Sequence and deferred work

Recommended order: PR 1 → PR 2 → PR 3; source discovery can begin immediately. PR 4, PR 5, and PR 6 use PR 2's evidence schema and can ship independently once their own gates pass. Prioritize GCC importer delivery over a complete homologation backfill; EPA work need not wait if GCC access is blocked. PR 7 applies to each incremental release.

First milestone: a reproducible replay, compatibility gates, a generation-aware identity schema, and a small verified set of safe aliases/distinct derivatives spanning generation and facelift boundaries. Include the visual-compatibility contract now, and require the downstream asset-policy integration before claiming safer rendering. Second milestone: measurable GCC coverage. Third milestone: broader EPA coverage and richer European evidence.

Defer a complete global hierarchy, bulk ROVER ingestion, a public breaking rename of `variants`, and commercial-feed integration. Revisit those after measuring remaining customer-weighted gaps. Production replay inputs and downstream renderer access are the main external dependencies; they do not block building the local foundations.

## Implementation record

See [catalog-update-status.md](catalog-update-status.md) for delivered components, validation, and external dependencies. The first implementation combines the compatible repository changes into one additive release; downstream rollout remains separately reviewable. GCC coverage uses the planned manufacturer-backed fallback because GSO permission and SASO endpoint access are unresolved.
