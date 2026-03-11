/**
 * Quick test to verify the database works.
 * Usage: npx tsx scripts/test-query.ts
 */
import {
  getVehicleTypes,
  getMakesForVehicleType,
  getModelsForMakeYear,
  getAvailableYears,
  close,
} from "../src/index";

console.log("Available years:", getAvailableYears());

console.log("\n--- Vehicle Types ---");
const types = getVehicleTypes();
types.Results.forEach((t) => console.log(`  ${t.VehicleTypeId}: ${t.VehicleTypeName}`));

console.log("\n--- Car makes for 2024 (first 10) ---");
const carMakes = getMakesForVehicleType("Passenger Car", 2024);
console.log(`Total: ${carMakes.Count}`);
carMakes.Results.slice(0, 10).forEach((m) => console.log(`  ${m.MakeId}: ${m.MakeName}`));

console.log("\n--- Truck makes for 2024 (first 10) ---");
const truckMakes = getMakesForVehicleType("Truck", 2024);
console.log(`Total: ${truckMakes.Count}`);
truckMakes.Results.slice(0, 10).forEach((m) => console.log(`  ${m.MakeId}: ${m.MakeName}`));

console.log("\n--- Toyota models for 2024 (all types) ---");
const allToyota = getModelsForMakeYear("Toyota", 2024);
console.log(`Total: ${allToyota.Count}`);
allToyota.Results.forEach((m) => console.log(`  ${m.Model_ID}: ${m.Model_Name}`));

console.log("\n--- Ford trucks for 2024 ---");
const fordTrucks = getModelsForMakeYear("Ford", 2024, "Truck");
console.log(`Total: ${fordTrucks.Count}`);
fordTrucks.Results.forEach((m) => console.log(`  ${m.Model_ID}: ${m.Model_Name}`));

close();
