import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { normalizeMakeName, normalizeModelName } from "./european-names";
import type { EeaRow } from "./import-eea-co2";
import type { RdwRow } from "./import-rdw-nl";
export function europeanEvidence(sourceId: string, rows: (EeaRow | RdwRow)[]) {
  return rows.map(row => {
    const eea = "Year" in row;
    const rawMake = (eea ? row.Mk : row.merk) ?? "";
    const rawName = (eea ? row.Cn : row.handelsbenaming) ?? "";
    const make = normalizeMakeName(rawMake);
    const identity = {
      sourceId, year: Number(eea ? row.Year : row.year), yearBasis: eea ? "registration-year" : "first-admission-year",
      market: eea ? row.MS : "NL", register: eea ? row.register ?? "co2cars" : "rdw",
      category: eea ? [row.Ct, row.Cr] : row.voertuigsoort,
      rawMake, rawName, canonicalMake: make, canonicalModel: make ? normalizeModelName(rawName, make) : null,
      approvalNumber: (eea ? row.TAN : row.typegoedkeuringsnummer) ?? null,
      type: (eea ? row.T : row.type) ?? null, variant: (eea ? row.Va : row.variant) ?? null,
      version: (eea ? row.Ve : row.uitvoering) ?? null,
    };
    return { id: createHash("sha256").update(JSON.stringify(identity)).digest("hex"), ...identity, count: Number(row.n) };
  }).sort((a,b) => a.id.localeCompare(b.id));
}
export function writeEuropeanEvidence(file: string, sourceId: string, url: string, rows: (EeaRow | RdwRow)[]) {
  const records = europeanEvidence(sourceId, rows);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, sourceId, url, retrievedAt: new Date().toISOString().slice(0,10), records }));
}
