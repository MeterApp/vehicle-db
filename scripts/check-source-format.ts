// Checks that every data/sources/*.json file uses the line-per-row layout from
// formatSourceJson, so a changed row shows up as a one-line diff.
// `pnpm run check:sources` fails on drift; `pnpm run format:sources` fixes it.
import fs from "fs";
import path from "path";
import { formatSourceJson } from "./catalog-types";

const SOURCES_DIRECTORY = path.join(__dirname, "..", "data", "sources");
const write = process.argv.includes("--write");
const drifted: string[] = [];

for (const fileName of fs.readdirSync(SOURCES_DIRECTORY).filter((name) => name.endsWith(".json")).sort()) {
  const filePath = path.join(SOURCES_DIRECTORY, fileName);
  const text = fs.readFileSync(filePath, "utf8");
  const formatted = formatSourceJson(JSON.parse(text));
  if (text === formatted) continue;
  drifted.push(path.relative(process.cwd(), filePath));
  if (write) fs.writeFileSync(filePath, formatted);
}

if (drifted.length > 0 && !write) {
  console.error(`Source files are not in line-per-row format:\n  ${drifted.join("\n  ")}\nRun: pnpm run format:sources`);
  process.exitCode = 1;
} else {
  console.log(write ? `Formatted ${drifted.length} source file(s)` : "Source files are formatted");
}
