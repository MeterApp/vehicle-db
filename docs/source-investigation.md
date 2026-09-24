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
