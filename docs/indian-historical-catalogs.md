# Broad Indian historical catalog review

The historical refresh consolidates dated manufacturer portfolios and sales reports into the existing Indian passenger and two-wheeler source IDs. It adds no new source IDs. Reviewed names, page numbers and date proofs are in `data/evidence/indian-history-mappings.json`; retrieval hashes and per-record rationale stay in `data/evidence/manufacturer-catalogs/`. Calendar-year presence establishes a catalog selection, not a factory model year, appearance or generation.

| Accepted official source | Evidence used |
|---|---|
| [Mahindra June 2024 monthly report](https://www.mahindra.com/sites/default/files/2024-07/MonthlyReport11072024.pdf) | Individual positive domestic sales in June 2023/2024, including Thar, Marazzo and XUV700. Production and exports do not substitute for sales. Combined XUV3XO/XUV400 rows are excluded. |
| [Honda Cars June 2022 report](https://www.hondacarindia.com/pressreleaseattachment/HCIL%20June%2722%20Sales%20Release.pdf) | Explicit 2022 product range, including City e:HEV. |
| [MG February 2024 range](https://www.mgmotor.co.in/content/dam/mgmotor/documents/mg-dsc-pdf-0344.pdf) and [January 2023 range](https://www.mgmotor.co.in/content/dam/mgmotor/documents/mg-dc-pdf-0306.pdf) | Dated price tables, including Gloster and separately named Hector/Hector Plus. Seating and trim lists do not establish shared appearances. |
| [Yamaha 2024 briefing](https://global.yamaha-motor.com/ir/library/report/pdf/2024/dialogue_en_01.pdf) | Indian Yamaha Products table: YZF-R15, MT-15, FZ15, FZ-X, AEROX, Ray ZR and Fascino. Generic family names are preserved alongside specific current products. |
| [Honda February 2020 results](https://global.honda/en/investors/library/financialresult/main/03/teaserItems3/02/linkList/00/link/FY202003_3Q_financial_presentation_e.pdf) | Explicit Indian Activa 6G and SP125 products on the dated product page. No histories inferred from the financial-period title. |
| [Honda February 18, 2025 news portfolio](https://www.honda2wheelersindia.com/news) | Bounded dated article gives regular and premium models, including CB200X. Current navigation outside the article is excluded. |
| [Ola August 2024 quarterly release](https://cdn.olaelectric.com/sites/evdp/pages/investor/fy25_earninig_segmentation.pdf) | Explicit existing S1 Pro, S1 Air and S1 X+ portfolio for 2024. The plus badge is retained. |
| [Maruti January 2024 sales](https://marutistoragenew.blob.core.windows.net/msilintiwebpdf/Press_Release_Maruti_Suzuki_sales_in_January_2024.pdf) | Individual Ciaz calendar-month sales: January 2023 and 2024. Manually reviewed in the web PDF reader and retained in the existing reviewed catalog source. Direct retrieval returned HTML, so this source is not claimed as an automated PDF refresh. Fiscal-year totals and combined groups are excluded. |
| [Bajaj current motorcycle catalog](https://www.bajajauto.com/bikes) | Exact Pulsar 125 product selector in the existing current-catalog importer. |

## Remaining labels

No additional small source was introduced to force these labels into coverage:

- Xpulse 200, Avenger 160, R15, Shine and CB650R: current derivatives, displacement-specific names or technical registration codes need an official scoped mapping. Xpulse 200 4V, Avenger 160 Street, R15M and Shine 100/125 are not interchangeable by suffix stripping. The Yamaha report establishes YZF-R15, but does not prove that an unqualified R15 request identifies one derivative or appearance.
- Vespa VXL and SXL: displacement and edition suffixes remain significant; an edition mention does not establish the unqualified family for a dated year.
- Tata 407/LPO and Ashok Leyland Dost/Partner/Ecomet/AVTR: current specific configurations already exist. The [Ashok Leyland FY 2024–25 annual report](https://www.ashokleyland.com/backend/wp-content/uploads/2025/07/Annual-Report-FY-2024-25.pdf) was reviewed, but fiscal-period launches, AVTR platform references and Ecomet STAR variants do not establish a calendar-year generic body selection. LPO is a chassis designation and cannot select a bus exterior.

These candidates remain unresolved until a broad dated catalog or an explicit manufacturer mapping supports the exact name and scope. Existing variants continue to be available under their full published names.
