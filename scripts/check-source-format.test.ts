import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { formatSourceJson } from "./catalog-types";

// Enforces the line-per-row layout in CI (via `pnpm test`). Fix with `pnpm run format:sources`.
const SOURCES_DIRECTORY = path.join(__dirname, "..", "data", "sources");

describe("data/sources format", () => {
  it.each(fs.readdirSync(SOURCES_DIRECTORY).filter((name) => name.endsWith(".json")).sort())("%s is one row per line", (fileName) => {
    const text = fs.readFileSync(path.join(SOURCES_DIRECTORY, fileName), "utf8");
    expect(text === formatSourceJson(JSON.parse(text)), `run pnpm run format:sources`).toBe(true);
  });
});
