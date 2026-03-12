# @meterapp/vehicle-db

Offline NHTSA vehicle database. All U.S. vehicle makes and models from 1990–2026, bundled as a 3.8 MB SQLite file inside the package. No network requests needed.

Covers three vehicle types: **Passenger Car**, **Truck**, and **Multipurpose Passenger Vehicle (MPV)**.

## Install

```bash
npm install @meterapp/vehicle-db
```

> Requires Node.js 18+. Uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) under the hood.

## Usage

```typescript
import {
  getVehicleTypes,
  getMakes,
  getModels,
  getAvailableYears,
  close,
} from "@meterapp/vehicle-db";

// List available vehicle types
const types = getVehicleTypes();
// => [
//   { vehicleTypeId: 2, vehicleTypeName: "Passenger Car" },
//   { vehicleTypeId: 3, vehicleTypeName: "Truck" },
//   { vehicleTypeId: 7, vehicleTypeName: "Multipurpose Passenger Vehicle (MPV)" },
// ]

// Get all makes
const allMakes = getMakes();

// Get makes that have models in 2024
const makes2024 = getMakes({ year: 2024 });

// Get only truck makes for 2024
const truckMakes = getMakes({ year: 2024, vehicleTypeId: 3 });

// Get all Toyota models for 2024
const toyotaModels = getModels({ makeId: 474, year: 2024 });
// => [
//   { modelId: 2469, modelName: "Camry", makeId: 474, makeName: "TOYOTA", vehicleTypeId: 2, vehicleTypeName: "Passenger Car" },
//   { modelId: 2208, modelName: "Corolla", ... },
//   ...
// ]

// Get only Ford trucks for 2024
const fordTrucks = getModels({ makeId: 460, year: 2024, vehicleTypeId: 3 });
// => [{ modelId: 1801, modelName: "F-150", ... }, ...]

// Get all available years
const years = getAvailableYears();
// => [1990, 1991, ..., 2026]

// Optional: close the DB connection when you're done
close();
```

## API

### `getVehicleTypes(): VehicleType[]`

Returns all vehicle types in the database.

```typescript
interface VehicleType {
  vehicleTypeId: number;   // e.g. 2
  vehicleTypeName: string; // e.g. "Passenger Car"
}
```

### `getMakes(options?): Make[]`

Returns makes, optionally filtered by year and/or vehicle type.

```typescript
getMakes()                                    // all makes
getMakes({ year: 2024 })                      // makes with models in 2024
getMakes({ vehicleTypeId: 3 })                // truck makes (all years)
getMakes({ year: 2024, vehicleTypeId: 3 })    // truck makes in 2024
```

```typescript
interface Make {
  makeId: number;   // e.g. 460
  makeName: string; // e.g. "FORD"
}
```

### `getModels(options?): Model[]`

Returns models, optionally filtered by year, vehicle type, and/or make.

```typescript
getModels({ makeId: 474, year: 2024 })                      // Toyota 2024 (all types)
getModels({ makeId: 460, year: 2024, vehicleTypeId: 3 })    // Ford trucks 2024
getModels({ vehicleTypeId: 3 })                              // all trucks (all years)
getModels({ year: 2024 })                                    // everything in 2024
```

```typescript
interface Model {
  modelId: number;          // e.g. 1801
  modelName: string;        // e.g. "F-150"
  makeId: number;           // e.g. 460
  makeName: string;         // e.g. "FORD"
  vehicleTypeId: number;    // e.g. 3
  vehicleTypeName: string;  // e.g. "Truck"
}
```

### `getAvailableYears(): number[]`

Returns all years present in the database, sorted ascending.

### `close(): void`

Closes the SQLite connection. Safe to call multiple times. The connection reopens automatically on the next query.

## Database stats

| | |
|---|---|
| **Years** | 1990 – 2026 |
| **Vehicle types** | 3 (Passenger Car, Truck, MPV) |
| **Makes** | 400 |
| **Model entries** | 51,270 |
| **SQLite file size** | 3.8 MB |
| **npm package size** | 1.5 MB |

## Rebuilding the database

To refresh the data from the NHTSA API:

```bash
npm run build:db
```

Or for a specific year range:

```bash
npm run build:db -- --start-year 2020 --end-year 2026
```

> The NHTSA API rate-limits aggressively. The build script retries failed requests, but some obscure makes may be skipped. Major manufacturers (Toyota, Honda, Ford, BMW, etc.) are always fetched successfully.

## License

ISC
