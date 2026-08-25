# @meterapp/vehicle-db

An offline, international vehicle make/model catalog for Node.js and TypeScript. The package combines U.S. model-year data, the UK registered fleet, and a manufacturer catalog into one small, zero-dependency API. It never makes runtime network requests.

The catalog covers seven vehicle types: **Motorcycle**, **Passenger Car**, **Truck**, **Bus**, **Multipurpose Passenger Vehicle (MPV)**, **Auto Rickshaw**, and **Other Vehicle**. The UK fleet source adds European and Asian market vehicles plus motorcycles, light and heavy goods vehicles, and the explicit “Buses and coaches” category.

## Install

```bash
npm install @meterapp/vehicle-db
```

Requires Node.js 18 or newer.

## Usage

```typescript
import {
  getDataSources,
  getVehicleTypes,
  getMakes,
  getModels,
  getAvailableYears,
} from "@meterapp/vehicle-db";

// Inspect provenance and coverage before querying.
const sources = getDataSources();

// All seven categories, including Motorcycle (1) and Bus (5).
const types = getVehicleTypes();

// All makes with a 2024 motorcycle in the international UK fleet source.
const motorcycleMakes = getMakes({
  year: 2024,
  vehicleTypeId: 1,
  sourceId: "uk-dft-vehicle-licensing",
});

// Honda motorcycle models manufactured in 2024.
const honda = motorcycleMakes.find((make) => make.makeName === "HONDA");
const hondaMotorcycles = getModels({
  makeId: honda!.makeId,
  year: 2024,
  vehicleTypeId: 1,
  sourceId: "uk-dft-vehicle-licensing",
});

// Coach and transit bus makes/models use vehicle type 5.
const busMakes = getMakes({ year: 2024, vehicleTypeId: 5 });
const alexanderDennis = busMakes.find((make) => make.makeName === "ALEXANDER DENNIS");
const buses = getModels({
  makeId: alexanderDennis!.makeId,
  year: 2024,
  vehicleTypeId: 5,
});

// Existing queries remain valid.
const toyota = getMakes({ year: 2024 }).find((make) => make.makeName === "TOYOTA");
const toyotaModels = getModels({ makeId: toyota!.makeId, year: 2024 });
const years = getAvailableYears();
```

## API

### `getDataSources(): DataSource[]`

Returns the provenance, license, region, retrieval date, year range, vehicle types, and record counts for every source.

```typescript
interface DataSource {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  licenseUrl?: string;
  region: string;
  description: string;
  retrievedAt: string;
  vehicleTypeIds: number[];
  yearFrom: number;
  yearTo: number;
  makeCount: number;
  modelCount: number;
}
```

### `getVehicleTypes(): VehicleType[]`

Returns every vehicle category in the bundled catalog.

```typescript
interface VehicleType {
  vehicleTypeId: number;
  vehicleTypeName: string;
}
```

### `getMakes(options?): Make[]`

Returns makes, optionally filtered by `year`, `vehicleTypeId`, and/or `sourceId`.

```typescript
getMakes();
getMakes({ year: 2024 });
getMakes({ year: 2024, vehicleTypeId: 5 });
getMakes({ sourceId: "uk-dft-vehicle-licensing" });
```

```typescript
interface Make {
  makeId: number;
  makeName: string;
}
```

### `getModels(options?): Model[]`

Returns models, optionally filtered by `year`, `vehicleTypeId`, `makeId`, and/or `sourceId`. `sourceIds` preserves provenance when equivalent records appear in more than one source.

```typescript
getModels({ makeId: 474, year: 2024 });
getModels({ year: 2024, vehicleTypeId: 1 });
getModels({ year: 2024, vehicleTypeId: 5, sourceId: "uk-dft-vehicle-licensing" });
```

```typescript
interface Model {
  modelId: number;
  modelName: string;
  makeId: number;
  makeName: string;
  vehicleTypeId: number;
  vehicleTypeName: string;
  sourceIds: string[];
}
```

### `getAvailableYears(): number[]`

Returns all years present in the combined catalog, sorted ascending.

## Data sources

| Source | Coverage in this snapshot | Terms |
|---|---|---|
| [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | U.S. passenger cars, trucks, and MPVs; model years 1990–2026 | U.S. government public data |
| [UK DfT/DVLA vehicle licensing statistics](https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files) | 701 normalized makes across cars, motorcycles, goods vehicles, buses and coaches, and other vehicles; manufacture years 1990–2025 | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| [Atul Auto product catalog](https://atulauto.co.in/products/) | Current Indian passenger and cargo auto-rickshaw range; catalog years 2024–2026 | Source attribution; factual product names only |

Year means the source’s model year for NHTSA, year of manufacture for DfT/DVLA (falling back to year of first use when manufacture year is unavailable), and catalog year for Atul Auto. DfT notes that its fields are administrative records and can contain classification or naming errors. Source filters let applications choose the semantics appropriate for their workflow.

UK source attribution: Contains public sector information licensed under the Open Government Licence v3.0. Source: Department for Transport and Driver and Vehicle Licensing Agency.

## Snapshot stats

| | |
|---|---:|
| Years | 1990–2026 |
| Sources | 3 |
| Vehicle types | 7 |
| Makes | 1,017 |
| Model names | 8,806 |
| Deduplicated model-year entries | 108,308 |
| Bundled TypeScript data | 3.32 MB |

## Refreshing and rebuilding

The committed source snapshots make the package build deterministic and offline:

```bash
npm run build:data
npm test
npm run typecheck
npm run build
```

Refresh either network source independently, then rebuild the combined catalog:

```bash
npm run refresh:uk-dft
npm run refresh:nhtsa -- --start-year 1990 --end-year 2026
npm run build:data
```

The NHTSA API rate-limits aggressively, so a full NHTSA refresh can take time. The UK importer downloads the two official VEH0124 CSV files to a temporary directory, keeps valid make/generic-model/year records, assigns deterministic numeric IDs to non-NHTSA entities, and deletes the raw downloads when complete.

## License

The package code is ISC licensed. Upstream data remains subject to the terms listed above.
