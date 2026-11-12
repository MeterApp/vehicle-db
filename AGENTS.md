# AGENTS.md

For agents and people who add data to `@meterapp/vehicle-db`. The full rules are in
[CONTRIBUTING.md](CONTRIBUTING.md); this page is the short version and the boundary.

## What belongs here

This package holds **public facts with public evidence**:

- what vehicles exist (year, make, model, vehicle type: `data/sources/*.json` → `data/compact.json`);
- what they are called in which market (aliases and make aliases, with market and year scope);
- which catalog rows are the same shape: generations, facelifts, bodies, market scopes and twins
  (the identity graph in `data/identity/catalog.json`).

Everything else belongs to the consumer and never enters this repository:

- everything about a **picture**: instructions to an image model, reference photos, verification or
  review state of an image, repairs;
- everything about a **customer**: requests, lists, names, emails, companies.

## Non-goals

Do not add these, even in good faith:

- a trim catalog;
- an option or wheel catalog;
- factory colours;
- steering side as a catalog dimension;
- prompts or marketing text;
- photos;
- verification state;
- customer data.

A trim name may exist only as a `specification` identity that names a `visual` identity. A trim that
changes the body is a catalog model with its own row, added with evidence, as estates and cabs
already are.

## Evidence

Every record must be traceable to a public dataset or a manufacturer source; see
[CONTRIBUTING.md](CONTRIBUTING.md) for the rules per source. In short:

- Prefer refreshing a source that is already imported (`pnpm run refresh:<source>`) to hand-editing.
- Source snapshots live in `data/sources/` and carry `sourceId`, `sourceUrl`, `license`, `region`
  and `retrievedAt`.
- Per-record and raw evidence (URLs, notes, market and year basis, reviewed mappings) lives in
  `data/evidence/`, outside the npm bundle. Reviewed manufacturer records go in
  `data/evidence/manufacturer-reviewed.json` and are imported with `pnpm run refresh:reviewed`.
- Every identity, alias and catalog link in `data/identity/catalog.json` names `evidenceIds`; each
  evidence record has an `https` URL, a `sourceId`, a `retrievedAt` date and a note.
- A market-specific shape under a name other markets share is a `generation`/`visual` identity scoped by
  `markets`, `years` and `yearBasis` and linked to the rows it describes. Leave `names` empty on it and on
  its line: a name on an identity captures that name for every market.
- Say which year a source means (model year, catalog year, registration year…). Never infer a year,
  a generation or a market the source does not state.
- Factual product names only: no copied text, no images.

## Shipping a batch

1. Add the data with its evidence, then rebuild: `pnpm run build:data`.
2. Add replay cases to `scripts/fixtures/resolution-replay.json`: the query that must now resolve
   (`expectedStatus`) and the substitution that must not happen (`forbiddenModelNames`, for example
   the parent model, another body or another generation). Customer replay files stay private.
3. Run what CI runs (`.github/workflows/ci.yml`); all of it must pass:

   ```bash
   pnpm install --frozen-lockfile --prefer-offline
   pnpm run build:data && git diff --exit-code -- data/compact.json src/data.ts src/identity-data.ts
   pnpm run check:compatibility <prior-release-ref>   # for example v2.51.0
   pnpm run replay
   pnpm test
   pnpm run typecheck
   pnpm run build
   node scripts/check-package-api.mjs
   pnpm audit --prod
   ```

4. **A refresh only adds.** Rows a previous release published stay, because applications store the
   year, make and model they were given. `check:compatibility` fails on a removed row, a changed
   model ID, a changed make or a changed first selection. `data/model-id-compatibility.json` pins
   published `[year, makeId, normalizedModelName, vehicleTypeId, modelId]` tuples; add a pin only
   with prior-release evidence.
5. **A version bump on `main` publishes.** `.github/workflows/publish.yml` publishes to npm whenever
   the `version` in `package.json` is not on npm yet, and skips otherwise. Bump it (minor for new
   data) only in a pull request that should ship; leave it alone in every other one.
6. In the pull request that bumps the version, run `pnpm run changelog` and commit `CHANGELOG.md`.
7. Open the pull request with the Why / Change / Checks / Measure template
   (`.github/pull_request_template.md`).

## Request trailer

If a change answers a request on a consumer's request board, end a commit message with one line per
request:

```
Request-Ref: <opaque id>
```

- The id is opaque (letters, digits and `. _ : # -`, at most 64 characters). Never a customer name,
  an email address or a company; anything else on the line is ignored.
- Put it in a **commit message on the branch**. This repository squash-merges with the branch's
  commit messages as the squash message, so a trailer written only in the pull request description
  does not reach `main`.

## Release diff

`pnpm run release:diff` compares the catalog and the identity graph between two git refs (by default
the newest release tag below the current version, and `HEAD`) and writes `release.json`:

- `version`, `previousVersion`, `generatedAt`, `counts`;
- `catalog.added`, `catalog.removed` (expected empty), `catalog.modelIdsChanged` (expected empty);
- `identities.added` / `changed` / `removed` (id and kind);
- `catalogLinks`, `aliases`, `makeAliases`: `added` / `removed`;
- `evidence.added` (id and URL);
- `visualCompatibility`: allow/deny rules `added` / `removed` (id, the two visual identities, decision);
- `requestRefs`: the `Request-Ref` trailers of the commits between the two refs.

Options: `--from <ref>`, `--to <ref>`, `--out <file>`, `--worktree` (read the files on disk instead
of `--to`), `--changelog [file]` (write that version's `CHANGELOG.md` section instead). The publish
workflow attaches `release.json` to the GitHub release after the npm publish; that step may fail
without failing the release. Consumers read it to learn what a version added without diffing the
package.
