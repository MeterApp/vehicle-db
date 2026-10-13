# Broad manufacturer catalogs in 2.17.0

Observed October 13, 2026 against v2.16.0. This release replaces individual manual maintenance for the Changan, Wuling and Bajaj three-wheeler regional additions with one refresh workflow. It adds 73 selections and two makes, CHANGAN NEVO and BAOJUN. The 23 original regional facts moved to `data/evidence/manufacturer-catalogs/legacy-regional.json`, and are included in the new sources. The old generic manufacturer snapshots retain those records and their published source filters; unrelated Atul, Hyundai and reviewed facts still have useful independent coverage and are retained. Removing the old source IDs would break consumers without improving coverage.

## Sales catalogs

| Official catalog | Imported facts | Scope |
| --- | --- | --- |
| [Changan model selector](https://www.changan.com.cn/dealer_inquiry) | Public `/v2/car-model/index` and `/v2/NewIndex/getCarModelsWithType` feeds; 43 active source products mapped to reviewed families | China; legacy Saudi and Mexican facts retained |
| [SGMW sales catalog](https://www.sgmw.com.cn/mobile/wulingRedBadge), [silver badge](https://www.sgmw.com.cn/mobile/wulingSilverBadge), [Baojun](https://www.sgmw.com.cn/mobile/baojun) | Inert server-rendered Nuxt data; require `isOnSale=1`, `enableStatus=1`, `isDelete=0`; exact reviewed name/body translations | China; legacy Indonesian Wuling facts retained |
| [Bajaj global directory](https://www.bajajauto.com/global) and country three-wheeler catalogs | Official product links from the Indian catalog and accessible country catalogs using both `/three-wheelers` and `/threewheelersandqute` paths | India and 38 export markets with product evidence |

There are five new snapshots: Changan catalog/model-years, SGMW catalog/model-years, and Bajaj catalog. Catalog year means the observed current sales catalog, not factory model year. Chinese model-year records require an explicit year/款 label in the marketed name or model configuration. Approval dates, upload timestamps and launch years are never promoted into model years. Only individually observed/labeled years are included, with no interpolated histories.

Changan preserves generation and specification names in the evidence while the reviewed mappings describe catalog families. NEVO remains a separate make, while Lumin remains CHANGAN. SGMW keeps Wuling and Baojun separate and keeps Indonesian BinguoEV separate from Chinese Binguo. Wuling configuration tables explicitly support passenger versus sealed-window two-seat panel vans. Those body derivatives remain separate; pickup/truck families use type 3. No generation, trim, regional visual equivalence or asset-sharing rules are introduced. Family names do not select a specific overlapping generation.

Bajaj preserves regional families such as RE 4S, Maxima Cargo, Torito XL, Torito 2T UG and Torito CROM. Reviewed fuel/battery options do not create extra models. WEGO P50/P70/P90 passenger families and C90 cargo stay separate. Qute is a four-wheel quadricycle under Other Vehicle, not Auto Rickshaw. Country URL channels establish the observed market; template titles are not used to map countries. The directory's remaining countries with unavailable catalogs supply no invented records. All fetch attempts and original URLs are recorded in `bajaj.json`; availability is a per-market fact, not a claim of complete worldwide coverage.

## Manuals and regulatory evidence

[Changan's technical archive](https://ats.changan.com.cn/jsp/web/newslist.jsp?noticeType=10021004) returned 5,638 entries, of which 1,848 are named repair/owner/service manual entries (636 distinct titles). The complete named-manual index is retained in `changan-manuals.json`. [SGMW's owner-guide index](https://www.sgmw.com.cn/mobile/carGuide) supplies 74 entries in `sgmw-owner-guides.json`. These indexes include historical/discontinued vehicles and source brand inconsistencies. They are evidence/discovery only, not sales-year datasets. No manufacturer PDF prose, photographs or full documents are bundled.

The [MIIT/EIDC September 2025 notice](https://www.miit-eidc.org.cn/art/2025/9/30/art_1657_11737.html) says the old query systems were replaced and historical data migrated. The previously cited legacy URL is obsolete. The [replacement query system](https://service.miit-eidc.org.cn/miitxxgk/gonggao/xxgk/index) is discoverable in web search, but direct requests to both old and new endpoints returned HTTP 403 on October 13. No verified public bulk API, reusable bulk download or technical-code-to-marketing-name mapping was obtained. No speculative MIIT importer or approval-derived model years are shipped. Approval evidence cannot replace market/model-year evidence by itself.

Manufacturer catalogs are public factual evidence, not licensed open bulk datasets. This importer retains product names, identity/body/year facts, source URLs and response hashes, with attribution; it does not redistribute marketing copy, images, prices, customer data, staff names or tokens. Changan's public anonymous token handshake is the one used by its own website and is neither logged nor cached. Regulatory data reuse remains unverified.

## Refresh and review

```sh
npm run refresh:manufacturer-catalogs
npm run refresh:manufacturer-catalogs -- --brand sgmw
npm run refresh:manufacturer-catalogs -- --offline --date 2026-10-13 --cache-dir .cache/manufacturer-catalogs
npm run refresh:reviewed
npm run build:data
npm run check:compatibility -- v2.16.0
npm run replay
```

Network refresh stores raw responses only in ignored `.cache/`. Offline refresh requires the original observation date. Exact translation/body mappings live in `data/evidence/manufacturer-catalog-mappings.json`; newly discovered unmapped products are recorded as pending instead of guessed. Evidence output includes original names, source record IDs, URLs, markets and year bases. Compiled sources deduplicate equivalent catalog tuples but keep the complete regional observations in evidence. Refreshes retain published selections, including products subsequently removed from a live catalog.

Validation covers model-year versus catalog-year semantics, retired sales entries versus recently updated manuals, country scoping, preserved IDs, cargo/passenger/quadricycle types and source deduplication. Run the full test suite, typecheck, build, deterministic regeneration, published-selection compatibility and resolution replay before release. These changes expand the catalog; downstream dependency adoption and visual identity verification remain separate.
