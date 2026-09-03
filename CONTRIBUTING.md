# Contributing to @meterapp/vehicle-db

This catalog powers the [Car Image API](https://car-imgs.vercel.app) and any
app that needs an offline make/model/year list. Every vehicle the image API can
render comes from here, so **adding a vehicle to this package adds it to the
API** on the next release.

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
   (`npm run refresh:<source>`) instead of hand-editing.

3. **Add a small curated source when no dataset exists.** Follow
   `data/sources/atul-auto.json`: give the source an `sourceId`, `sourceName`,
   `sourceUrl`, `license`, `region`, `retrievedAt`, and a list of
   `{ year, make, model, vehicleTypeId }` records. Factual product names only;
   no marketing text, trims, or colors.

4. **Rebuild and test.**

   ```bash
   npm run build:data   # regenerates data/compact.json and src/data.ts
   npm test
   npm run typecheck
   npm run build
   ```

   CI verifies that the generated catalog is deterministic
   (`git diff --exit-code -- data/compact.json src/data.ts`).

5. **Open a pull request** against `main` with: the source you used, the
   number of makes/models added, and the license. Bump `version` in
   `package.json` (minor for new data). Merging to `main` publishes the new
   version to npm automatically through trusted publishing.

## Reporting a wrong or duplicate vehicle

Open an issue with the `makeId`/`modelId`, the source it came from
(`sourceIds` on the model), and the correction with a link to evidence.

## Adding an exterior-design range

Appearance ranges let image consumers reuse one render across model years without pretending that
every consecutive year has the same body. Add a record to `data/appearance-ranges.json` with a
stable ID, make/model, inclusive years, representative year, body style, applicable regions, and a
public evidence URL.

- Prefer the manufacturer newsroom, brochure, or official model history. Wikidata is acceptable
  when the exact generation and dates are explicitly represented.
- Record facelifts separately. It is valid—and useful—for the outgoing and incoming appearances to
  overlap in a transition year; the runtime will keep that year as an exact-year cache key.
- Do not infer exterior equivalence from continuous registrations, a shared NHTSA body class, trim
  names, or a third-party scraper.
- Keep ranges bounded. Extending the catalog to a new year requires checking that the appearance
  did not change.

Run `npm run build:data`, `npm test`, and `npm run typecheck`. The build rejects unknown vehicles,
duplicate IDs, invalid years, and evidence URLs that are not HTTPS.

## Code changes

- Zero runtime dependencies and no network access at runtime are hard rules.
- Keep the public API (`getMakes`, `getModels`, `getAvailableYears`,
  `getDataSources`, `getVehicleTypes`, `searchVehicles`) backward compatible.
- Add tests in `src/*.test.ts` or `scripts/*.test.ts` for behavior changes.

## Downstream

- [Car Image API](https://car-imgs.vercel.app) — studio renders for every
  catalog vehicle (`GET /api/v1/images/car?make=…&model=…&year=…`). After a new
  `@meterapp/vehicle-db` release, the API bumps the dependency and the new
  vehicles become renderable immediately.
