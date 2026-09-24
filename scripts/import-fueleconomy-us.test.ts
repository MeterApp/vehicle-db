import { expect, test } from "vitest";
import { parseCsv, buildSourceCatalog } from "./import-fueleconomy-us";
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
