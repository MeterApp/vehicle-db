/**
 * Fetches NHTSA vehicle data and builds src/data.ts.
 *
 * Usage:
 *   npx tsx scripts/build-db.ts [--start-year 1990] [--end-year 2026]
 */
import fs from "fs";
import path from "path";

const OUT_PATH = path.join(__dirname, "..", "src", "data.ts");
const COMPACT_JSON_PATH = path.join(__dirname, "..", "data", "compact.json");
const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const CONCURRENCY = 3;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 2000;

// Vehicle types to fetch from NHTSA vPIC
const NHTSA_VEHICLE_TYPES = [
  { id: 2, name: "Passenger Car", slug: "car" },
  { id: 3, name: "Truck", slug: "truck" },
  { id: 7, name: "Multipurpose Passenger Vehicle (MPV)", slug: "multipurpose passenger vehicle (mpv)" },
];

const CUSTOM_VEHICLE_TYPES = [
  { id: 10001, name: "Auto Rickshaw" },
];

const CUSTOM_MAKES = [
  { id: 100001, name: "ATUL AUTO" },
  { id: 100101, name: "VAUXHALL" },
  { id: 100102, name: "CITROEN" },
  { id: 100103, name: "MAXUS" },
  { id: 100104, name: "IVECO" },
  { id: 100105, name: "SKODA" },
  { id: 100106, name: "DACIA" },
  { id: 100107, name: "RANGE ROVER" },
  { id: 100108, name: "MG" },
];

const CUSTOM_MODELS = [
  { id: 100001, makeId: 100001, name: "RIK", vehicleTypeId: 10001 },
  { id: 100002, makeId: 100001, name: "RIK+", vehicleTypeId: 10001 },
  { id: 100003, makeId: 100001, name: "GEM-PAXX DIESEL", vehicleTypeId: 10001 },
  { id: 100004, makeId: 100001, name: "GEM-PAXX CNG AQUA", vehicleTypeId: 10001 },
  { id: 100005, makeId: 100001, name: "GEM-CARGO DIESEL", vehicleTypeId: 10001 },
  { id: 100006, makeId: 100001, name: "GEM-CARGO AQUA CNG", vehicleTypeId: 10001 },
  { id: 100007, makeId: 100001, name: "ELITE PAXX", vehicleTypeId: 10001 },
  { id: 100008, makeId: 100001, name: "ELITE CARGO", vehicleTypeId: 10001 },
  { id: 100009, makeId: 100001, name: "RIK TWIN", vehicleTypeId: 10001 },
  { id: 100010, makeId: 100001, name: "ENERGIE2", vehicleTypeId: 10001 },
  { id: 100011, makeId: 100001, name: "SHAKTI", vehicleTypeId: 10001 },
  { id: 100012, makeId: 100001, name: "GEMINI+", vehicleTypeId: 10001 },
  { id: 101001, makeId: 449, name: "V-Class", vehicleTypeId: 7 },
  { id: 101002, makeId: 449, name: "V-Klasse", vehicleTypeId: 7 },
  { id: 101003, makeId: 449, name: "Viano", vehicleTypeId: 7 },
  { id: 101004, makeId: 449, name: "Vito", vehicleTypeId: 7 },
  { id: 101005, makeId: 449, name: "Vito Tourer", vehicleTypeId: 7 },
  { id: 101006, makeId: 449, name: "EQV", vehicleTypeId: 7 },
  { id: 101007, makeId: 449, name: "Sprinter Tourer", vehicleTypeId: 7 },
  { id: 101008, makeId: 449, name: "GLE", vehicleTypeId: 7 },
  { id: 101009, makeId: 449, name: "GLS", vehicleTypeId: 7 },
  { id: 101010, makeId: 449, name: "EQE", vehicleTypeId: 2 },
  { id: 101011, makeId: 449, name: "EQS", vehicleTypeId: 2 },
  { id: 101012, makeId: 482, name: "Transporter", vehicleTypeId: 7 },
  { id: 101013, makeId: 482, name: "Caravelle", vehicleTypeId: 7 },
  { id: 101014, makeId: 482, name: "Multivan", vehicleTypeId: 7 },
  { id: 101015, makeId: 482, name: "California", vehicleTypeId: 7 },
  { id: 101016, makeId: 482, name: "Crafter", vehicleTypeId: 7 },
  { id: 101017, makeId: 482, name: "Touran", vehicleTypeId: 7 },
  { id: 101018, makeId: 482, name: "Polo Sedan", vehicleTypeId: 2 },
  { id: 101019, makeId: 482, name: "Virtus", vehicleTypeId: 2 },
  { id: 101020, makeId: 460, name: "Transit Custom", vehicleTypeId: 7 },
  { id: 101021, makeId: 460, name: "Tourneo Custom", vehicleTypeId: 7 },
  { id: 101022, makeId: 460, name: "Transit Passenger", vehicleTypeId: 7 },
  { id: 101023, makeId: 448, name: "HiAce", vehicleTypeId: 7 },
  { id: 101024, makeId: 448, name: "HiAce Commuter", vehicleTypeId: 7 },
  { id: 101025, makeId: 448, name: "Proace Verso", vehicleTypeId: 7 },
  { id: 101026, makeId: 448, name: "Alphard", vehicleTypeId: 7 },
  { id: 101027, makeId: 448, name: "Vellfire", vehicleTypeId: 7 },
  { id: 101028, makeId: 448, name: "Coaster", vehicleTypeId: 7 },
  { id: 101029, makeId: 448, name: "Corolla Touring Sports", vehicleTypeId: 2 },
  { id: 101030, makeId: 448, name: "Yaris Sedan", vehicleTypeId: 2 },
  { id: 101031, makeId: 448, name: "Vios", vehicleTypeId: 2 },
  { id: 101032, makeId: 448, name: "Avanza", vehicleTypeId: 7 },
  { id: 101033, makeId: 448, name: "Innova", vehicleTypeId: 7 },
  { id: 101034, makeId: 448, name: "Kijang Innova", vehicleTypeId: 7 },
  { id: 101035, makeId: 448, name: "Fortuner", vehicleTypeId: 7 },
  { id: 101036, makeId: 498, name: "Staria", vehicleTypeId: 7 },
  { id: 101037, makeId: 498, name: "H-1", vehicleTypeId: 7 },
  { id: 101038, makeId: 498, name: "iMax", vehicleTypeId: 7 },
  { id: 101039, makeId: 498, name: "Starex", vehicleTypeId: 7 },
  { id: 101040, makeId: 498, name: "Accent", vehicleTypeId: 2 },
  { id: 101041, makeId: 498, name: "Verna", vehicleTypeId: 2 },
  { id: 101042, makeId: 498, name: "Solaris", vehicleTypeId: 2 },
  { id: 101043, makeId: 498, name: "Avante", vehicleTypeId: 2 },
  { id: 101044, makeId: 499, name: "Rio", vehicleTypeId: 2 },
  { id: 101045, makeId: 499, name: "Cerato", vehicleTypeId: 2 },
  { id: 101046, makeId: 499, name: "Forte", vehicleTypeId: 2 },
  { id: 101047, makeId: 499, name: "Niro", vehicleTypeId: 7 },
  { id: 101048, makeId: 499, name: "EV9", vehicleTypeId: 7 },
  { id: 101049, makeId: 499, name: "Sorento", vehicleTypeId: 7 },
  { id: 101050, makeId: 13647, name: "Trafic Passenger", vehicleTypeId: 7 },
  { id: 101051, makeId: 13647, name: "Master Passenger", vehicleTypeId: 7 },
  { id: 101052, makeId: 13647, name: "Logan", vehicleTypeId: 2 },
  { id: 101053, makeId: 13647, name: "Zoe", vehicleTypeId: 2 },
  { id: 101054, makeId: 471, name: "Vivaro Life", vehicleTypeId: 7 },
  { id: 101055, makeId: 471, name: "Movano Minibus", vehicleTypeId: 7 },
  { id: 101056, makeId: 100101, name: "Vivaro Life", vehicleTypeId: 7 },
  { id: 101057, makeId: 100101, name: "Movano Minibus", vehicleTypeId: 7 },
  { id: 101058, makeId: 5554, name: "Traveller", vehicleTypeId: 7 },
  { id: 101059, makeId: 5554, name: "Expert Combi", vehicleTypeId: 7 },
  { id: 101060, makeId: 5554, name: "Boxer Minibus", vehicleTypeId: 7 },
  { id: 101061, makeId: 100102, name: "SpaceTourer", vehicleTypeId: 7 },
  { id: 101062, makeId: 100102, name: "Jumpy Combi", vehicleTypeId: 7 },
  { id: 101063, makeId: 100102, name: "Relay Minibus", vehicleTypeId: 7 },
  { id: 101064, makeId: 100102, name: "Jumper Minibus", vehicleTypeId: 7 },
  { id: 101065, makeId: 492, name: "Scudo Combi", vehicleTypeId: 7 },
  { id: 101066, makeId: 492, name: "Ducato Passenger", vehicleTypeId: 7 },
  { id: 101067, makeId: 478, name: "Primastar Combi", vehicleTypeId: 7 },
  { id: 101068, makeId: 478, name: "NV200", vehicleTypeId: 7 },
  { id: 101069, makeId: 478, name: "Evalia", vehicleTypeId: 7 },
  { id: 101070, makeId: 478, name: "Sunny", vehicleTypeId: 2 },
  { id: 101071, makeId: 478, name: "Almera", vehicleTypeId: 2 },
  { id: 101072, makeId: 478, name: "Versa", vehicleTypeId: 2 },
  { id: 101073, makeId: 478, name: "Sentra", vehicleTypeId: 2 },
  { id: 101074, makeId: 100103, name: "MIFA 9", vehicleTypeId: 7 },
  { id: 101075, makeId: 515, name: "LM", vehicleTypeId: 7 },
  { id: 101076, makeId: 515, name: "RX", vehicleTypeId: 7 },
  { id: 101077, makeId: 515, name: "LX", vehicleTypeId: 7 },
  { id: 101078, makeId: 100104, name: "Daily Minibus", vehicleTypeId: 7 },
  { id: 101079, makeId: 528, name: "Rosa", vehicleTypeId: 7 },
  { id: 101080, makeId: 542, name: "Novo", vehicleTypeId: 7 },
  { id: 101081, makeId: 542, name: "Journey", vehicleTypeId: 7 },
  { id: 101082, makeId: 452, name: "3 Series", vehicleTypeId: 2 },
  { id: 101083, makeId: 452, name: "5 Series", vehicleTypeId: 2 },
  { id: 101084, makeId: 452, name: "7 Series", vehicleTypeId: 2 },
  { id: 101085, makeId: 452, name: "X5", vehicleTypeId: 7 },
  { id: 101086, makeId: 452, name: "X7", vehicleTypeId: 7 },
  { id: 101087, makeId: 582, name: "A4", vehicleTypeId: 2 },
  { id: 101088, makeId: 582, name: "A6", vehicleTypeId: 2 },
  { id: 101089, makeId: 582, name: "A8", vehicleTypeId: 2 },
  { id: 101090, makeId: 582, name: "Q7", vehicleTypeId: 7 },
  { id: 101091, makeId: 582, name: "Q8", vehicleTypeId: 7 },
  { id: 101092, makeId: 100105, name: "Octavia", vehicleTypeId: 2 },
  { id: 101093, makeId: 100105, name: "Superb", vehicleTypeId: 2 },
  { id: 101094, makeId: 100105, name: "Rapid", vehicleTypeId: 2 },
  { id: 101095, makeId: 485, name: "V60", vehicleTypeId: 2 },
  { id: 101096, makeId: 485, name: "V70", vehicleTypeId: 2 },
  { id: 101097, makeId: 485, name: "V90", vehicleTypeId: 2 },
  { id: 101098, makeId: 485, name: "XC90", vehicleTypeId: 7 },
  { id: 101099, makeId: 474, name: "City", vehicleTypeId: 2 },
  { id: 101100, makeId: 100106, name: "Logan", vehicleTypeId: 2 },
  { id: 101101, makeId: 467, name: "Cobalt", vehicleTypeId: 2 },
  { id: 101102, makeId: 467, name: "Onix Plus", vehicleTypeId: 2 },
  { id: 101103, makeId: 100107, name: "Range Rover", vehicleTypeId: 7 },
  { id: 101104, makeId: 444, name: "Discovery", vehicleTypeId: 7 },
  { id: 101105, makeId: 481, name: "Pajero", vehicleTypeId: 7 },
  { id: 101106, makeId: 481, name: "Montero", vehicleTypeId: 7 },
  { id: 101107, makeId: 481, name: "Shogun", vehicleTypeId: 7 },
  { id: 101108, makeId: 441, name: "Model Y", vehicleTypeId: 7 },
  { id: 101109, makeId: 441, name: "Model S", vehicleTypeId: 2 },
  { id: 101110, makeId: 441, name: "Model X", vehicleTypeId: 7 },
  { id: 101111, makeId: 482, name: "ID. Buzz", vehicleTypeId: 7 },
  { id: 101112, makeId: 100108, name: "MG4", vehicleTypeId: 2 },
  { id: 101113, makeId: 100108, name: "MG5 EV", vehicleTypeId: 2 },
  { id: 101114, makeId: 1991, name: "Atto 3", vehicleTypeId: 7 },
  { id: 101115, makeId: 1991, name: "Yuan Plus", vehicleTypeId: 7 },
  { id: 101116, makeId: 1991, name: "Dolphin", vehicleTypeId: 2 },
  { id: 101117, makeId: 1991, name: "Seal", vehicleTypeId: 2 },
  { id: 101118, makeId: 482, name: "Passat", vehicleTypeId: 2 },
  { id: 101119, makeId: 498, name: "Ioniq", vehicleTypeId: 2 },
  { id: 101120, makeId: 499, name: "Sedona", vehicleTypeId: 7 },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MakeResult {
  MakeId: number;
  MakeName: string;
  VehicleTypeId: number;
  VehicleTypeName: string;
}

interface ModelResult {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

interface ApiResponse<T> {
  Count: number;
  Message: string;
  Results: T[];
}

type RawModel = [number, number, number, string, number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchJson<T>(url: string): Promise<ApiResponse<T> | null> {
  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      if (text.startsWith("<")) {
        console.warn(`  Skipping (HTML response): ${url}`);
        return null;
      }
      return JSON.parse(text) as ApiResponse<T>;
    } catch (err) {
      if (attempt === RETRY_LIMIT) {
        console.warn(`  Failed after ${RETRY_LIMIT} attempts: ${url}`);
        return null;
      }
      console.warn(`  Retry ${attempt}/${RETRY_LIMIT} for ${url}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  return null;
}

function addCustomCatalogData(years: number[], allMakes: Map<number, string>, rawModels: RawModel[]): void {
  for (const make of CUSTOM_MAKES) {
    allMakes.set(make.id, make.name);
  }

  const existingModels = new Set(
    rawModels.map((m) => `${m[0]}:${m[1]}:${normalizeModelName(m[3])}:${m[4]}`)
  );

  for (const year of years) {
    for (const model of CUSTOM_MODELS) {
      const key = `${year}:${model.makeId}:${normalizeModelName(model.name)}:${model.vehicleTypeId}`;
      if (!existingModels.has(key)) {
        rawModels.push([year, model.makeId, model.id, model.name, model.vehicleTypeId]);
        existingModels.add(key);
      }
    }
  }
}

function normalizeModelName(name: string): string {
  return name.trim().toLocaleUpperCase("en-US").replace(/\s+/g, " ");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  let startYear = 1990;
  let endYear = 2026;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--start-year") startYear = Number(args[++i]);
    if (args[i] === "--end-year") endYear = Number(args[++i]);
  }

  console.log(`Building NHTSA database for years ${startYear}–${endYear}`);
  console.log(`NHTSA vehicle types: ${NHTSA_VEHICLE_TYPES.map((t) => t.name).join(", ")}`);
  console.log(`Custom vehicle types: ${CUSTOM_VEHICLE_TYPES.map((t) => t.name).join(", ")}`);
  console.log(`Output: ${OUT_PATH}\n`);

  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  );

  // ---- Step 1: Fetch makes per vehicle type ----
  console.log("Step 1/2: Fetching makes per vehicle type...");

  const allMakes = new Map<number, string>();
  const makesByTypeAndYear = new Map<string, Set<number>>();

  for (const vt of NHTSA_VEHICLE_TYPES) {
    await runPool(years, CONCURRENCY, async (year) => {
      const url = `${BASE}/GetMakesForVehicleType/${encodeURIComponent(vt.slug)}?year=${year}&format=json`;
      const data = await fetchJson<MakeResult>(url);
      if (data) {
        const key = `${vt.id}:${year}`;
        const makeIds = new Set<number>();
        for (const m of data.Results) {
          allMakes.set(m.MakeId, m.MakeName);
          makeIds.add(m.MakeId);
        }
        makesByTypeAndYear.set(key, makeIds);
        console.log(`  ${vt.slug} ${year}: ${data.Results.length} makes`);
      } else {
        console.warn(`  ${vt.slug} ${year}: FAILED`);
      }
    });
  }

  console.log(`\nTotal unique makes: ${allMakes.size}`);

  // ---- Step 2: Fetch models per make/year/vehicleType ----
  console.log("\nStep 2/2: Fetching models per make/year/vehicleType...");

  interface WorkItem {
    year: number;
    makeId: number;
    vehicleType: (typeof NHTSA_VEHICLE_TYPES)[number];
  }

  const work: WorkItem[] = [];
  for (const vt of NHTSA_VEHICLE_TYPES) {
    for (const year of years) {
      const key = `${vt.id}:${year}`;
      const makeIds = makesByTypeAndYear.get(key);
      if (makeIds) {
        for (const makeId of makeIds) {
          work.push({ year, makeId, vehicleType: vt });
        }
      }
    }
  }

  console.log(`  Total API calls needed: ${work.length}`);

  let completed = 0;
  // Collect raw model rows: [year, makeId, modelId, modelName, vehicleTypeId]
  const rawModels: RawModel[] = [];

  await runPool(work, CONCURRENCY, async ({ year, makeId, vehicleType }) => {
    const url = `${BASE}/GetModelsForMakeIdYear/makeId/${makeId}/modelyear/${year}/vehicleType/${encodeURIComponent(vehicleType.slug)}?format=json`;
    const data = await fetchJson<ModelResult>(url);
    if (data && data.Results.length > 0) {
      for (const m of data.Results) {
        rawModels.push([year, m.Make_ID, m.Model_ID, m.Model_Name, vehicleType.id]);
      }
    }

    completed++;
    if (completed % 200 === 0) {
      console.log(`  Progress: ${completed}/${work.length}`);
    }
  });

  addCustomCatalogData(years, allMakes, rawModels);

  // ---- Build compact JSON ----
  console.log("\nBuilding compact JSON...");

  // Deduplicate model names
  const modelNames = [...new Set(rawModels.map((m) => m[3]))].sort();
  const nameIndex = new Map(modelNames.map((n, i) => [n, i]));

  // Deduplicate models (year + makeId + modelId + vehicleTypeId)
  const seen = new Set<string>();
  const compactModels: [number, number, number, number, number][] = [];
  for (const m of rawModels) {
    const key = `${m[0]}:${m[1]}:${m[2]}:${m[4]}`;
    if (!seen.has(key)) {
      seen.add(key);
      compactModels.push([m[0], m[1], m[2], nameIndex.get(m[3])!, m[4]]);
    }
  }

  const vehicleTypes = [...NHTSA_VEHICLE_TYPES, ...CUSTOM_VEHICLE_TYPES].map((vt) => ({
    vehicle_type_id: vt.id,
    vehicle_type_name: vt.name,
  }));

  const makes = [...allMakes.entries()]
    .map(([id, name]) => ({ make_id: id, make_name: name }))
    .sort((a, b) => (a.make_name >= b.make_name ? 1 : -1));

  const compactData = { vehicleTypes, makes, modelNames, models: compactModels };
  const json = JSON.stringify(compactData);
  const tsOutput = `// Auto-generated — do not edit. Run npm run build:db to regenerate.

interface CompactData {
  vehicleTypes: { vehicle_type_id: number; vehicle_type_name: string }[];
  makes: { make_id: number; make_name: string }[];
  modelNames: string[];
  models: [number, number, number, number, number][];
}

const data: CompactData = ${json};

export default data;
`;
  fs.writeFileSync(COMPACT_JSON_PATH, json);
  fs.writeFileSync(OUT_PATH, tsOutput);

  const { size } = fs.statSync(OUT_PATH);
  const sizeMB = (size / 1024 / 1024).toFixed(2);

  console.log(`\nDone!`);
  console.log(`  Years:          ${years.length}`);
  console.log(`  Vehicle types:  ${vehicleTypes.length}`);
  console.log(`  Makes:          ${makes.length}`);
  console.log(`  Model names:    ${modelNames.length}`);
  console.log(`  Model entries:  ${compactModels.length}`);
  console.log(`  File size:      ${sizeMB} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
