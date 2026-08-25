# @meterapp/vehicle-db

An offline, international vehicle make/model catalog for Node.js and TypeScript. The package combines U.S. model-year data, the UK registered fleet, Asian-origin vehicles registered in New Zealand, Malaysian registration transactions, and an Indian manufacturer catalog into one small, zero-dependency API. It never makes runtime network requests.

The catalog covers seven vehicle types: **Motorcycle**, **Passenger Car**, **Truck**, **Bus**, **Multipurpose Passenger Vehicle (MPV)**, **Auto Rickshaw**, and **Other Vehicle**. The Asia-Pacific sources add Japanese domestic and kei models, Chinese EVs, Indian and Korean vehicles, Southeast Asian makes such as Perodua and Proton, and additional motorcycles and commercial vehicles.

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

// Japanese domestic and kei models from the Asian-origin NZTA slice.
const nztaAsiaMakes = getMakes({
  year: 2022,
  sourceId: "nzta-asia-pacific-mvr",
});
const hondaAsia = nztaAsiaMakes.find((make) => make.makeName === "HONDA");
const hondaAsiaModels = getModels({
  makeId: hondaAsia!.makeId,
  year: 2022,
  sourceId: "nzta-asia-pacific-mvr",
}); // Includes N-BOX.

// Southeast Asian market models such as Perodua Myvi and Proton S70.
const malaysiaMakes = getMakes({
  year: 2026,
  sourceId: "malaysia-jpj-registrations",
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
| [NZTA Motor Vehicle Register](https://www.nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets) | 30,374 Asian-origin car, truck, bus, motorcycle, and moped model-year records from 12 countries of origin; vehicle years 1990–2026 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Malaysia JPJ registration transactions](https://data.gov.my/data-catalogue/registration_transactions_car) | 1,756 passenger car, MPV, jeep, pickup, and window-van model/registration-year records; 2024–2026 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Year means the source’s model year for NHTSA, year of manufacture for DfT/DVLA (falling back to year of first use when manufacture year is unavailable), catalog year for Atul Auto, vehicle year for NZTA, and registration year for Malaysia JPJ. From 2007 onward, NZTA vehicle year means the year of first registration in New Zealand or overseas. Registration sources are evidence that a make/model was present in that market and do not guarantee a factory model-year designation. Source filters let applications choose the semantics appropriate for their workflow.

UK source attribution: Contains public sector information licensed under the Open Government Licence v3.0. Source: Department for Transport and Driver and Vehicle Licensing Agency.

NZTA and Malaysia source attribution: Licensed under Creative Commons Attribution 4.0 International. Sources: New Zealand Transport Agency Waka Kotahi and Malaysia Road Transport Department/data.gov.my.

## Factory colors

Factory paint availability is not included. The NZTA and Malaysia records contain the observed basic color of each registered vehicle, not the manufacturer’s stock colors for a make/model/year. Treating those fields as factory availability would produce false positives from repaints, imports, and broad color categories, so the importers intentionally omit them. A future color API should require manufacturer-backed paint options with explicit market and model-year provenance.

## Snapshot stats

| | |
|---|---:|
| Years | 1990–2026 |
| Sources | 5 |
| Vehicle types | 7 |
| Makes | 1,145 |
| Model names | 14,841 |
| Deduplicated model-year entries | 132,491 |
| Bundled TypeScript data | 4.21 MB |

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
npm run refresh:nzta-asia-pacific -- --start-year 1990 --end-year 2026
npm run refresh:malaysia-jpj -- --start-year 2024 --end-year 2026
npm run build:data
```

The NHTSA API rate-limits aggressively, so a full NHTSA refresh can take time. The UK importer downloads the two official VEH0124 CSV files. The NZTA importer discovers the current official ArcGIS service and requests distinct records for supported vehicle types and Asian countries of origin. The Malaysia importer downloads annual JPJ CSVs and aggregates individual transactions into unique model/registration-year records. Importers assign deterministic numeric IDs, write normalized snapshots, and discard temporary raw downloads.

## License

The package code is ISC licensed. Upstream data remains subject to the terms listed above.
