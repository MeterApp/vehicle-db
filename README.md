# vehicle-db

Offline NHTSA vehicle database. All U.S. vehicle makes and models from 1990–2026, bundled as a 3.8 MB SQLite file inside the package. No network requests needed.

Covers three vehicle types: **Passenger Car**, **Truck**, and **Multipurpose Passenger Vehicle (MPV)**.

Drop-in replacement for these NHTSA vPIC API endpoints:

- `GetMakesForVehicleType/{type}`
- `GetModelsForMakeYear/make/{make}/modelyear/{year}`
- `GetModelsForMakeIdYear/makeId/{id}/modelyear/{year}/vehicleType/{type}`

## Install

```bash
npm install @meterapp/vehicle-db
```

> Requires Node.js 18+. Uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) under the hood.

## Usage

```typescript
import {
  getVehicleTypes,
  getMakesForVehicleType,
  getModelsForMakeYear,
  getAvailableYears,
  close,
} from "@meterapp/vehicle-db";

// List available vehicle types
const types = getVehicleTypes();
// => Passenger Car, Truck, Multipurpose Passenger Vehicle (MPV)

// Get all truck makes for a given year
const makes = getMakesForVehicleType("Truck", 2024);
// => { Count: 171, Message: "...", Results: [...] }

// Get all models for a make and year (all vehicle types)
const models = getModelsForMakeYear("Toyota", 2024);
// => { Count: 27, Message: "...", Results: [...] }

// Filter models by vehicle type
const trucks = getModelsForMakeYear("Ford", 2024, "Truck");
// => { Count: 10, Message: "...", Results: [F-150, Ranger, ...] }

// See what years are available
const years = getAvailableYears();
// => [1990, 1991, ..., 2026]

// Optional: close the DB connection when you're done
close();
```

## API

### `getVehicleTypes(): NHTSAResponse<VehicleType>`

Returns all vehicle types in the database.

```typescript
{ VehicleTypeId: number; VehicleTypeName: string }
```

### `getMakesForVehicleType(vehicleType: string, year: number): NHTSAResponse<MakeResult>`

Returns all makes for a given vehicle type and model year. Vehicle type is **case-insensitive**. Equivalent to:

```
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/truck?year=2024&format=json
```

Each result contains:

```typescript
{
  MakeId: number;          // e.g. 460
  MakeName: string;        // e.g. "FORD"
  VehicleTypeId: number;   // e.g. 3
  VehicleTypeName: string; // e.g. "Truck"
}
```

### `getModelsForMakeYear(make: string, year: number, vehicleType?: string): NHTSAResponse<ModelResult>`

Returns all models for a given make and year. Make name is **case-insensitive**. Optionally filter by vehicle type.

```
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/Ford/modelyear/2024?format=json
```

Each result contains:

```typescript
{
  Make_ID: number;    // e.g. 460
  Make_Name: string;  // e.g. "FORD"
  Model_ID: number;   // e.g. 1801
  Model_Name: string; // e.g. "F-150"
}
```

### `getAvailableYears(): number[]`

Returns all years present in the database, sorted ascending.

### `close(): void`

Closes the SQLite connection. Safe to call multiple times. The connection reopens automatically on the next query.

## Migrating from the NHTSA API

Replace your fetch calls directly:

```diff
- const res = await fetch(
-   `https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?year=${year}&format=json`
- );
- const makes = await res.json();
+ const makes = getMakesForVehicleType("Passenger Car", year);
```

```diff
- const res = await fetch(
-   `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`
- );
- const models = await res.json();
+ const models = getModelsForMakeYear(make, year);
```

The response shape (`Count`, `Message`, `SearchCriteria`, `Results`) matches the NHTSA API, so downstream code should work unchanged.

## Database stats

| | |
|---|---|
| **Years** | 1990 – 2026 |
| **Vehicle types** | 3 (Passenger Car, Truck, MPV) |
| **Makes** | 400 |
| **Model entries** | 51,270 |
| **SQLite file size** | 3.8 MB |

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
