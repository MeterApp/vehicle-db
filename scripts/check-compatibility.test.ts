import { expect, test } from "vitest";
import { compareCatalogs } from "./check-compatibility";
const base = { makes: [{ make_id: 1, make_name: "A" }], modelNames: ["Car"], sources: [{ source_id: "one" }], models: [[2024, 1, 8, 0, 3, 1]] };
test("detects removed selections, replaced IDs, and lower-type first selection changes", () => {
  expect(compareCatalogs(base, { ...base, models: [] }).compatible).toBe(false);
  expect(compareCatalogs(base, { ...base, models: [[2024, 1, 9, 0, 3, 1]] }).changedIds).toHaveLength(1);
  expect(compareCatalogs(base, { ...base, models: [...base.models, [2024, 1, 7, 0, 2, 1]] }).changedFirstSelections).toHaveLength(1);
});
test("source-mask reordering is not a provenance change", () => {
  expect(compareCatalogs(base, { ...base, sources: [{ source_id: "two" }, ...base.sources], models: [[2024, 1, 8, 0, 3, 2]] }).provenanceChanges).toBe(0);
});
