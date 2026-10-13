import { expect, test } from "vitest";
import { validateIdentityGraph, type IdentityGraph } from "./identity-types";
import { createVehicleResolver } from "../src/resolve";
const catalog = { makes: [{ make_id: 1, make_name: "Example" }, { make_id: 2, make_name: "Other" }], modelNames: ["One"], models: [[2025, 1, 10, 0, 1, 1], [2025, 2, 20, 0, 1, 1]], sources: [{ source_id: "fixture" }] };
const fixture = (): IdentityGraph => ({ schemaVersion: 1, revision: "fixture", identities: [], aliases: [], catalogLinks: [], homologation: [], visualCompatibility: [], evidence: [{ id: "e", sourceId: "fixture", url: "https://example.com", retrievedAt: "2026-10-13", note: "Synthetic brand fixture" }], makeAliases: [{ text: "Example Motors", makeId: 1, markets: ["IN"], evidenceIds: ["e"] }] });
test("make aliases reject evidence omissions, unknown makes, catalog shadows and overlapping targets", () => {
  validateIdentityGraph(fixture(), catalog);
  const mutations = [
    (g: IdentityGraph) => { g.makeAliases![0].evidenceIds = []; },
    (g: IdentityGraph) => { g.makeAliases![0].makeId = 99; },
    (g: IdentityGraph) => { g.makeAliases![0].text = "Other"; },
    (g: IdentityGraph) => { g.makeAliases!.push({ text: "Example Motors", makeId: 2, markets: ["IN"], evidenceIds: ["e"] }); },
  ];
  for (const mutate of mutations) { const graph = fixture(); mutate(graph); expect(() => validateIdentityGraph(graph, catalog)).toThrow(); }
});
test("longest scoped brand phrase preserves the catalog target and respects explicit make IDs", () => {
  const graph = fixture();
  graph.makeAliases!.push({ text: "Example Motors", makeId: 2, markets: ["VN"], evidenceIds: ["e"] });
  validateIdentityGraph(graph, catalog);
  const resolve = createVehicleResolver(catalog, graph);
  expect(resolve("2025 Example Motors One", { market: "IN" }).candidates[0]?.catalogSelections[0]?.modelId).toBe(10);
  expect(resolve("2025 Example Motors One", { market: "VN" }).candidates[0]?.catalogSelections[0]?.modelId).toBe(20);
  expect(resolve("2025 Example Motors One", { makeId: 2, market: "IN" }).status).not.toBe("MATCHED");
  expect(resolve("2025 Example Motors One").status).not.toBe("MATCHED");
});
