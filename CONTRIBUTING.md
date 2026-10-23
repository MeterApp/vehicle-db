# Contributing to @meterapp/vehicle-db

This catalog powers the [Car Image API](https://carimage.dev?ref=catalog) and any
app that needs an offline make/model/year list. The image API consumes this catalog, but catalog presence, resolved visual identity, and asset availability are separate. A new record never implicitly authorizes a parent image.

## Adding a vehicle that is missing

1. **Check it is really missing.** Search the current snapshot:

   ```bash
   pnpm install --frozen-lockfile --prefer-offline
   node -e "console.log(require('./dist/search.js').searchVehicles('2024 rivian r1s'))"
   ```

   (Run `pnpm run build` first if `dist/` does not exist.) Spelling variants such
   as `f150` / `F-150` are already handled by search; do not add duplicates for
   punctuation or case.

2. **Prefer an official source.** New records must be traceable to a public
   dataset or manufacturer catalog. The bundled sources live in
   `data/sources/*.json` and are described in the README's *Data sources*
   table. If your vehicle is in a source we already import, refresh that source
   (`pnpm run refresh:<source>`) instead of hand-editing. A refresh only adds:
   entries the previous snapshot published and the source no longer reports
   are kept, because applications store the year/make/model they were given.
   Pass `--prune` only to remove a source error, and say so in the pull
   request. Brazilian models come from the SENATRAN register through the
   reviewed table in `scripts/senatran-br-models.ts`: to add one, add its
   RENAVAM make/model prefix there (`pnpm run refresh:senatran-br` logs the
   largest unmapped families) and refresh.

UK body derivatives (estates such as `3 SERIES TOURING`) come from the DVLA model descriptions in the UK DfT VEH0124 files through the reviewed mappings in `data/evidence/uk-dft-body-derivatives.json`; `pnpm run refresh:uk-dft` writes the observed years and vehicle counts to `data/evidence/uk-dft-body-derivatives-observed.json`. Map a body word only after checking it is the manufacturer's UK body designation for that generic model, not a trim (Ford ST, Mazda TS). A year without the word is not evidence the body was absent.

U.S. historical estate bodies (`CTS Wagon`, `9-5 SportCombi`) come from exact FuelEconomy.gov model names through `data/evidence/fueleconomy-us-body-derivatives.json`. `pnpm run refresh:fueleconomy-us --derivatives-only --input vehicles.csv` merges only those mappings and records observed years and EPA record IDs in `data/evidence/fueleconomy-us-body-derivatives-observed.json`. Map an EPA name only when it carries the manufacturer's estate designation for that nameplate; names that also cover another body (Subaru `Impreza Wagon`, which later labels the 5-door hatchback) stay unmapped.

Changan, SGMW and Bajaj regional facts now refresh through `pnpm run refresh:manufacturer-catalogs`. Review newly discovered exact names in `data/evidence/manufacturer-catalog-mappings.json`, rather than adding their current models one at a time to the generic reviewed file. Keep the complete original names and per-market evidence; never infer model years from guide upload dates. Old reviewed source filters remain published for compatibility.

Indian TVS, Hero, commercial, passenger and other two-wheeler sales catalogs refresh through `pnpm run refresh:india`. Reviewed product links and headings live in `data/evidence/indian-catalog-mappings.json`; a missing or changed name fails the refresh rather than selecting a similar product. Use `--batch tvs|hero|commercial|passenger|two-wheelers` for a focused refresh, or `--offline --date YYYY-MM-DD --cache-dir DIR` with the original dated HTML captures. Raw HTML stays in ignored `.cache/`; public evidence retains factual names, URLs and hashes. These sources establish calendar-year catalog presence only. Owner-manual dates and archived brochures are discovery evidence, and cannot establish current sales or historical year ranges.

Broad historical Indian portfolios refresh with `pnpm run refresh:india-history`, using `data/evidence/indian-history-mappings.json`. They merge into the same India snapshots and retain published records. PDF extraction requires Python with `pypdf` installed; choose its executable with `--python PATH` or `INDIA_HISTORY_PYTHON`. Neither Python nor network access is a runtime dependency. For a reproducible refresh, retain the original PDF/HTML files in ignored `.cache/indian-history` and pass `--offline --date YYYY-MM-DD`. Review the dated portfolio page and exact names before adding mappings. Monthly sales reports use positive individual domestic sales, excluding production-only, export-only and combined-model rows. Fiscal-year periods never become assumed calendar-year ranges. See [the historical source review](docs/indian-historical-catalogs.md) for accepted sources and unresolved labels.

3. **Add a small curated source when no dataset exists.** Follow
   `data/sources/atul-auto.json`: give the source an `sourceId`, `sourceName`,
   `sourceUrl`, `license`, `region`, `retrievedAt`, and a list of
   `{ year, make, model, vehicleTypeId }` records. Factual product names only;
   no marketing text or colors. Visually meaningful trims and body derivatives need explicit identity and year/market evidence; specification badges alone do not justify a new vehicle.

4. **Rebuild and test.**

   ```bash
   pnpm run build:data   # regenerates data/compact.json and src/data.ts
   pnpm test
   pnpm run typecheck
   pnpm run build
   ```

   CI verifies that the generated catalog is deterministic
   (`git diff --exit-code -- data/compact.json src/data.ts src/identity-data.ts`).

   Compare the rebuilt catalog with the previous release before publishing:
   preserve existing make/model IDs, including the first result for consumers
   that select by year/make/model without a vehicle-type filter. Source overlap
   can otherwise replace an existing ID. `data/model-id-compatibility.json`
   stores reviewed `[year, makeId, normalizedModelName, vehicleTypeId, modelId]`
   pins from the published catalog; the builder checks missing tuples and ID
   collisions. Add a pin only with prior-release identity evidence.

5. **Open a pull request** against `main` with: the source you used, the
   number of makes/models added, and the license. Bump `version` in
   `package.json` (minor for new data). Merging to `main` publishes the new
   version to npm automatically through trusted publishing.

## Reporting a wrong or duplicate vehicle

Open an issue with the `makeId`/`modelId`, the source it came from
(`sourceIds` on the model), and the correction with a link to evidence.

## Code changes

- Zero runtime dependencies and no network access at runtime are hard rules.
- Keep the public API (`getMakes`, `getModels`, `getAvailableYears`,
  `getDataSources`, `getVehicleTypes`, `searchVehicles`) backward compatible.
- Add tests in `src/*.test.ts` or `scripts/*.test.ts` for behavior changes.

## Downstream

- [Car Image API](https://carimage.dev?ref=catalog) — studio renders for every
  catalog vehicle (`GET /api/v1/images/car?make=…&model=…&year=…`). After a new
  `@meterapp/vehicle-db` release, the API bumps the dependency and the new
  vehicles become renderable immediately.

## Identity enrichment

Curate `data/identity/catalog.json`, then run `pnpm run build:identities`.
Generations are first-class; derivatives belong to a generation, and facelifts
use separate visual identities. Uncertain observations remain evidence instead
of being assigned a guessed generation. Aliases target identities and never
establish visual equivalence. Every relationship needs source evidence and an
appropriate market/year scope. Add negative resolution fixtures for unsafe
parent, body, generation, and performance substitutions.

Run `pnpm run check:compatibility -- <prior-release-ref>` and `pnpm run replay`
before release. Preserve the first selection without a vehicle-type filter as
well as all typed selections. Raw evidence belongs in `data/evidence/`, not
`data/sources/` or the runtime bundle. Customer replay files stay private.

### Shared dependency cache

Use pnpm 12.14.0 (the `packageManager` pin), then run `pnpm deps:install`. It installs the committed lockfile and prefers cached packages while fetching anything missing. Dependency updates remain explicit.

The pnpm global virtual store is enabled here after tests and builds passed. Equivalent dependency graphs share installed packages across projects and worktrees. It is experimental; to opt out set `virtualStoreType: project` in `pnpm-workspace.yaml` and reinstall.

Keep the shared download store warm; prune only occasionally, and retire completed worktrees through their owning tool after preserving changes.
