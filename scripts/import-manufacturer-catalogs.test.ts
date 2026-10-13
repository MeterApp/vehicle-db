import { expect, test } from "vitest";
import { compileObservations, explicitModelYears, nuxtObjects, observedRecords, parseChanganManuals, parseChanganProducts, parseSgmwProducts, productLinks } from "./import-manufacturer-catalogs";
const mapping = {make:"WULING",makeId:5142354878,model:"Example",vehicleTypeId:2};
const metadata = {id:"fixture",name:"Fixture",url:"https://example.com",region:"CN",license:"Fixture",retrievedAt:"2026-10-13",description:"Fixture",yearBasis:"catalog-year" as const};

test("model years require explicit marketed labels, not dates or numeric model names", () => {
  expect(explicitModelYears(["2025款 高能版", "五菱星光2025款", "2026款 第四代CS75PLUS", "2024轻享款 203km", "2026-07-13", "星光730", "2026 launch", "2026年度"])).toEqual([2024,2025,2026]);
  const rows = observedRecords(mapping,"Example","1","https://example.com","CN","2026-10-13",[],"Observed catalog");
  expect(rows.map(r=>[r.year,r.yearBasis])).toEqual([[2026,"catalog-year"]]);
  expect(()=>observedRecords(mapping,"Example","1","https://example.com","CN","2026-02-30",[],"Invalid date")).toThrow(/date/);
});

test("regional evidence aggregates without making duplicate selections or replacing IDs", () => {
  const cn = observedRecords(mapping,"Example","1","https://example.com","CN","2026-10-13",[],"Observed");
  const id = observedRecords(mapping,"Example","2","https://example.com","ID","2026-10-13",[],"Observed");
  const first = compileObservations(cn,metadata), combined = compileObservations([...id,...cn,...cn],metadata);
  expect(combined.models).toEqual(first.models);
});

test("Changan model/configuration feeds keep status and years distinct", () => {
  const result = parseChanganProducts({code:0,data:[{car_model_id:"1",car_model_name:"2026款UNI-Z",car_model_status:"1",car_model_url:"/car/uni-z"}]},
    {code:0,data:[{carModels:[{car_model_id:"1",children:[{car_type_name:"2025款 标准型"}]}]}]});
  expect(result[0]).toMatchObject({id:"1",status:"1",url:"https://www.changan.com.cn/car/uni-z",trimLabels:["2025款 标准型"]});
  expect(()=>parseChanganProducts({code:401,data:[]},{code:0,data:[]})).toThrow(/response/);
});

test("SGMW pointer tables retain explicit on-sale flags and ignore document metadata", () => {
  const table = [{id:1,brand:2,marketNaming:3,vehicleSeries:3,isOnSale:4,enableStatus:4,isDelete:5,updatedAt:6},
    99,"五菱","五菱星光2025款",1,0,"2026-07-13"];
  const html = `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(table)}</script>`;
  expect(parseSgmwProducts(html)[0]).toMatchObject({id:99,marketNaming:"五菱星光2025款",isOnSale:1,enableStatus:1,isDelete:0,configLabels:[]});
  expect(()=>nuxtObjects('<script id="__NUXT_DATA__">[{"id":999}]</script>')).toThrow(/bounds/);
  expect(()=>nuxtObjects("A challenge page")).toThrow(/Missing/);
});

test("Bajaj country extraction excludes other countries, motorcycles and external hosts", () => {
  const html = ['https://www.bajajauto.com/en-np/three-wheelers/re-4s-petrol',
    'https://www.bajajauto.com/en-np/threewheelersandqute/maxima-cargo',
    'https://www.bajajauto.com/en-tz/three-wheelers/re-4s-petrol',
    'https://www.bajajauto.com/en-np/three-wheelers/',
    'https://www.bajajauto.com/en-np/motorcycles/pulsar',
    'https://example.com/en-np/three-wheelers/re-4s-petrol'].map(u=>`<a href="${u}">Explore</a>`).join("");
  expect(productLinks(html,"NP")).toEqual(['https://www.bajajauto.com/en-np/three-wheelers/re-4s-petrol','https://www.bajajauto.com/en-np/threewheelersandqute/maxima-cargo']);
});

test("manual discovery accepts text titles and rejects nested HTML without sanitizing it", () => {
  const html = '<a href="/jsp/web/news.jsp?noticeId=1">CS75使用说明书文档更新</a>' +
    '<a href="/jsp/web/news.jsp?noticeId=2"><script>alert(1)</script>使用说明书</a>' +
    '<a href="/jsp/web/news.jsp?noticeId=3"><script使用说明书</a>';
  expect(parseChanganManuals(html,"https://ats.changan.com.cn")).toEqual({totalArchiveEntries:1,
    guides:[{title:"CS75使用说明书文档更新",url:"https://ats.changan.com.cn/jsp/web/news.jsp?noticeId=1"}]});
});
