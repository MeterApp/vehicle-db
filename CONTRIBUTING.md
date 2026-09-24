# Contributing to @meterapp/vehicle-db

This catalog powers the [Car Image API](https://carimage.dev?ref=catalog) and any
app that needs an offline make/model/year list. The image API consumes this catalog, but catalog presence, resolved visual identity, and asset availability are separate. A new record never implicitly authorizes a parent image.

## Adding a vehicle that is missing

1. **Check it is really missing.** Search the current snapshot:

   ```bash
   npm install
   node -e "console.log(require('./dist/search.js').searchVehicles('2024 rivian r1s'))"
   ```

   (Run `npm run build` first if `dist/` does not exist.) Spelling variants such
   as `f150` / `F-150` are already handled by search; do not add duplicates for
   punctuation or case.

2. **Prefer an official source.** New records must be traceable to a public
   dataset or manufacturer catalog. The bundled sources live in
   `data/sources/*.json` and are described in the README's *Data sources*
   table. If your vehicle is in a source we already import, refresh that source
   (`npm run refresh:<source>`) instead of hand-editing. A refresh only adds:
   entries the previous snapshot published and the source no longer reports
   are kept, because applications store the year/make/model they were given.
   Pass `--prune` only to remove a source error, and say so in the pull
   request.

3. **Add a small curated source when no dataset exists.** Follow
   `data/sources/atul-auto.json`: give the source an `sourceId`, `sourceName`,
   `sourceUrl`, `license`, `region`, `retrievedAt`, and a list of
   `{ year, make, model, vehicleTypeId }` records. Factual product names only;
   no marketing text or colors. Visually meaningful trims and body derivatives need explicit identity and year/market evidence; specification badges alone do not justify a new vehicle.

4. **Rebuild and test.**

   ```bash
   npm run build:data   # regenerates data/compact.json and src/data.ts
   npm test
   npm run typecheck
   npm run build
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

Curate `data/identity/catalog.json`, then run `npm run build:identities`.
Generations are first-class; derivatives belong to a generation, and facelifts
use separate visual identities. Uncertain observations remain evidence instead
of being assigned a guessed generation. Aliases target identities and never
establish visual equivalence. Every relationship needs source evidence and an
appropriate market/year scope. Add negative resolution fixtures for unsafe
parent, body, generation, and performance substitutions.

Run `npm run check:compatibility -- <prior-release-ref>` and `npm run replay`
before release. Preserve the first selection without a vehicle-type filter as
well as all typed selections. Raw evidence belongs in `data/evidence/`, not
`data/sources/` or the runtime bundle. Customer replay files stay private.
