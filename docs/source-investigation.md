# Source investigation — September 24, 2026

## GCC

[GSO's guide](https://www.gso.org.sa/cc/mv-fuel-economy-guide) is accessible, but its [terms](https://www.gso.org.sa/en/contact-gso/terms-of-use/) require prior written consent for copying/saving site content into data extraction systems. No GSO dataset is bundled or bulk importer enabled. Permission is an external dependency.

[SASO's open-data page](https://www.saso.gov.sa/en/mediacenter/Pages/open_data.aspx) advertises fuel-economy APIs and links [Swagger UI](https://api.saso.gov.sa/index.html?urls.primaryName=SASO+Open+Data+API). Both direct HTTP and browser-backed retrieval timed out during this implementation. Endpoint schemas, authentication, pagination, and dataset-specific reuse terms could not be verified. No speculative SASO API adapter or fabricated snapshot is shipped.

The permitted alternative is a small reviewed manufacturer source, using the existing factual-product-name attribution convention. The Saudi Kia Pegas 2025 MY entry is backed by [Kia's Saudi specification sheet](https://www.kia.com/content/dam/kwcms/sa/en/files/trim/Pegas/LX-D389.pdf). Each added manufacturer record retains its own URL, market, year and review rationale in `data/evidence/manufacturer-reviewed.json`. This is focused coverage, not a replacement for a comprehensive GCC feed. Nissan's old Sunny product URL redirects to Altima; this is not evidence for a Sunny model year. Attrage's requested Saudi model year remains unverified here.

## EPA/FuelEconomy

[Official web-service documentation](https://www.fueleconomy.gov/feg/ws/) links the uncompressed CSV used by the importer and defines model-year, model, vehicle class, engine and drivetrain fields. The initial 2022–2027 slice contains 6,914 configurations, deduplicated to 5,601 model/year/type records. Original configuration names are retained. `Special Purpose Vehicle` classes map conservatively to Other Vehicle, since that class includes vans, chassis, limousines and other bodies. No engine or drivetrain suffix is globally stripped.

The evidence sidecar retains selected nonpersonal source columns and the download SHA-256. Existing Maserati source IDs remain intact. Six reviewed compatibility pins preserve published first selections for Trax and Envista when EPA contributes a lower-numbered vehicle type; the old IDs are evidenced by baseline commit a36b8579ca55a93b11f8de3cfbda547eb1fd8d6d.

## European sources

[EEA DiscoData metadata](https://discodata.eea.europa.eu/md/) confirms `TAN`, `T`, `Va`, `Ve` in the combined car and van tables. The importer inspects per-table metadata and requests only fields present for the chosen historical table. It does not ingest `VIN` or individual registration IDs. [RDW metadata](https://opendata.rdw.nl/api/views/m9d7-ebf2.json) confirms `typegoedkeuringsnummer`, `type`, `variant`, and `uitvoering`.

Use `--evidence-out <path>` to opt into enriched grouping. Counts are recombined by the existing normalizer before thresholds apply, preserving canonical output for equivalent input. Full historical enriched refreshes are intentionally separate from this release: grouping at configuration level can increase query volume significantly. Fixture tests cover partitioned counts and evidence preservation; a live sample validates field access.

# Country registers — October 2, 2026

Goal: add an official, openly licensed register per market so that market-only models (Brazilian, Indian, Australian) are catalogued. Findings per source:

| Market | Source | Outcome |
| --- | --- | --- |
| Brazil | [SENATRAN RENAVAM fleet](https://dados.transportes.gov.br/dataset/registro-nacional-de-veiculos-automotores-renavam) | Imported as `senatran-br-renavam` |
| India | [VAHAN dashboard](https://vahan.parivahan.gov.in/vahan4dashboard/) | Not imported: no model-level public data |
| Australia | [ROVER / Register of Approved Vehicles](https://www.rover.infrastructure.gov.au/) | Not imported: no public bulk data |
| UK | DVLA bulk vehicle data | Not needed: access requires an application; the open DfT/DVLA VEH0124 statistics are already imported |
| EU | National type-approval registers | Not needed: fragmented by member state; the EEA CO2 register and RDW are already imported |

## Brazil

The Ministry of Transport's open data portal lists the dataset as "Other (Public Domain)" and publishes one ZIP per month (July 2026: 136 MB, one 1.2 GB semicolon-separated text file, 22.7 million rows). Columns: `UF;Município;Marca Modelo;Ano Fabricação Veículo CRV;Qtd. Veículos`, i.e. vehicle counts per municipality, make/model string and year of manufacture. The other monthly files on the [SENATRAN fleet page](https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/frota-de-veiculos-2026) (fuel, color, power, postcode, type/species/axles, model year vs. manufacture year) carry no make/model.

The make/model field is one abbreviated string, often down to the trim (`CHEV/ONIX 10MT LT2`, `I/TOYOTA HILUX CDSRXA4FD`, `TOYOTA/CCROSS XRE 20`), and there is no vehicle-type column. First-token heuristics produce names such as `CCROSS`, `DEL`, `MPOLO` (a bus body), or `L` (Mercedes-Benz trucks), so the importer maps strings with a reviewed table (`scripts/senatran-br-models.ts`) instead: about 420 model families with explicit vehicle types, covering 91% of the 119.5 million vehicles manufactured since 1990. Unmapped strings are dropped. The largest are heavy trucks and bus chassis with numeric codes, coachbuilt bus bodies, trailers, and small motorcycle importers' code names. The download server drops connections every minute or two, so the importer resumes with range requests.

SENATRAN's plate-validation (QR code) service returns make/model for a single vehicle; it is not a bulk source and is not used.

## India

The public VAHAN dashboard aggregates registrations by state, RTO, maker, vehicle class, fuel and emission norm. It has no model dimension, and there is no open bulk download or public API with reuse terms; access beyond the dashboard is arranged case by case. From this network the dashboard did not respond (connection timeouts) while parivahan.gov.in did, so even maker-level scraping would be fragile. Maker-level counts would not add models anyway.

State open data is the closest alternative. Telangana's RTA vehicle registration and online sales data (Open Government License – India, via data.telangana.gov.in and AIKosh) is described as including the vehicle model and make year, but the portal also timed out from here, and its model descriptions would need a reviewed mapping like Brazil's. Indian models therefore still come from other sources (NZTA's Asian-origin slice, Malaysia JPJ) and curated catalogs such as Atul Auto.

## Australia

ROVER's public Register of Approved Vehicles search looks up one VIN at a time, and the type-approval search is an interactive portal. Neither offers a bulk export. No data.gov.au dataset publishes type approvals or RAV entries, and copies of the RAV have been sought through freedom-of-information requests. The Green Vehicle Guide exports only search or comparison results, not its full catalog.

Victoria's Department of Transport and Planning publishes registration snapshots by make and model under CC BY 4.0 ([whole fleet by model](https://discover.data.vic.gov.au/dataset/whole-fleet-vehicle-registration-snapshot-by-model), [monthly new registrations](https://discover.data.vic.gov.au/dataset/monthly-new-vehicle-registration)). Both fields are truncated to six-character codes (`TOYOTA`/`LANDCR`, `MITSUB`/`OUTLAN`, `MAZDA`/`000003`), so they cannot provide model names without a reviewed mapping of their own.
