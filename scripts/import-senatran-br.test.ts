import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { afterEach, describe, expect, it } from "vitest";
import { buildSourceCatalog, mapRegistration } from "./import-senatran-br";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const FLEET = [
  "UF;Município;Marca Modelo;Ano Fabricação Veículo CRV;Qtd. Veículos",
  "ACRE;RIO BRANCO;CHEV/ONIX 10MT LT2;2022; 6.0",
  "SAO PAULO;SAO PAULO;CHEVROLET/ONIX 1.0MT LT;2022; 5.0",
  "SAO PAULO;SAO PAULO;CHEV/ONIX PLUS 10TAT PR2;2022; 30.0",
  "SAO PAULO;CAMPINAS;HONDA/CG 160 FAN;2024; 12.0",
  "SAO PAULO;CAMPINAS;HONDA/CG150 TITAN KS;2010; 9.0",
  "SAO PAULO;CAMPINAS;VW/NOVO GOL 1.0;1989; 50.0",
  "SAO PAULO;CAMPINAS;VW/GOL 1.0;Sem Informação; 50.0",
  "BAHIA;SALVADOR;I/TOYOTA HILUX SWSRXA4FD;2015; 10.0",
  "BAHIA;SALVADOR;SR/RANDON SR CA;2015; 100.0",
  "BAHIA;SALVADOR;VW/24.280 CRM 6X2;2015; 100.0",
].join("\n");

function temporaryFile(name: string, content: string | Buffer): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "senatran-br-test-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/** A single-file ZIP archive like the ones SENATRAN publishes. */
function zipArchive(name: string, content: string): Buffer {
  const data = Buffer.from(content);
  const compressed = zlib.deflateRawSync(data);
  const fileName = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(local.length + fileName.length + compressed.length, 16);
  return Buffer.concat([local, fileName, compressed, central, fileName, end]);
}

describe("SENATRAN RENAVAM importer", () => {
  it("maps registered make/model strings to reviewed model families", () => {
    const model = (value: string) => {
      const mapped = mapRegistration(value);
      return mapped && `${mapped.makeName} ${mapped.modelName} ${mapped.vehicleTypeId}`;
    };
    expect(model("CHEV/ONIX 10MT LT2")).toBe("CHEVROLET ONIX 2");
    expect(model("CHEV/ONIX PLUS 10TAT PR2")).toBe("CHEVROLET ONIX PLUS 2");
    expect(model("GM/CELTA 2P LIFE")).toBe("CHEVROLET CELTA 2");
    expect(model("VW/NOVO GOL 1.0")).toBe("VOLKSWAGEN GOL 2");
    expect(model("TOYOTA/CCROSS XRE 20")).toBe("TOYOTA COROLLA CROSS 7");
    expect(model("I/TOYOTA HILUX SWSRXA4FD")).toBe("TOYOTA HILUX SW4 7");
    expect(model("I/TOYOTA HILUX CD4X4 SRV")).toBe("TOYOTA HILUX 3");
    expect(model("HYUNDAI/HB20S10TA LIMITE")).toBe("HYUNDAI HB20S 2");
    expect(model("HONDA/CG150 FAN ESDI")).toBe("HONDA CG 1");
    expect(model("HONDA/CBX 250 TWISTER")).toBe("HONDA CBX 1");
    expect(model("HONDA/NXR160 BROS ESDD")).toBe("HONDA BROS 1");
    expect(model("JTA/SUZUKI EN125 YES")).toBe("SUZUKI EN125 1");
    expect(model("I/ROYAL ENFIELD HIMALAYA")).toBe("ROYAL ENFIELD HIMALAYAN 1");
    // "TIGGO 2.0" is the original Tiggo with a 2.0 engine, not the Tiggo 2.
    expect(model("I/CHERY TIGGO 2.0")).toBe("CHERY TIGGO 7");
    expect(model("CHERY/TIGGO 2 1.5 LOOK")).toBe("CHERY TIGGO 2 7");
    // Heavy trucks, bus bodies, and trailers are not mapped.
    expect(model("VW/24.280 CRM 6X2")).toBeUndefined();
    expect(model("M.BENZ/MPOLO TORINO U")).toBeUndefined();
    expect(model("SR/RANDON SR CA")).toBeUndefined();
  });

  it("adds counts up nationally and keeps make/model/years with enough vehicles", async () => {
    const catalog = await buildSourceCatalog(temporaryFile("frota.txt", FLEET), {
      endYear: 2026,
      retrievedAt: "2026-10-02",
    });

    expect(catalog.metadata.id).toBe("senatran-br-renavam");
    expect(catalog.metadata.retrievedAt).toBe("2026-10-02");
    expect(catalog.makes.map((make) => make.make_name)).toEqual(["CHEVROLET", "HONDA", "TOYOTA"]);
    expect(catalog.vehicleTypes.map((type) => type.vehicle_type_id)).toEqual([1, 2, 7]);
    expect(
      catalog.models.map(([year, , , nameIndex, typeId]) => `${year} ${catalog.modelNames[nameIndex]} ${typeId}`),
    ).toEqual(["2015 HILUX SW4 7", "2022 ONIX 2", "2022 ONIX PLUS 2", "2024 CG 1"]);
  });

  it("reads the published ZIP archive", async () => {
    const archive = temporaryFile("frota.zip", zipArchive("I_Frota.TXT", FLEET));
    const catalog = await buildSourceCatalog(archive, { endYear: 2026, minCount: 1 });
    expect(catalog.models).toHaveLength(5);
    expect(catalog.modelNames).toContain("CG");
  });
});
