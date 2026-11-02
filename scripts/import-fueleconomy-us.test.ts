import { expect, test } from "vitest";
import { parseCsv, buildSourceCatalog, bodyDerivativeRows, loadBodyDerivatives, type DerivativeObservation } from "./import-fueleconomy-us";
test("bulk CSV handles quoted commas, newlines, escaped quotes and rejects broken feeds",()=>{
  const rows=parseCsv('id,make,model,year,VClass\r\n1,Test,"Car, \"\"S\"\"\nLong",2025,Small Cars\r\n');
  expect(rows[0].model).toBe('Car, "S"\nLong');
  expect(()=>parseCsv('id,make\n1,Test')).toThrow(/Missing EPA/);
  expect(()=>parseCsv('id,make,model,year,VClass\n1,Test,"')).toThrow(/Unterminated/);
});
test("configuration deduplication retains EV and body distinctions",()=>{
  const base={id:"1",make:"Test",model:"Car",year:"2025",VClass:"Small Cars"};
  const result=buildSourceCatalog([base,{...base,id:"2"},{...base,id:"3",model:"Car EV"},{...base,id:"4",model:"Car Convertible"}],"2026-09-24");
  expect(result.models).toHaveLength(3);expect(result.modelNames).toEqual(["Car","Car Convertible","Car EV"]);
  expect(()=>buildSourceCatalog([{...base,VClass:"New Unmapped Category"}],"2026-09-24")).toThrow(/Unmapped/);
});
test("reviewed AMG separator mapping does not erase distinct bodies",()=>{
  const row={id:"1",make:"Mercedes-Benz",model:"AMG G63",year:"2025",VClass:"Standard Sport Utility Vehicle 4WD"};
  const result=buildSourceCatalog([row,{...row,id:"2",model:"AMG G63 Coupe"}],"2026-09-24");
  expect(result.modelNames).toEqual(["AMG G 63","AMG G63 Coupe"]);
});
test("reviewed body derivatives publish exact EPA estate names only, in every model year",()=>{
  const row={id:"1",make:"Cadillac",model:"CTS Wagon",year:"2010",VClass:"Small Station Wagons"};
  const rows=[row,{...row,id:"2",model:"CTS Wagon AWD",year:"2014"},{...row,id:"3",model:"CTS",VClass:"Midsize Cars"},{...row,id:"4",model:"CTS Wagonette"}];
  const observations:DerivativeObservation[]=[];
  const out=bodyDerivativeRows(rows,[{make:"Cadillac",model:"CTS Wagon",bodyStyle:"Estate",epaModels:["CTS Wagon","CTS Wagon AWD"]}],observations);
  expect(out.map(r=>[r.id,r.model,r.year])).toEqual([["1","CTS Wagon","2010"],["2","CTS Wagon","2014"]]);
  expect(observations).toEqual([{make:"Cadillac",model:"CTS Wagon",years:[2010,2014],epaIds:["1","2"]}]);
  const catalog=buildSourceCatalog(out,"2026-10-23");
  expect(catalog.modelNames).toEqual(["CTS Wagon"]);expect(catalog.models.map(m=>m[0])).toEqual([2010,2014]);
  expect(()=>bodyDerivativeRows(rows,[{make:"Cadillac",model:"Missing",bodyStyle:"Estate",epaModels:["Nope"]}])).toThrow(/matched no/);
});
test("reviewed body derivative mappings never map mixed-body EPA names",()=>{
  const names=loadBodyDerivatives().flatMap(d=>d.epaModels);
  expect(names.some(n=>/Impreza|Outback/.test(n))).toBe(false);
  for(const d of loadBodyDerivatives()) expect(["Estate","Convertible"]).toContain(d.bodyStyle);
});
test("reviewed convertible derivatives publish each exact EPA convertible name under that same name",()=>{
  const convertibles=loadBodyDerivatives().filter(d=>d.bodyStyle==="Convertible");
  expect(convertibles.length).toBeGreaterThan(0);
  for(const d of convertibles){expect(d.epaModels).toEqual([d.model]);expect(d.model).toMatch(/ Convertible$/);}
  const rows=[{id:"1",make:"BMW",model:"230i Convertible",year:"2019",VClass:"Subcompact Cars"},{id:"2",make:"BMW",model:"230i xDrive Convertible",year:"2019",VClass:"Subcompact Cars"},{id:"3",make:"BMW",model:"230i Coupe",year:"2019",VClass:"Subcompact Cars"}];
  const out=bodyDerivativeRows(rows,[{make:"BMW",model:"230i Convertible",bodyStyle:"Convertible",epaModels:["230i Convertible"]}]);
  expect(out.map(r=>[r.id,r.model])).toEqual([["1","230i Convertible"]]);
});
