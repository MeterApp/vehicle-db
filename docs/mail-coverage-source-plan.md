# Vehicle coverage source plan

This is the baseline research audit; completed additions and validation are recorded in [coverage-release-status.md](coverage-release-status.md).

Reviewed October 12, 2026 against vehicle-db 2.14.0, commit `0ef6e930af7b8653082ea187355e3e3529caeef5`.

All 11 Brazilian models reported missing in September are already in the October 2 SENATRAN snapshot. Their next milestone is downstream adoption and verification of requested years. The remaining work combines missing regional model names, missing years, naming corrections, distinct body/trim identities, and render quality fixes.

The accompanying [source inventory](../data/evidence/coverage-source-candidates.json) records 11 Brazilian models, 26 focused model/identity candidates, 118 Indian exact-name candidates in 33 source groups, and discovery sources for Bajaj three-wheelers, Changan and Wuling. These are research candidates, not importable records. Counts overlap across groups and are not a count of unique missing vehicles. Model-year and reuse reviews remain explicit before ingestion.

## Mail scope and method

AgentMail organization-wide thread search used `Brazilian models`, `coverage`, `missing`, `unsupported`, `Saudi`, `not found`, `catalog`, `vehicle request` and `model missing`. The precise catalog and model searches exhausted their returned result sets; the broad `missing` search returned a page dominated by automated lifecycle mail and was narrowed with the more specific searches. This is a targeted coverage audit, not a claim to have read every message in the organization.

The actionable conversations concerned Brazilian ride-hailing vehicles, Vietnam-market vehicles and incorrect renders, Indian luxury variants, Asian/Chinese naming gaps and Bajaj three-wheelers, and an Indian digital-garage coverage attachment. Both relevant attachments were read. The Vietnam attachment contains 14 wrong-photo rows and 26 no-photo rows, rather than the 37 total / 23 missing quoted in the reply. Ranger 2019 occurs in both sections; a no-photo label does not establish catalog absence. The Indian attachment gives representative names without years, so it supports prioritization but cannot specify model-year additions.

Private messages, customer contact details, signed attachment URLs, PDFs and the raw lists are not committed. The inventory contains curated product-name candidates, public sources and snapshot observations.

Matching is exact after case, accent and punctuation normalization. Indian make spelling candidates include Maruti / Maruti Suzuki / Suzuki and Hero / Hero MotoCorp; brand matching is an audit convenience, not an approved identity alias. No engine suffix stripping, generation guessing, nearby-year substitution or asset compatibility approval is performed. Existing names under a different spelling can explain an apparent miss.

## Brazilian models

The year column below is the year of manufacture recorded in the fleet snapshot, not a manufacturer model year. Presence in a national fleet is not proof of a particular trim, facelift or factory color. [SENATRAN RENAVAM](https://dados.transportes.gov.br/dataset/registro-nacional-de-veiculos-automotores-renavam) is the primary bulk source; its portal lists Public Domain. Reviewed prefixes already exist in `scripts/senatran-br-models.ts`.

| Model | Manufacture years in SENATRAN | Type | Additional official evidence |
| --- | --- | --- | --- |
| Volkswagen Gol | 1990–2023 | Passenger car | [Source 1](https://www.vw.com.br/pt/servicos-e-acessorios/servicos-e-produtos/manuais-e-garantia/manuais.html) |
| Fiat Mobi | 2016–2026 | Passenger car | [Source 1](https://www.media.stellantis.com/br-pt/fiat/press/fiat-mobi-chega-em-sua-linha-2026-com-o-interior-remodelado-e-novos-equipamentos) |
| Fiat Argo | 2017–2026 | Passenger car | [Source 1](https://www.media.stellantis.com/br-pt/fiat/fiat-argo-my26) |
| Renault Kwid | 2017–2026 | Passenger car | [Source 1](https://www.renault.com.br/veiculos-de-passeio/kwid.html) |
| Fiat Cronos | 2017–2026 | Passenger car | [Source 1](https://www.media.stellantis.com/br-pt/fiat/press/com-novo-design-fiat-cronos-chega-mais-moderno-e-sofisticado-na-linha-2026) |
| Chevrolet Onix Plus | 2019–2026 | Passenger car | [Source 1](https://www.chevrolet.com.br/servicos/manuais-veiculos/anos-anteriores) |
| Chevrolet Prisma | 2006–2019 | Passenger car | [Source 1](https://www.chevrolet.com.br/servicos/manuais-veiculos/anos-anteriores) |
| Chevrolet Spin | 2012–2026 | MPV | [Source 1](https://www.chevrolet.com.br/servicos/manuais-veiculos/anos-anteriores) |
| Volkswagen Voyage | 1990–1995, 2008–2023 | Passenger car | [Source 1](https://www.vw.com.br/pt/servicos-e-acessorios/servicos-e-produtos/manuais-e-garantia/manuais.html) |
| Volkswagen Virtus | 2017–2026 | Passenger car | [Source 1](https://www.vw.com.br/pt/servicos-e-acessorios/servicos-e-produtos/manuais-e-garantia/manuais.html) |
| Volkswagen Saveiro | 1990–2026 | Truck | [Source 1](https://www.vw.com.br/pt/servicos-e-acessorios/servicos-e-produtos/manuais-e-garantia/manuais.html) |

Volkswagen's manual selector offers historical Gol and Voyage documents as well as Virtus and Saveiro documents by year. Chevrolet's historical selector covers Prisma, Spin and Onix/Onix Plus; inspect each selected PDF's title and model-year label rather than assuming all models share all selector years. Fiat's Mobi and Cronos releases explicitly identify the 2026 range, and its Argo collection is labelled MY26. These support focused year enrichment, not extrapolated historical ranges. Renault's Brazilian Kwid page gives current year-labelled offers; keep combustion Kwid and Kwid E-Tech distinct.

Check the other 12 names in the original Brazil request as part of the downstream replay, particularly Etios, whose old support reply reported only 2017. The primary fleet snapshot now has a broader Etios span. Do not conclude that the live service has adopted this checkout from local presence alone.

## Focused additions and identity reviews

The local coverage column is global exact-name presence, including every source's own year basis. US or China evidence does not establish Indian or Vietnamese availability. Source publication dates and launch years are not automatically manufacturer model years.

| Candidate | Local exact-name years | Scope to review | Official source and review requirement |
| --- | --- | --- | --- |
| Vinfast EC Van | None | VN | [Source 1](https://vinfastauto.com/vn_vi/vinfast-nhan-coc-som-mau-xe-dien-cho-hang-vinfast-ec-van). 2025 launch evidence; not an explicit model year. Determine cargo type and year basis. |
| Land Rover Defender 130 | 1999–2001, 2004–2009, 2025–2026 | US | [Source 1](https://www.landroverusa.com/vehicles/defender-23my/defender-130/index). 2023 model-year source; missing 2023 locally despite 2025/2026 presence. Keep old and modern generations separate. |
| Land Rover Defender OCTA | None | US | [Source 1](https://media.jlr.com/corporate/en-us/news/2024/04/groundbreaking-new-defender-octa-will-be-revealed-july-3-following-exclusive-client). Explicit North American MY2025; separate derivative, verify India scope before market-restricted resolution. |
| Land Rover Range Rover Sport SV | None | US | [Source 1](https://media.jlr.com/range-rover/en-us/news/2023/05/new-range-rover-sport-sv-modern-luxury-performance-flagship). 2024 US launch/year lead; verify exact MY technical specification and edition scope. |
| Porsche Cayenne Electric | None | US | [Source 1](https://newsroom.porsche.com/en_US/2025/products/new-porsche-all-rounder-Cayenne-nameplate-expands-portfolio-to-include-electrification-41132.html). Explicit 2026 US model evidence. Distinct from ICE/PHEV Cayenne; verify India evidence separately. |
| BMW 5 Series | 1990–2026 | US | [Source 1](https://www.press.bmwgroup.com/usa/article/attachment/T0418778EN_US/624323). 2024 G60 specification evidence; generation enrichment, not another generic 5 Series record. India long-wheelbase evidence remains separate. |
| Hyundai Custin | None | VN | [Source 1](https://hyundai.thanhcong.vn/custin). Vietnam official name Custin; requested Custo spelling requires regional alias evidence before normalization. Year pending. |
| Volkswagen Viloran | None | VN | [Source 1](https://www.vw.com.vn/vi/sanpham/viloran.html). Official Vietnam model; dated [brochure](https://www.vw.com.vn/idhub/content/dam/onehub_pkw/importers/vn/pdf/VILORAN_E-CATALOGUE_27012026.pdf) is a publication date, not MY proof. |
| Volkswagen Teramont X | None | VN | [Source 1](https://www.vw.com.vn/vi/sanpham/teramont_x.html). Official Vietnam model; separate body from Teramont. Year pending. |
| Volkswagen Teramont | 2019 | VN | [Source 1](https://www.vw.com.vn/vi/sanpham.html). Only 2019 locally. Current product navigation is a discovery lead; retain precise generation/suffix (including Pro) and verify requested year. |
| Lynk & Co 03 | None | VN | [Source 1](https://lynkco.com.vn/en/lynk-co-chinh-thuc-gioi-thieu-lynk-co-02-va-lynk-co-03-hai-mau-xe-hoan-toan-moi-cua-thuong-hieu-tai-thi-truong-viet-nam). 2026 Vietnam launch evidence; verify year semantics. Do not replace with 03+. |
| Lynk & Co 05 | None | VN | [Source 1](https://lynkco.com.vn/en). Official Vietnam lineup; year pending. |
| Lynk & Co 06 | None | VN | [Source 1](https://lynkco.com.vn/pdf/06.pdf). Official Vietnam specification; year pending. |
| Lynk & Co 07 | None | CN | [Source 1](https://www.lynkco.com.cn/Cars/07). Official China 07 EM-P evidence only; Vietnam scope and MY pending. Separate 07 GT. |
| Lynk & Co 09 | None | VN | [Source 1](https://lynkco.com.vn/en). Official Vietnam lineup; year pending. |
| BYD Song | None | CN | [Source 1](https://www.byd.com/cn/dynasty-home/models/song/2025song-l-ev). Evidence is for Song L EV 2025, not generic Song. Obtain original Song or specific Song Pro/Plus/L facts; no global family collapse. |
| Mahindra Bolero | None | IN | [Source 1](https://auto.mahindra.com/on/demandware.static/-/Sites-amc-Library/default/dwca8fb900/brochure/BOLERO%20brochure.pdf). Official specification; current sales evidence does not establish historical model years. Distinguish Bolero Neo. |
| Tata Nano | None | IN | [Source 1](https://www.tatamotors.com/press-releases/the-tata-nano-arrives/). March 2009 launch evidence; year basis must be explicit, historical refresh needed. |
| Great Wall Wingle | 2015–2019 | unspecified | [Source 1](https://www.gwm-global.com/news_detail-1192.html). Wingle 5 manufacturer evidence; generic Wingle already 2015-2019. Preserve Wingle 5/7 distinctions and Great Wall/GWM IDs. |
| Hyundai Santa Fe Calligraphy | None | VN | [Source 1](https://www.hyundai.com/worldwide/en/newsroom/detail/0000000284). Global trim lead; verify Vietnam MY2024 trim and appearance. |
| Ford Mustang Mach-E GT | 2022–2026 | VN | [Source 1](https://media.ford.com/content/fordmedia/feu/de/en/news/2021/07/09/exhilarating-electric-performance--online-ordering-for-ford-must.html). European 2021 GT launch evidence; Vietnam/import-market MY2021 pending. |
| Honda Accord 260 Turbo | None | CN | [Source 1](https://www.honda.com.cn/news/20211009.html). Official 2021 launch confirms 260 TURBO badge. Requested 2022 and visual distinction unverified; may be specification only. |
| Kia Sportage X-Line | None | VN | [Source 1](https://sportage.kiavietnam.com.vn/storage/e-catalogue/e-catalogue-sportage-82022.pdf). Vietnam dated August 2022 catalog lists X-Line. Publication date alone is not MY; do not use US 2022 generation. |
| Lexus IS F Sport | None | VN | [Source 1](https://www.lexus.com/content/dam/lexus/documents/brochures/models/2021/MY21-Lexus-IS-Brochure.pdf). US MY2021 trim evidence; verify Vietnam/import engine and market. |
| Lexus LX 570 Peak Edition | None | VN | [Source 1](https://www.lexus.com.vn/content/dam/lexus-v3-vietnam/brochure/Catalogue-LX570.pdf). Official base LX570 source only; Peak Edition unsupported by this evidence. Hold edition until official importer/coachbuilder proof. |
| Lexus LX 600 F Sport | None | VN | [Source 1](https://pressroom.lexus.com/lexus-flagship-suv-returns-for-2026-with-an-f-sport-appearance-package/). US MY2026 LX600 F SPORT Handling evidence; requested year unspecified, Vietnam scope pending. |

The most concrete initial year review is modern Defender 130 MY2023, Defender OCTA MY2025 in North America, and Cayenne Electric MY2026 in the US. Range Rover Sport SV has a US 2024 launch lead; confirm its technical model-year designation and edition before importing. EC Van has dated Vietnam launch evidence, which needs an explicit year basis rather than silently becoming a MY2025 row.

Custin is the official Vietnam product name for the vehicle reported as Custo. Preserve regional naming until an authoritative relationship is reviewed. Lynk & Co 03 and 03+ require separate treatment; the 07 source establishes the Chinese 07 EM-P and cannot establish Vietnamese sale or authorize a 07 GT match. Teramont X requires its own body identity. Generic BYD Song remains unresolved: the found 2025 source is Song L EV, which is not evidence to create a generic Song or map Song Plus to Song L.

The LX 570 base brochure does not substantiate Peak Edition. Keep that edition pending official importer, manufacturer or coachbuilder evidence. Accord 260 TURBO can be specification noise; require a visual distinction before adding a derivative. Similarly, Calligraphy, X-Line, GT and F SPORT need market/year evidence and a reviewed appearance difference before they become visually resolvable entries.

## Indian source queue

These 118 names have no exact match under the tested make spellings. Treat them as candidates for name and source review, not 118 confirmed missing vehicles. For example Yamaha R15 already has a YZF-R15 candidate, and Bajaj's generic PULSAR does not establish every engine size or generation. The attachments supplied no model years; obtain years from technical sheets, dated model-year manuals, or source-supported registration observations before adding records.

| Source group | Names needing review | Official discovery sources |
| --- | --- | --- |
| Maruti Suzuki | Dzire, Brezza, Ertiga, XL6, Ciaz, Alto K10, S-Presso | [Source 1](https://www.marutisuzuki.com/arena), [Source 2](https://www.nexaexperience.com/xl6), [Source 3](https://www.nexaexperience.com/nexaworld/created-inspire-elegance) |
| Hyundai | Alcazar, Verna, Exter, Aura | [Source 1](https://www.hyundai.com/in/en/click-to-buy/request-a-brochure) |
| Tata | Tiago, Tigor, Altroz, Punch, Nexon, Curvv, Harrier, Nexon EV, Punch EV, Tiago EV | [Source 1](https://cars.tatamotors.com/news-and-events.html), [Source 2](https://ev.tatamotors.com/) |
| Mahindra | Thar, Thar Roxx, XUV 3XO, XUV700, Scorpio Classic, Bolero, Bolero Neo, Marazzo, XUV400 | [Source 1](https://auto.mahindra.com/suv) |
| Toyota | Urban Cruiser Taisor, Urban Cruiser Hyryder, Innova Crysta, Innova HyCross, Land Cruiser 300 | [Source 1](https://www.toyotabharat.com/sitemap/) |
| Kia | Sonet | [Source 1](https://www.kia.com/content/dam/kia2/in/en/images/buy/download-brochure/Sonet-Brochure-Mobile.pdf) |
| Honda | Amaze, Elevate, City e:HEV | [Source 1](https://www.hondacarindia.com/download-brochure), [Source 2](https://www.hondacarindia.com/content/pdf/City-e-Hev-Brochure-Digital-12-June.pdf) |
| Volkswagen | Taigun | [Source 1](https://www.volkswagen.co.in/idhub/content/dam/onehub_pkw/importers/in/models/taigun/taigun-brochure.pdf) |
| Skoda | Slavia, Kushaq | [Source 1](https://www.skoda-auto.co.in/) |
| Renault | Triber | [Source 1](https://www.renault.co.in/cars/renault-triber/triber-price.html) |
| Nissan | Magnite | [Source 1](https://www.nissan.in/vehicles/new/nissan-magnite.html) |
| MG | Comet EV, Windsor EV, Astor, Hector, Hector Plus, Gloster | [Source 1](https://www.mgmotor.co.in/tools/brochures) |
| Jeep | Meridian | [Source 1](https://www.jeep-india.com/press-release/jeep-introduces-the-all-new-2025-meridian-with-updated-features-and-more-variants.html) |
| BYD | eMAX 7 | [Source 1](https://www.bydautoindia.com/car-dealer/electric-car-price) |
| Royal Enfield | Himalayan 450, Continental GT 650 | [Source 1](https://www.royalenfield.com/in/en/motorcycles/new-himalayan/), [Source 2](https://www.royalenfield.com/content/dam/royal-enfield/india/motorcycles/continental-gt/specifications/Royal%20Enfield%20Continental%20GT%20650.pdf) |
| Hero MotoCorp | Splendor Plus, HF Deluxe, Glamour, Xtreme 125R, Xtreme 160R, Xpulse 200, Karizma XMR | [Source 1](https://www.heromotocorp.com/en-in/blogs.html) |
| Bajaj | Pulsar 125, Pulsar 150, Pulsar N160, Pulsar NS200, Dominar 250, Dominar 400, Avenger 160 | [Source 1](https://www.bajajauto.com/bikes) |
| TVS | Apache RTR 160, Apache RTR 200 4V, Apache RR 310, Raider, Ronin | [Source 1](https://www.tvsmotor.com/our-service/user-manual) |
| Yamaha | MT-15, R15 | [Source 1](https://www.yamaha-motor-india.com/product-enquiry.html) |
| Honda Motorcycles | Shine, SP 125, Hornet 2.0, CB200X, CB350, CB650R | [Source 1](https://www.honda2wheelersindia.com/) |
| KTM | 250 Duke, RC 200 | [Source 1](https://www.ktm.com/en-in/ktm-world.html) |
| Harley-Davidson | X440 | [Source 1](https://www.harley-davidson.com/in/en/motorcycles/h-d-x.html) |
| Honda Scooters | Activa 6G, Activa 125, Dio 125 | [Source 1](https://www.honda2wheelersindia.com/scooter) |
| TVS Scooters | Jupiter, NTorq, iQube | [Source 1](https://www.tvsmotor.com/our-service/user-manual) |
| Suzuki Scooters | Access 125, Burgman Street, Avenis | [Source 1](https://www.suzukimotorcycle.co.in/all-products/scooters) |
| Yamaha Scooters | RayZR, Fascino | [Source 1](https://www.yamaha-motor-india.com/product-enquiry.html) |
| Ola Electric | S1 Pro, S1 Air, S1 X | [Source 1](https://www.olaelectric.com/brochure), [Source 2](https://cdn.olaelectric.com/brochure/s1-air.pdf) |
| Ather | 450X, 450 Apex, Rizta | [Source 1](https://media.atherenergy.com/Consolidated-DRHP.pdf), [Source 2](https://www.atherenergy.com/rizta), [Source 3](https://www.atherenergy.com/apex) |
| Vespa | VXL, SXL | [Source 1](https://vespaindia.com/vespa-vxl-3d-test) |
| Tata Commercial | Ace, Intra, 407, Ultra, Prima | [Source 1](https://smalltrucks.tatamotors.com/compare), [Source 2](https://trucks.tatamotors.com/all-trucks) |
| Ashok Leyland | Dost, Partner, Ecomet, Boss, AVTR | [Source 1](https://www.ashokleyland.com/in/trucks), [Source 2](https://www.ashokleyland.com/backend/wp-content/uploads/2025/10/Sustainability-Report-2024-25.pdf) |
| Eicher | Pro 2055, Pro 3015, Pro 6042 | [Source 1](https://www.eichertrucksandbuses.com/light-medium-duty-trucks/light-duty/pro-2055), [Source 2](https://www.eichertrucksandbuses.com/light-medium-duty-trucks/medium-duty/pro-3015), [Source 3](https://www.eichertrucksandbuses.com/heavy-duty-trucks/haulage/pro-6042) |
| Tata Buses | Starbus, LPO | [Source 1](https://busesandvans.tatamotors.com/buses) |

Current catalogs may omit discontinued vehicles such as Ciaz, S1 Air, CB200X or Marazzo. Historical manufacturer releases/manuals are needed for those; replacing the name with a successor would be incorrect. Tata's EV landing page timed out during direct retrieval. The other Tata source is a discovery lead for the passenger-car range, not proof of every requested EV year. Manufacturer catalog/annual-report publication dates are useful leads but are not model-year evidence.

The present Indian coverage under Suzuki and international sources means the old statement that Maruti has only 2005 is not a full picture of the combined catalog. Preserve existing make IDs; scope any new Maruti Suzuki alias instead of merging all Suzuki records into Maruti.

## Other source and naming gaps

- **Bajaj three-wheelers:** [current Indian lineup](https://www.bajajauto.com/three-wheelers) and [Maxima C](https://www.bajajauto.com/three-wheelers/maxima-c) provide manufacturer leads. The RE/Maxima/body/fuel variants need their own scopes; existing historical Rickshaw/Auto Rickshaw rows cannot establish current RE coverage.
- **Changan:** the local make has two normalized model names. The [Saudi distributor model page](https://changan-ksa.com/models/) search index shows a wider lineup with 2026 labels, but direct open returned 404. Treat it as an access-dependent source lead and verify live model documents before ingestion. Saudi evidence alone does not fill other markets.
- **Wuling:** the local make remains TQ WULING with one normalized model. Use [Wuling Indonesia](https://wuling.id/id/) and its [brochure entry point](https://wuling.id/id/download-brosur) to investigate model facts and the brand relationship. A make alias should preserve every published ID; it does not establish Chinese or Vietnamese model-year scope.
- **Great Wall / GWM:** generic Wingle already has 2015–2019 entries. [GWM's Wingle 5 release](https://www.gwm-global.com/news_detail-1192.html) helps distinguish the family; review make aliases without collapsing Wingle 5, Wingle 7, Cannon or unrelated brands. Do not merge the two make IDs blindly.
- **Nissan Civilian Bus:** the earlier mail identified a naming issue with Civilian. Audit an alias and vehicle type before adding another model.
- **Saudi/GCC:** the targeted mail search did not discover a new Saudi request. Existing Pegas, Sunny and Attrage investigation remains in [source-investigation.md](source-investigation.md); the previously documented GSO permission and SASO access dependencies remain separate from this mail queue.

## Render quality queue

The Vietnam attachment's 14 wrong-photo reports concern Elantra 2024; Ranger 2024 and 2019; Focus 2022; Accord 2023; BMW X1 2023, X2 2018 and X3 2024; Carnival 2025; Lexus GX 550 2025 and IS 2021; Touareg 2024; Innova 2025; and BMW 7 Series 2025. Preserve these as downstream quality reports and verify exact market/generation/body before regenerating assets. Names such as Innova and GX 550 may need family/body/engine-name review even where broader catalog candidates exist. The raw customer rows stay private.

IONIQ 5 and IONIQ 6 2024, Civic 2025, Sorento 2022, Sportage 2025, Corolla Cross 2025, Geely EX5 2025 and Ford Territory already have global catalog entries. Their no-photo reports require market identity and downstream asset checks; they are not grounds to duplicate generic models. Focus 2018 and Ranger 2019 likewise require precise candidate checks. No runtime catalog addition alone resolves an incorrect photo.

## Implementation sequence and acceptance

1. **Close the Brazil adoption gap.** Run the 23 requested names through the local public API and the deployed catalog using exact driver years. Confirm the deployed dependency includes SENATRAN. Preserve actual type filters: Spin is MPV (7) and Saveiro is Truck (3). Separate year-of-manufacture from the document's model year. Then check downstream rendering for all 11 originally missing families; communicate availability only after those checks. An ETA cannot be inferred from a local snapshot.
2. **Review focused regional facts.** Start with EC Van, modern Defender 130, Custin, Viloran, Teramont X and Lynk & Co 03/05/06/09. Retrieve a year-specific official document for each. Keep 07 and generic Song pending exact market/name evidence. Add fully verified year/make/model/type/market/URL/rationale rows to `data/evidence/manufacturer-reviewed.json`, then refresh its generated source. Existing register sources should be refreshed when they already contain the requested fact rather than replaced by hand-entered ranges.
3. **Add distinct identities.** Use `data/identity/catalog.json` for G60 generations, Defender 130 generations, OCTA, Sport SV, Cayenne Electric and verified visual trims. Keep body, generation and facelift separate. Add negative resolver fixtures for OCTA → Defender, SV → SVR/base Sport, Electric → ICE/PHEV Cayenne, modern → old Defender 130, 03 → 03+, and unverified trim/year substitutions. No implicit image sharing or nearest-year fallback.
4. **Expand India in batches.** Start with the highest-demand passenger models, then motorcycles/scooters and commercial vehicles. Review spelling candidates before allocating IDs. Generalize `scripts/import-reviewed-models.ts` to emit the full supported type table (currently it emits only 2, 3 and 7), including Motorcycle (1), Bus (5) and Auto Rickshaw (10001, as defined in the existing catalog). Use an explicit year-basis convention for current catalogs; do not manufacture model-year histories from launch dates or the review date. Update manufacturer metadata regions when reviewed additions expand beyond Saudi Arabia and the US.
5. **Verify compatibility and publish through the usual release process.** Run `npm run refresh:reviewed`, `npm run build:data`, relevant importer/resolver tests, `npm test`, `npm run typecheck`, `npm run build`, `npm run check:compatibility -- <prior-release-ref>` and `npm run replay`. Preserve typed selections and the first unfiltered selection; compatibility pins require actual prior-release evidence. Bump the minor version only when data additions are ready. Validate the deployed catalog and representative renders after downstream dependency adoption.

Acceptance is exact sourced coverage for the reviewed market/year/type, unchanged published IDs, no unsafe derivative/generation substitutions, and separate downstream render verification. Manufacturer pages supply factual product evidence; they do not grant an open bulk-data license or rights to copy their prose and imagery. Review source reuse before any bulk importer. The candidate inventory deliberately does not feed the build.

Self-hosting, subscription cancellation and any perpetual-license agreement are commercial decisions outside this catalog plan. No customer reply or roadmap promise is sent by this audit.
