import { expect, test } from "vitest";
import { buildReleaseDiff, collectRequestRefs, renderChangelogSection, updateChangelog, type ReleaseSide } from "./release-diff";

const catalog = {
  makes: [{ make_id: 1, make_name: "ALFA" }, { make_id: 2, make_name: "BETA" }],
  vehicleTypes: [{ vehicle_type_id: 2, vehicle_type_name: "Passenger Car" }],
  modelNames: ["Car", "Car Estate", "Van"], sources: [{ source_id: "one" }],
  models: [[2023, 1, 10, 0, 2, 1], [2024, 1, 10, 0, 2, 1], [2024, 2, 30, 2, 2, 1]],
};
const evidence = (id: string) => ({ id, sourceId: "maker", url: `https://example.com/${id}`, retrievedAt: "2026-01-01", note: "private note" });
const node = (id: string, kind: "line" | "generation", extra = {}) => ({ id, kind, makeId: 1, vehicleTypeId: 2, name: id, names: [id], evidenceIds: ["e1"], ...extra });
const graph = {
  identities: [node("alfa:car", "line"), node("alfa:car:1", "generation", { parentId: "alfa:car" }), node("alfa:old", "line")],
  aliases: [{ text: "Kar", targetId: "alfa:car", kind: "misspelling" as const, evidenceIds: ["e1"] }],
  makeAliases: [{ text: "Alpha", makeId: 1, evidenceIds: ["e1"] }],
  catalogLinks: [{ identityId: "alfa:car:1", year: 2023, makeId: 1, modelId: 10, vehicleTypeId: 2, evidenceIds: ["e1"] }],
  evidence: [evidence("e1")],
};
const before: ReleaseSide = { version: "1.0.0", catalog, graph };
const after: ReleaseSide = {
  version: "1.1.0",
  catalog: { ...catalog, makes: [...catalog.makes, { make_id: 3, make_name: "GAMMA" }], modelNames: ["Car Estate", "Car", "Van", "Bus"],
    // Name indexes moved, one ID was replaced, one row was dropped, and three rows are new.
    models: [[2023, 1, 10, 1, 2, 1], [2024, 1, 11, 1, 2, 1], [2024, 1, 20, 0, 2, 1], [2025, 1, 20, 0, 2, 1], [2025, 3, 40, 3, 2, 1]] },
  graph: {
    identities: [node("alfa:car", "line"), node("alfa:car:1", "generation", { parentId: "alfa:car", years: [2023] }), node("alfa:car:estate", "generation", { parentId: "alfa:car" })],
    aliases: [{ text: "Kar", targetId: "alfa:car", kind: "misspelling" as const, markets: ["GB"], evidenceIds: ["e1"] }],
    makeAliases: [{ text: "Alpha", makeId: 1, evidenceIds: ["e1", "e2"] }, { text: "Gama", makeId: 3, evidenceIds: ["e2"] }],
    catalogLinks: [{ identityId: "alfa:car:estate", year: 2024, makeId: 1, modelId: 20, vehicleTypeId: 2, evidenceIds: ["e2"] }],
    evidence: [evidence("e2"), evidence("e1")],
  },
};
const diff = buildReleaseDiff(before, after, { generatedAt: "2026-01-02T00:00:00.000Z", commitMessages: [
  "catalog: add the estate (1.1.0) (#2)\n\nBody.\n\nRequest-Ref: req_8f2c\nRequest-Ref: BL-220\nCo-Authored-By: Someone <someone@example.com>",
  "* a squashed commit\n\n* another\n\n  request-ref: req_8f2c\n* Request-Ref: board:17",
  "Request-Ref: Jane Doe\nRequest-Ref: jane@example.com\nSee Request-Ref: inline",
] });

test("lists what a release added, removed and changed", () => {
  expect(diff).toMatchObject({ schemaVersion: 1, version: "1.1.0", previousVersion: "1.0.0", generatedAt: "2026-01-02T00:00:00.000Z" });
  expect(diff.catalog.added).toEqual([
    { year: 2024, make: "ALFA", model: "Car Estate", vehicleType: "Passenger Car", makeId: 1, modelId: 20, vehicleTypeId: 2 },
    { year: 2025, make: "ALFA", model: "Car Estate", vehicleType: "Passenger Car", makeId: 1, modelId: 20, vehicleTypeId: 2 },
    { year: 2025, make: "GAMMA", model: "Bus", vehicleType: "Passenger Car", makeId: 3, modelId: 40, vehicleTypeId: 2 },
  ]);
  expect(diff.catalog.removed).toEqual([{ year: 2024, make: "BETA", model: "Van", vehicleType: "Passenger Car", makeId: 2, modelId: 30, vehicleTypeId: 2 }]);
  expect(diff.catalog.modelIdsChanged).toEqual([{ year: 2024, make: "ALFA", model: "Car", vehicleType: "Passenger Car", makeId: 1, modelId: 11, vehicleTypeId: 2, previousModelId: 10 }]);
  expect(diff.identities).toEqual({
    added: [{ id: "alfa:car:estate", kind: "generation" }], changed: [{ id: "alfa:car:1", kind: "generation" }], removed: [{ id: "alfa:old", kind: "line" }],
  });
  expect(diff.catalogLinks.added).toEqual([{ identityId: "alfa:car:estate", year: 2024, makeId: 1, modelId: 20, vehicleTypeId: 2 }]);
  expect(diff.catalogLinks.removed).toEqual([{ identityId: "alfa:car:1", year: 2023, makeId: 1, modelId: 10, vehicleTypeId: 2 }]);
  // A rescoped alias is a removal and an addition; new evidence on the same alias is neither.
  expect(diff.aliases).toEqual({ added: [{ text: "Kar", targetId: "alfa:car", kind: "misspelling", markets: ["GB"] }], removed: [{ text: "Kar", targetId: "alfa:car", kind: "misspelling" }] });
  expect(diff.makeAliases).toEqual({ added: [{ text: "Gama", makeId: 3, make: "GAMMA" }], removed: [] });
  expect(diff.evidence).toEqual({ added: [{ id: "e2", url: "https://example.com/e2" }] });
  expect(diff.counts).toEqual({
    catalogRowsAdded: 3, catalogRowsRemoved: 1, modelIdsChanged: 1, makesAdded: 1, modelsAdded: 2,
    identitiesAdded: 1, identitiesChanged: 1, identitiesRemoved: 1, catalogLinksAdded: 1, catalogLinksRemoved: 1,
    aliasesAdded: 1, aliasesRemoved: 1, makeAliasesAdded: 1, makeAliasesRemoved: 0, evidenceAdded: 1, evidenceRemoved: 0, requestRefs: 3,
  });
});

test("collects opaque Request-Ref trailers and nothing that reads like a name or an address", () => {
  expect(diff.requestRefs).toEqual(["BL-220", "board:17", "req_8f2c"]);
  expect(collectRequestRefs(["Request-Ref:\nRequest-Ref: " + "x".repeat(65)])).toEqual([]);
  expect(JSON.stringify(diff)).not.toMatch(/Jane|example\.com\/?"|private note/);
});

test("is the same whatever order the records were written in", () => {
  const shuffled: ReleaseSide = { ...after, catalog: { ...after.catalog, models: [...after.catalog.models].reverse() },
    graph: { ...after.graph!, identities: [...after.graph!.identities].reverse(), evidence: [...after.graph!.evidence].reverse(), makeAliases: [...after.graph!.makeAliases!].reverse() } };
  expect(buildReleaseDiff(before, shuffled, { generatedAt: diff.generatedAt })).toEqual({ ...diff, requestRefs: [], counts: { ...diff.counts, requestRefs: 0 } });
  const unchanged = buildReleaseDiff(before, { ...before, version: "1.0.1", graph: undefined }, { generatedAt: diff.generatedAt });
  expect(unchanged.counts.catalogRowsAdded + unchanged.counts.catalogRowsRemoved + unchanged.counts.modelIdsChanged).toBe(0);
  expect(unchanged.identities.removed).toHaveLength(3);
});

test("writes one changelog section per version, newest first, and says what it left out", () => {
  const section = renderChangelogSection(diff, "2026-01-02", 1);
  expect(section).toContain("## 1.1.0 (2026-01-02)\n\nCompared with 1.0.0:");
  expect(section).toContain("- Catalog: 3 rows added (2 new models, 1 new make), 1 removed, 1 model ID changed.");
  expect(section).toContain("- ALFA: Car Estate (2024–2025)\n- …and 1 more model not listed here");
  expect(renderChangelogSection(diff, "2026-01-02")).toContain("- ALFA: Car Estate (2024–2025)\n- GAMMA: Bus (2025)\n");
  const first = updateChangelog("", "1.1.0", section);
  expect(first).toMatch(/^# Changelog\n[\s\S]+\n\n## 1\.1\.0 \(2026-01-02\)/);
  const next = updateChangelog(first, "1.2.0", "## 1.2.0 (2026-02-01)\n\nNewer.\n");
  expect(next.indexOf("## 1.2.0")).toBeLessThan(next.indexOf("## 1.1.0"));
  expect(updateChangelog(next, "1.1.0", "## 1.1.0 (2026-01-03)\n\nAgain.\n").match(/^## /gm)).toHaveLength(2);
  expect(updateChangelog(next, "1.2.0", "## 1.2.0 (2026-02-01)\n\nNewer.\n")).toBe(next);
});
