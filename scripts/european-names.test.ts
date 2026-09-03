import { describe, expect, it } from "vitest";
import { normalizeMakeName, normalizeModelName, splitSubBrand } from "./european-names";

describe("European registry name normalization", () => {
  it("reduces reported make strings to brand names", () => {
    const cases: [string, string | undefined][] = [
      ["VOLKSWAGEN, VW", "VOLKSWAGEN"],
      ["VOLKSWAGEN  VW", "VOLKSWAGEN"],
      ["VOLKSWAGENVWVW", "VOLKSWAGEN"],
      ["VW", "VOLKSWAGEN"],
      ["VOLKSWAGEN AG BERLINER RI NG 2 D-38440 WOLFSBURG\n", "VOLKSWAGEN"],
      ["MERCEDES BENZ", "MERCEDES-BENZ"],
      ["Mercedes.Benz", "MERCEDES-BENZ"],
      ["MERCEDES-AMG", "MERCEDES-BENZ"],
      ["MERCEDES BENZ AG\nDE-70372 STUTTGART\nGERMANY", "MERCEDES-BENZ"],
      ["ŠKODA", "SKODA"],
      ["?KODA", "SKODA"],
      ["A¨KODA", "SKODA"],
      ["CITRO╦N", "CITROEN"],
      ["CITROENDS", "CITROEN"],
      ["OPELVAUXHALL", "OPEL"],
      ["G.M.C.", "GMC"],
      ["M.A.N.", "MAN"],
      ["IVECO - MULTITEL", "IVECO"],
      ["RENAULT/IZOTERMY TIM", "RENAULT"],
      ["MERCEDES SPRINTER/KEGGER", "MERCEDES-BENZ"],
      ["BURSTNER GMBH", "BURSTNER"],
      ["SKODA AUTO A.S\nTR. VACLAVA KLEMENTA 869", "SKODA"],
      ["CITROËN", "CITROEN"],
      ["CITROÃ‹N", "CITROEN"],
      ["CITROEN / DS", "CITROEN"],
      ["Opel / Vauxhall", "OPEL"],
      ["OPEL,  VAUXHALL", "OPEL"],
      ["FIAT - INNOCENTI", "FIAT"],
      ["FIAT/CAPRON", "FIAT"],
      ["FORD-CNG-TECHNIK", "FORD"],
      ["FORD (D)", "FORD"],
      ["FORD WERKE GMBH", "FORD"],
      ["FORD TRANSIT/FRANK-CARS", "FORD"],
      ["MITSUBISHI MOTORS CORPORATION", "MITSUBISHI"],
      ["MITSUBISHI (J)", "MITSUBISHI"],
      ["KIA SLOVAKIA S.R.O..\nSV.JANA NEPOMUCKEHO", "KIA"],
      ["Hyundai Motor (CZ)", "HYUNDAI"],
      ["HYUNDAI. GENESIS", "HYUNDAI"],
      ["TOYOTA MOTOR EUROPE NV/SA\nAVENUE DU BOURGET 60", "TOYOTA"],
      ["BAYERISCHE MOTOREN WERKE AG. DE-80788 MUNCHEN", "BMW"],
      ["B M W", "BMW"],
      ["BMW,MINI", "BMW"],
      ["BMW I", "BMW"],
      ["AUDI AG", "AUDI"],
      ["AUTOMOBILES PEUGEOT", "PEUGEOT"],
      ["AUTOMOBILI LAMBORGHINI S.P.A.", "LAMBORGHINI"],
      ["JAGUAR CARS LIMITED", "JAGUAR"],
      ["CATERHAM CARS LTD.", "CATERHAM"],
      ["DR MOTOR COMPANY", "DR"],
      ["GREAT WALL MOTOR CO. LTD.", "GREAT WALL"],
      ["LYNK & CO", "LYNK&CO"],
      ["DFSK. SERES. SOKON", "DFSK"],
      ["SSANGYONG. KG MOBILITY", "SSANGYONG"],
      ["Porsche 2020000", "PORSCHE"],
      ["TESLA MOTORS", "TESLA"],
      ["BYD", "BYD"],
      ["ALFA  ROMEO", "ALFA ROMEO"],
      ["LAND ROVER", "LAND ROVER"],
      ["JAGUAR LAND ROVER LIMITED", undefined],
      ["PSA AUTOMOBILES SA", undefined],
      ["124", undefined],
      ["", undefined],
      [" ", undefined],
    ];
    for (const [input, expected] of cases) {
      expect(normalizeMakeName(input), input).toBe(expected);
    }
    expect(normalizeMakeName(null)).toBeUndefined();
  });

  it("drops engine and power suffixes from commercial names", () => {
    expect(normalizeModelName("T-CROSS / 1.0 / TSI AUT.", "VOLKSWAGEN")).toBe("T-CROSS");
    expect(normalizeModelName("ID.4 PRO 150 KW / /", "VOLKSWAGEN")).toBe("ID.4 PRO");
    expect(normalizeModelName("ID.3 PRO S 150KW", "VOLKSWAGEN")).toBe("ID.3 PRO S");
    expect(normalizeModelName("PASSAT / VARIANT 2.0 / TDI", "VOLKSWAGEN")).toBe("PASSAT");
    expect(normalizeModelName("308 5P ACTIVE PURETECH 130 S&S 6 VEL. MAN", "PEUGEOT")).toBe("308");
    expect(normalizeModelName("NUEVO 2008 ALLURE", "PEUGEOT")).toBe("2008 ALLURE");
    expect(normalizeModelName("AMAROK 2.0", "VOLKSWAGEN")).toBe("AMAROK");
    expect(normalizeModelName("E-2008 GT ELECTRICO 136 (100 KW)", "PEUGEOT")).toBe("E-2008 GT");
    expect(normalizeModelName("RIFTER GT BUSINESS (N1)", "PEUGEOT")).toBe("RIFTER GT BUSINESS");
    expect(normalizeModelName("MODEL 3", "TESLA")).toBe("MODEL 3");
    expect(normalizeModelName("3008 ALLURE HYBRID 136", "PEUGEOT")).toBe("3008 ALLURE HYBRID");
    expect(normalizeModelName("PARTNER STANDARD 600KG", "PEUGEOT")).toBe("PARTNER STANDARD");
    expect(normalizeModelName("MASTER LM35", "RENAULT")).toBe("MASTER LM35");
    expect(normalizeModelName("911", "PORSCHE")).toBe("911");
    expect(normalizeModelName("SERIE 3", "BMW")).toBe("SERIE 3");
    expect(normalizeModelName("SEAL U", "BYD")).toBe("SEAL U");
    expect(normalizeModelName("BMW X1", "BMW")).toBe("X1");
    expect(normalizeModelName("Atto 3", "BYD")).toBe("ATTO 3");
    expect(normalizeModelName("", "BYD")).toBeUndefined();
    expect(normalizeModelName("N/A", "BYD")).toBeUndefined();
    expect(normalizeModelName("BYD", "BYD")).toBeUndefined();
    expect(normalizeModelName(null, "BYD")).toBeUndefined();
  });

  it("splits sub-brands reported under the parent make", () => {
    expect(splitSubBrand("SEAT", "CUPRA FORMENTOR")).toEqual(["CUPRA", "FORMENTOR"]);
    expect(splitSubBrand("FIAT", "ABARTH 595")).toEqual(["ABARTH", "595"]);
    expect(splitSubBrand("CITROEN", "DS 3 CROSSBACK")).toEqual(["DS", "3 CROSSBACK"]);
    expect(splitSubBrand("SEAT", "LEON")).toEqual(["SEAT", "LEON"]);
    expect(splitSubBrand("CITROEN", "DS3")).toEqual(["CITROEN", "DS3"]);
  });
});
