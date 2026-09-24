import { expect, test } from "vitest";
import { buildSourceCatalog as eea, type EeaRow } from "./import-eea-co2";
import { buildSourceCatalog as rdw, type RdwRow } from "./import-rdw-nl";
import { europeanEvidence } from "./source-evidence";
test("configuration partitions recombine before European thresholds and spelling selection", () => {
  const e: EeaRow = { Year: 2024, MS: "FR", Mk: "CITROEN", Cn: "JUMPER BLUEHDI 140", Ct: "N1", Cr: null, n: 1000 };
  const partition = [{...e, n: 500, Va:"a"}, {...e, n:500, Va:"b"}];
  expect(eea(partition,{retrievedAt:"2026-09-24"})).toEqual(eea([e],{retrievedAt:"2026-09-24"}));
  const r: RdwRow = { year: 2024, merk:"CITROEN", handelsbenaming:"JUMPER BLUEHDI 140", voertuigsoort:"Bedrijfsauto", n:3 };
  expect(rdw([{...r,n:1,variant:"a"},{...r,n:2,variant:"b"}],{retrievedAt:"2026-09-24"})).toEqual(rdw([r],{retrievedAt:"2026-09-24"}));
  const evidence = europeanEvidence("eea",partition);
  expect(evidence[0].rawName).toContain("BLUEHDI");
  expect(new Set(evidence.map(e=>e.id)).size).toBe(2);
  expect(evidence.map(e=>e.variant).sort()).toEqual(["a","b"]);
});
