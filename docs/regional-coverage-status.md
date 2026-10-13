# Regional coverage in 2.16.0

Audited October 13, 2026 against v2.15.0. Read-only queries of the Car Image API Supabase project found the three feature requests, each with one vote and no exact model, market or year. The original September support email describes missing Asian makes and Bajaj tricycles without specifying models or years. Request comments, help queries and image feedback supplied no additional matching details. Private exports, contact details and messages are not committed.

The prior catalog has CHANGAN with ERA STAR and DEEPAL S07 EV, TQ WULING with BINGO in 2025–2026, and BAJAJ motorcycles plus historical generic Rickshaw/Auto Rickshaw records. Those generic rows do not establish coverage for modern named three-wheelers.

## Changan

Seven Saudi model-year 2026 additions use the authorized distributor's individual product pages: CS75 Plus, CS95, Eado Plus, Hunter, UNI-K, UNI-T and UNI-V. SUVs use MPV type 7, sedans type 2 and the Hunter pickup type 3. The distributor's live Alsvin, CS35 Plus and UNI-S pages mix 2026 and 2027 headings, so those inconsistent pages are excluded. The obsolete `/models/` route returns 404; live `/vehicle/` pages provide the evidence.

The [manufacturer's March 12, 2026 Mexican launch release](https://www.globalchangan.com/newsroom/2026-changan-global-testing-season-hits-mexico-with-four-new-models.html) supports Alsvin Plus, CS35 Max, CS55 Plus and CS75 Plus as marketed in calendar year 2026. These four facts belong to the separate catalog-year source. CS75 Plus overlaps the Saudi entry and adds source provenance without changing its selection. No worldwide model-year histories or equivalence between regional appearances are inferred.

## Wuling

[The Malaysian brand's official introduction](https://tqwuling.my/landing-page/) explicitly calls the brand TQ WULING and its first vehicle TQ WULING Bingo. The prefix is legitimate. Preserve make ID 3543148682, the BINGO model ID and both published years. Add the search-only spelling Wuling for this make so an exact `wuling bingo` query works with the Malaysian source filter; this does not create a strict visual identity alias.

The [Wuling Indonesia February 6, 2026 IIMS release](https://wuling.id/en/blog/press-release/wuling-showcases-a-complete-product-lineup-and-special-promotions-at-iims-2026) supplies six calendar-year catalog additions under WULING: Air ev, BinguoEV, Cloud EV, Alvez, Cortez and Almaz RS Hybrid. The first three are passenger cars, the latter three MPV/SUVs. Omit the marketing prefix New from family names. Mixed-body Mitra EV, newly introduced Eksion and Darion powertrain variants are outside this conservative batch. Indonesian BinguoEV and Malaysian Bingo remain separate records; no Chinese or Vietnamese year scope is inferred.

## Bajaj

The [current Indian manufacturer range](https://www.bajajauto.com/three-wheelers) and individual product pages support RE, Maxima Z, Maxima X Wide and Riki P4005 as passenger Auto Rickshaw (10001), and Maxima C and Riki C4005 as Truck (3) cargo bodies. These are the catalog marketed at the October 13, 2026 observation, not factory model years. Only that single calendar-year snapshot is included. Fuel and battery options do not generate extra models. Qute is a four-wheeler and is excluded from this three-wheeler batch; WEGO variants remain outside this focused addition.

## Verification and release scope

22 new year/model/type selections, one new make and unchanged historical selections. Factual product names only, with source attribution; no manufacturer prose or imagery is redistributed. No visual compatibility rules, generation guesses or image-sharing permissions are added. All published source snapshots remain independently filterable, and catalog-year facts remain distinct from factory model-year evidence.

Checks cover the complete test suite, TypeScript, build, deterministic regeneration, compatibility against v2.15.0 and synthetic resolver replay. Regression cases exercise preserved make IDs, year bounds, passenger versus cargo types and prefixed/unprefixed Wuling queries with regional source filters. Downstream API dependency adoption and rendering remain separate from this vehicle-db release. Broad feature requests cannot establish completeness for every unreported customer vehicle/year, and are not marked done in Supabase by this catalog change.
