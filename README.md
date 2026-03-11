# vehicle-db

Offline NHTSA vehicle database. All U.S. passenger car makes and models from 1990-2026, bundled as a 2.4 MB SQLite file inside the package. No network requests needed.

Drop-in replacement for two NHTSA vPIC API endpoints:

- `GetMakesForVehicleType/car`
- `GetModelsForMakeYear/make/{make}/modelyear/{year}`

## Install

```bash
npm install @meterapp/vehicle-db
```

> Requires Node.js 18+. Uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) under the hood.

## Usage

```typescript
import {
  getMakesForVehicleType,
  getModelsForMakeYear,
  getAvailableYears,
  close,
} from "@meterapp/vehicle-db";

// Get all car makes for a given year
const makes = getMakesForVehicleType(2024);
// => { Count: 193, Message: "...", SearchCriteria: "...", Results: [...] }

// Get all models for a specific make and year
const models = getModelsForMakeYear("Toyota", 2024);
// => { Count: 27, Message: "...", SearchCriteria: "...", Results: [...] }

// See what years are available
const years = getAvailableYears();
// => [1990, 1991, ..., 2026]

// Optional: close the DB connection when you're done
close();
```

## API

### `getMakesForVehicleType(year: number): NHTSAResponse<MakeResult>`

Returns all passenger car makes for a given model year. Equivalent to:

```
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?year=2024&format=json
```

Each result contains:

```typescript
{
  MakeId: number;       // e.g. 474
  MakeName: string;     // e.g. "TOYOTA"
  VehicleTypeId: number; // e.g. 2
  VehicleTypeName: string; // e.g. "Passenger Car"
}
```

### `getModelsForMakeYear(make: string, year: number): NHTSAResponse<ModelResult>`

Returns all models for a given make and year. Make name is **case-insensitive**. Equivalent to:

```
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/Toyota/modelyear/2024?format=json
```

Each result contains:

```typescript
{
  Make_ID: number;    // e.g. 474
  Make_Name: string;  // e.g. "TOYOTA"
  Model_ID: number;   // e.g. 2208
  Model_Name: string; // e.g. "Corolla"
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
+ const makes = getMakesForVehicleType(year);
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
| **Years** | 1990 - 2026 |
| **Make entries** | 7,141 |
| **Model entries** | 30,094 |
| **SQLite file size** | 2.4 MB |

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
