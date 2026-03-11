/**
 * Quick test to verify the database works.
 * Usage: npx tsx scripts/test-query.ts
 */
import { getMakesForVehicleType, getModelsForMakeYear, getAvailableYears, close } from "../src/index";

console.log("Available years:", getAvailableYears());

console.log("\n--- Makes for 2024 (first 10) ---");
const makes = getMakesForVehicleType(2024);
console.log(`Total: ${makes.Count}`);
makes.Results.slice(0, 10).forEach((m) =>
  console.log(`  ${m.MakeId}: ${m.MakeName}`)
);

console.log("\n--- Toyota models for 2024 ---");
const models = getModelsForMakeYear("Toyota", 2024);
console.log(`Total: ${models.Count}`);
models.Results.forEach((m) =>
  console.log(`  ${m.Model_ID}: ${m.Model_Name}`)
);

close();
