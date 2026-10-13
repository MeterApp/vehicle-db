# Manufacturer coverage and conservative resolution, October 2026

This update adds 112 year/make/model/type records for four new makes and existing brands. It uses manufacturer or official distributor product lists, dated launches, sales tables, annual reports, manuals and brochures. All previously published numeric make/model IDs and first selections remain unchanged. Version 2.18.0 builds on the merged 2.17.0 broad regional catalogs; compatibility is checked against that published base.

## Acceptance criteria

- An exact factual product name, evidenced market and vehicle type must be present in the source. Broader search candidates, engine siblings and shared platforms are not evidence of the requested name.
- A factory model-year designation must be explicit. A dated sales/launch/portfolio/manual year is `catalog-year`. A current bookable or priced product observation is recorded only for the retrieval calendar year, with that limitation in its note. No interval or later model year is inferred.
- Named families such as Tata Ace and Starbus establish line presence only. Wheelbase, chassis, powertrain, seating, body builder, generation and appearance remain unresolved. Concrete Ashok Leyland Partner, Dost and electric truck variants stay separately named.
- A specification or exterior identity requires its own source evidence and scope. No image availability, rendering accuracy or asset-sharing approval follows from a catalog row.
- Missing context and unknown suffixes remain unresolved. No neighboring year, fuzzy result, generic base model or regional counterpart is substituted.

The build-time [accepted facts and downstream identifiers](../data/evidence/coverage-expansion-2026-10.json) list every addition, source URL, market, year basis, numeric IDs, scoped identity IDs and visual status. They contain public catalog facts only. The full customer disposition/replay remains outside this public repository, as CONTRIBUTING requires. Proposed Car Image `veh_` IDs in the sidecar are computed from the existing spelling/hash contract; they have **not** been confirmed on a deployed server.

## Changes with identity implications

**Lexus LX 600 F Sport:** separate US MY2022 and Vietnam catalog2026 specifications and exterior snapshots. The US [2022 manufacturer release](https://www.lexus.com/content/dam/lexus/documents/fcv/2022_Lexus_LX_600_Press_Release.pdf) and [Vietnam product page](https://www.lexus.com.vn/vn/models/lx/lx-600-fsport.html/) support distinct scoped facts. Both require their exact year and market. No cross-market appearance equivalence is approved.

**Lexus LX 570 Peak Edition:** China MY2019 specification and exterior snapshot. The [China release](https://www.lexus.com.cn/node/3625) explicitly names the special edition and its grille, bumpers and dark mirrors. This is not a generic LX570 alias and does not establish a Vietnam or MY2021 vehicle.

**BMW G60:** the existing generation, sedan and exterior evidence was already present. Adding an explicit catalog link to the named G60 generation fixes catalog-depth resolution of `2024 BMW 5 Series G60`, preserving model ID 1241822597. It neither adds another vehicle nor permits G30 substitution.

**Honda Amaze:** the [September 2025 official offer](https://stage.hondacarindia.com/media/press-releases/honda-announces-its-car-prices-post-gst-reforms-2025) sells second and third generations concurrently. Both generations link the line's existing new catalog record. Generation-depth resolution of plain `2025 Honda Amaze` is ambiguous; specifying the generation resolves its identity but still does not establish an exterior asset.

**Reviewed brands:** the optional `makeAliases` graph field supports scoped brand expansions without changing numeric make IDs. Hero MotoCorp and Maruti Suzuki target the existing HERO and MARUTI records in India. Search exposes lexical candidates; resolution requires the alias market. Validators reject missing evidence, unknown targets, aliases shadowing another catalog make and overlapping contradictory targets. Imported labels such as Honda Scooters, Honda Motorcycles and Tata Commercial remain caller category labels, not global make aliases.

**Compact engine badges:** reviewed spacing aliases for SP125, Activa125, Dio125 and Hornet2.0 preserve the specific engine/model line. No generic Shine, Jupiter, NTorq, Xpulse200, RayZR or Fascino alias selects a more specific variant.

## Explicit limits

Torcal is confirmed on [Bentley's official US site](https://www.bentleymotors.com/us/en/models/torcal.html). The addition records the announced catalog2026 line only; US MY2028 and Torcal S coverage are not inferred.

[Honda China's October2021 release](https://www.honda.com.cn/news/20211009.html) confirms refreshed Accord260TURBO. It is recorded as a known scoped name without a catalog2022 record; the release does not establish MY2022 or Vietnam import identity.

Vietnam Sportage X-Line and Santa Fe Calligraphy launches establish calendar catalog2022 and2024 respectively. They do not establish factory MY or select powertrain/seating variants. Their visual depth remains unresolved.

Tesla's [North America Model Y2025+ manual](https://www.tesla.com/ownersmanual/modely/en_us/) does not establish a manufacturer Juniper alias or uniquely choose seating/body and trim. No broad Juniper-to-base alias is added. Period Hilux SW4 SRV4x4, Vespa SXL/VXL engine/year, Custo/Custin market, exact Mach-E GT versus GT Performance Edition, IS F Sport engine/market and original BYD Song family/year evidence remain outstanding. Ford's formerly indexed2021 document URLs currently redirect; indexed snippets were not used to manufacture a new exact-market record.

## Downstream use

Use `market` and the documented `yearBasis` explicitly, and request `depth: "visual"` before selecting an asset. For example:

```ts
resolveVehicle("2026 Eicher Pro 6042", {
  market: "IN", yearBasis: "catalog-year", depth: "visual",
}); // GENERATION_UNRESOLVED: truck line exists, body/year configuration not bound

resolveVehicle("2019 Lexus LX 570 Peak Edition", {
  market: "CN", yearBasis: "model-year", depth: "visual",
}); // MATCHED: scoped visual identity, still requires an appropriate verified asset
```

Deploying the package and resolver support is separate work. The image workflow must bind the correct source appearance, inspect all views and verify live delivery before closing any request. All request statuses remain unchanged by this update.
