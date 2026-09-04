# @meterapp/vehicle-db

An offline, international vehicle make/model catalog for Node.js and TypeScript. The package combines U.S. model-year data, the UK registered fleet, the European Union's new car and van registration register, the daily-updated Dutch vehicle register, Asian-origin vehicles registered in New Zealand, Malaysian registration transactions, and an Indian manufacturer catalog into one small, zero-dependency API. It never makes runtime network requests.

The current snapshot spans **1990–2027** and includes **1,580 makes**, **36,870 model names**, and **207,953 deduplicated model-year entries** from **7 data sources**.

The catalog covers seven vehicle types: **Motorcycle**, **Passenger Car**, **Truck**, **Bus**, **Multipurpose Passenger Vehicle (MPV)**, **Auto Rickshaw**, and **Other Vehicle**. The European source adds continental models from Dacia, Cupra, DS, Lynk & Co, Alpine, and the Chinese brands entering Europe such as BYD, MG, Omoda, Xpeng, and Nio, as sold in the EU rather than the UK or U.S. The Dutch register keeps that coverage current: vehicles first registered this year appear within days, so 2026 models such as the BYD Atto 2 and Renault 5 E-Tech are already listed. The Asia-Pacific sources add Japanese domestic and kei models, Chinese EVs, Indian and Korean vehicles, Southeast Asian makes such as Perodua and Proton, and additional motorcycles and commercial vehicles.

## Demo and playground

This catalog is the backbone of the [Car Image API](https://car-imgs.vercel.app) — an AI-native API that renders studio-quality, transparent-background images of every vehicle listed here (six camera angles, 15 colors, PNG/WebP/JPG, $1 per 1,000 images). Explore the data in the [interactive playground](https://car-imgs.vercel.app/playground) or browse vehicles at [car-imgs.vercel.app/cars](https://car-imgs.vercel.app/cars).

**Missing a vehicle?** Add it here and it becomes renderable in the API on the next release — see [CONTRIBUTING.md](CONTRIBUTING.md).

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

// Models registered as new in the EU, Iceland, and Norway, e.g. BYD Seal U.
const euMakes = getMakes({ year: 2024, sourceId: "eea-co2-monitoring" });
const bydEu = euMakes.find((make) => make.makeName === "BYD");
const bydEuModels = getModels({
  makeId: bydEu!.makeId,
  year: 2024,
  sourceId: "eea-co2-monitoring",
});

// Current-year European registrations from the Dutch register, e.g. BYD Atto 2.
const bydNl = getMakes({ year: 2026, sourceId: "rdw-nl-vehicle-register" }).find(
  (make) => make.makeName === "BYD",
);
const bydNlModels = getModels({
  makeId: bydNl!.makeId,
  year: 2026,
  sourceId: "rdw-nl-vehicle-register",
});

// Existing queries remain valid.
const toyota = getMakes({ year: 2024 }).find((make) => make.makeName === "TOYOTA");
const toyotaModels = getModels({ makeId: toyota!.makeId, year: 2024 });
const years = getAvailableYears({
  makeId: toyota!.makeId,
  vehicleTypeId: 2,
  sourceId: "nhtsa-vpic",
});
```

## Driver search and autocomplete

The optional, zero-dependency search entry point turns free-form driver input into canonical catalog candidates. Its index is built lazily on the first search, and matching runs entirely in memory without network requests.

```typescript
import { searchVehicles } from "@meterapp/vehicle-db/search";

const suggestions = searchVehicles("2020 toy cam", {
  sourceId: "nhtsa-vpic",
  vehicleTypeId: 2,
  limit: 10,
});

const camry = suggestions.find(
  (result) => result.kind === "model" && result.modelName === "Camry",
);

if (camry?.kind === "model") {
  // A query containing a year has one directly selectable variant.
  const selection = camry.variants[0];
  // Persist year, makeId, modelId, and vehicleTypeId — not display text alone.
}
```

Search accepts year, make, and model tokens in any order. It recognizes common punctuation variants such as `F-150`/`f150` and `CR-V`/`crv`, a small set of make aliases such as `VW` and `Chevy`, and conservative misspellings. Results are ranked deterministically by exact, prefix, token, substring, then fuzzy match. Fuzzy matching is only used when no lexical result exists.

Queries without a year group a canonical make/model/type across all available years rather than returning duplicate suggestions for every year. Each model result contains `variants`, which provides the preferred catalog `modelId` for every selectable year.

For the simplest driver experience:

1. Infer the relevant market and pass its `sourceId`; year semantics differ by source.
2. Offer one field labelled “Search year, make, or model” and begin suggesting after two characters.
3. If the driver enters only a year, use `getMakes({ year, ... })` for the next step; a year-only search intentionally returns no arbitrary alphabetical suggestions.
4. On empty input, show application-owned recent vehicles. The catalog intentionally does not pretend that record frequency is vehicle popularity.
5. Use the manual fallback Year → Make → Model. `getAvailableYears(options)` supports every step.

Applications with regional telemetry can request more candidates and rerank **within the same `matchKind`**. Text quality and market compatibility should remain ahead of behavioral popularity so an exact result never loses to an unrelated popular vehicle.

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

Returns models, optionally filtered by `year`, `vehicleTypeId`, `makeId`, `modelId`, and/or `sourceId`. `sourceIds` preserves provenance when equivalent records appear in more than one source.

```typescript
getModels({ makeId: 474, year: 2024 });
getModels({ modelId: 2469, year: 2024 });
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

### `getAvailableYears(options?): number[]`

Returns years present in the combined catalog, optionally filtered by `makeId`, `modelId`, `vehicleTypeId`, and/or `sourceId`. Results are sorted ascending.

```typescript
getAvailableYears();
getAvailableYears({ makeId: 448, vehicleTypeId: 2, sourceId: "nhtsa-vpic" });
getAvailableYears({ modelId: 2469, sourceId: "nhtsa-vpic" });
```

### `searchVehicles(query, options?): VehicleSearchResult[]`

Import from `@meterapp/vehicle-db/search`. Returns deterministic make and grouped model candidates for free-form input. Options include `year`, `vehicleTypeId`, `sourceId`, `limit` (default 10, maximum 100), and `fuzzy` (default `true`).

Model results contain `years` and a year-specific `variants` array. Make results intentionally omit models, allowing applications to transition into the existing `getModels` flow after the driver chooses a make.

## Data sources

| Source | Coverage in this snapshot | Terms |
|---|---|---|
| [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | U.S. passenger cars, trucks, and MPVs; model years 1990–2027 | U.S. government public data |
| [UK DfT/DVLA vehicle licensing statistics](https://www.gov.uk/government/statistical-data-sets/vehicle-licensing-statistics-data-files) | 701 normalized makes across cars, motorcycles, goods vehicles, buses and coaches, and other vehicles; manufacture years 1990–2025 | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| [Atul Auto product catalog](https://atulauto.co.in/products/) | Current Indian passenger and cargo auto-rickshaw range; catalog years 2024–2026 | Source attribution; factual product names only |
| [NZTA Motor Vehicle Register](https://www.nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets) | 30,374 Asian-origin car, truck, bus, motorcycle, and moped model-year records from 12 countries of origin; vehicle years 1990–2026 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Malaysia JPJ registration transactions](https://data.gov.my/data-catalogue/registration_transactions_car) | 1,756 passenger car, MPV, jeep, pickup, and window-van model/registration-year records; 2024–2026 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [EEA CO2 monitoring of new passenger cars and vans](https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b) | 29,939 passenger car (M1) and van (N1) model/registration-year records from 235 makes reported by EU member states, Iceland, and Norway; 2010–2025 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Netherlands RDW vehicle register](https://opendata.rdw.nl/Voertuigen/Open-Data-RDW-Gekentekende_voertuigen/m9d7-ebf2) | 73,190 passenger car, commercial vehicle, bus, and motorcycle model/first-admission-year records from 624 makes licensed in the Netherlands; 1990–2026 | [Public domain (RDW Open Data)](https://opendata.rdw.nl/) |

Year means the source’s model year for NHTSA, year of manufacture for DfT/DVLA (falling back to year of first use when manufacture year is unavailable), catalog year for Atul Auto, vehicle year for NZTA, registration year for Malaysia JPJ, the reporting (registration) year for the EEA register, and the year of first admission (first registration anywhere, so imported used vehicles keep their original year) for the Dutch RDW register. From 2007 onward, NZTA vehicle year means the year of first registration in New Zealand or overseas. Registration sources are evidence that a make/model was present in that market and do not guarantee a factory model-year designation. Source filters let applications choose the semantics appropriate for their workflow.

UK source attribution: Contains public sector information licensed under the Open Government Licence v3.0. Source: Department for Transport and Driver and Vehicle Licensing Agency.

NZTA and Malaysia source attribution: Licensed under Creative Commons Attribution 4.0 International. Sources: New Zealand Transport Agency Waka Kotahi and Malaysia Road Transport Department/data.gov.my.

EEA source attribution: Licensed under Creative Commons Attribution 4.0 International. Source: European Environment Agency, *Monitoring of CO2 emissions from passenger cars* and *Monitoring of CO2 emissions from vans*, Regulation (EU) 2019/631. Member states report the make and commercial name inconsistently (multi-brand strings, legal entities, and trim-level names), so the importer merges brand spellings, drops engine and gearbox suffixes, keeps a make/model/year only when at least two countries report it or one country reports it more than 1,000 times, and uses the most reported spelling of each model name. The latest year is provisional data. EU vehicle categories map to the catalog as M1/M1G → Passenger Car and N1/N1G/N2 → Truck.

RDW source attribution: Open Data RDW (Dienst Wegverkeer), public domain. The register only contains vehicles currently licensed in the Netherlands, is republished daily, and is the freshest European source in the catalog. The same brand and model-name normalization as the EEA source is applied, plus a minimum of three vehicles per make/model/year to drop typos; RDW vehicle kinds map as Personenauto → Passenger Car, Bedrijfsauto → Truck, Bus → Bus, and Motorfiets → Motorcycle.

## Factory colors

Factory paint availability is not included. The NZTA and Malaysia records contain the observed basic color of each registered vehicle, not the manufacturer’s stock colors for a make/model/year. Treating those fields as factory availability would produce false positives from repaints, imports, and broad color categories, so the importers intentionally omit them. A future color API should require manufacturer-backed paint options with explicit market and model-year provenance.

## Snapshot stats

| | |
|---|---:|
| Years | 1990–2027 |
| Sources | 7 |
| Vehicle types | 7 |
| Makes | 1,580 |
| Model names | 36,870 |
| Deduplicated model-year entries | 207,953 |
| Bundled TypeScript data | 7.17 MB |

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
npm run refresh:nhtsa -- --start-year 1990 --end-year 2027
npm run refresh:nzta-asia-pacific -- --start-year 1990 --end-year 2026
npm run refresh:malaysia-jpj -- --start-year 2024 --end-year 2026
npm run refresh:eea-co2 -- --start-year 2010 --end-year 2026
npm run refresh:rdw-nl -- --start-year 1990 --end-year 2026
npm run build:data
```

The NHTSA API rate-limits aggressively, so a full NHTSA refresh can take hours; to add a new model year, fetch only that year and merge it into the existing snapshot with `npm run refresh:nhtsa -- --start-year 2027 --end-year 2027 --merge`. The UK importer downloads the two official VEH0124 CSV files. The NZTA importer discovers the current official ArcGIS service and requests distinct records for supported vehicle types and Asian countries of origin. The Malaysia importer downloads annual JPJ CSVs and aggregates individual transactions into unique model/registration-year records. The EEA importer discovers the current final and provisional register tables from the EEA DiscoData catalogue and asks its public SQL endpoint for make/commercial-name counts grouped by reporting country and year, so it never downloads the individual registration records; `--min-countries` and `--min-count` tune the noise filter. The RDW importer asks the Socrata API for make/commercial-name counts per year of first admission, one request per year, so a refresh takes about ten minutes and can be run any day to pick up the latest registrations. Importers assign deterministic numeric IDs, write normalized snapshots, and discard temporary raw downloads.

## License

The package code is ISC licensed. Upstream data remains subject to the terms listed above.
