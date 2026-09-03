/**
 * Shared normalization for European registration sources (EEA, RDW).
 *
 * Registries report the make and commercial name inconsistently: multi-brand
 * strings, legal entities, postal addresses, mojibake, trim levels, and engine
 * or power suffixes all appear. These helpers reduce them to a brand and a
 * model name comparable with the other catalog sources.
 */
import { normalizeName } from "./catalog-types";

/**
 * Member states report the make field inconsistently: multi-brand strings,
 * legal entities, postal addresses, and mojibake all appear. Exact aliases
 * cover the frequent oddities that the generic rules cannot repair.
 */
const MAKE_ALIASES = new Map<string, string>([
  ["?KODA", "SKODA"],
  ["A.U.D.I.", "AUDI"],
  ["ALFA", "ALFA ROMEO"],
  ["ALFAROMEO", "ALFA ROMEO"],
  ["ALFAROMEOO", "ALFA ROMEO"],
  ["ASTON-MARTIN", "ASTON MARTIN"],
  ["B M W", "BMW"],
  ["B.M.W.", "BMW"],
  ["BAYERISCHE MOTOREN WERKE", "BMW"],
  ["BMW ALPINA", "ALPINA"],
  ["BMW BRILLIANCE", "BMW"],
  ["BMW I", "BMW"],
  ["BMW M", "BMW"],
  ["CHERVOLET", "CHEVROLET"],
  ["EGO", "E.GO"],
  ["FIAT GROUP", "FIAT"],
  ["FORD TRANSIT", "FORD"],
  ["FORD WERKE", "FORD"],
  ["FORD W", "FORD"],
  ["FORD D", "FORD"],
  ["FORD USA", "FORD"],
  ["FORD-WERKE", "FORD"],
  ["FUJI HEAVY INDUSTRIES", "SUBARU"],
  ["G.M.C.", "GMC"],
  ["GENERAL MOTORS-GMC", "GMC"],
  ["M.A.N.", "MAN"],
  ["HYUNDAI ASSAN", "HYUNDAI"],
  ["HYUNDAI GENESIS", "HYUNDAI"],
  ["JAGUAR CARS", "JAGUAR"],
  ["KG MOBILITY", "KGM"],
  ["LANDROVER", "LAND ROVER"],
  ["LYNK & CO", "LYNK&CO"],
  ["LYNK AND CO", "LYNK&CO"],
  ["MAGYAR SUZUKI", "SUZUKI"],
  ["MC LAREN", "MCLAREN"],
  ["MC LOUIS", "MCLOUIS"],
  ["MCC SMART", "SMART"],
  ["MERCEDES AMG", "MERCEDES-BENZ"],
  ["MERCEDES-AMG", "MERCEDES-BENZ"],
  ["MERCEDESAMG", "MERCEDES-BENZ"],
  ["MERCEDESBENZ", "MERCEDES-BENZ"],
  ["MERCEDES-BENZ SPRINT", "MERCEDES-BENZ"],
  ["MITSUBISHI J", "MITSUBISHI"],
  ["OPEL VAUXHALL", "OPEL"],
  ["OPELVAUXHALL", "OPEL"],
  ["OLEOPEL", "OPEL"],
  ["PORCHE", "PORSCHE"],
  ["REULT", "RENAULT"],
  ["RENAULT TECH", "RENAULT"],
  ["ROVER CARS", "ROVER"],
  ["SOCIETE DES AUTOMOBILES ALPINE", "ALPINE"],
  ["SSANG YONG", "SSANGYONG"],
  ["SSANGJONG", "SSANGYONG"],
  ["SSANGYONG KG MOBILITY", "SSANGYONG"],
  ["TESLA MOTORS", "TESLA"],
  ["VOLKSVAGEN", "VOLKSWAGEN"],
  ["VOLSKWAGEN", "VOLKSWAGEN"],
  ["VW", "VOLKSWAGEN"],
]);

/**
 * Brand prefixes that settle the make regardless of the legal entity, plant,
 * or secondary brand that follows ("KIA SLOVAKIA S.R.O.", "VOLKSWAGENVWVW",
 * "HYUNDAI MOTOR MANUFACTURING CZECH"). A null brand keeps the remainder.
 */
const MAKE_PREFIXES: [RegExp, string | null][] = [
  [/^VOLKSWAGEN/, "VOLKSWAGEN"],
  [/^CITRO.{0,3}N\b/, "CITROEN"],
  [/^CITROEN/, "CITROEN"],
  [/^.{0,2}KODA$/, "SKODA"],
  [/^FORD[\s-]*CNG\b/, "FORD"],
  [/^MERCEDES\b/, "MERCEDES-BENZ"],
  [/^DFSK\b/, "DFSK"],
  [/^SERES\b/, "SERES"],
  [/^ZHIDOU\b/, "ZHIDOU"],
  [/^HYUNDAI\b/, "HYUNDAI"],
  [/^KIA\b/, "KIA"],
  [/^TOYOTA\b/, "TOYOTA"],
  [/^NISSAN\b/, "NISSAN"],
  [/^HONDA\b/, "HONDA"],
  [/^SKODA\b/, "SKODA"],
  [/^SEAT\b/, "SEAT"],
  [/^MG\b/, "MG"],
  [/^MAXUS\b/, "MAXUS"],
  [/^CHERY\b/, "CHERY"],
  [/^GREAT WALL\b/, "GREAT WALL"],
  [/^LUCID\b/, "LUCID"],
  [/^FISKER\b/, "FISKER"],
  [/^AUTOMOBILI LAMBORGHINI\b/, "LAMBORGHINI"],
  [/^AUTOMOBILES\s+/, null],
];

/** Make strings that identify a group, importer, or converter rather than a brand. */
const REJECTED_MAKES = new Set([
  "ALLIED VEHICLES",
  "DAIMLER",
  "EGEN TILLVERKNING",
  "FCA US",
  "GM KOREA",
  "JAGUAR LAND ROVER",
  "OTHER BRITISH",
  "PSA",
  "QUATTRO",
]);

/** Sub-brands some countries report as a commercial-name prefix of the parent make. */
const SUB_BRANDS = new Map<string, string[]>([
  ["SEAT", ["CUPRA"]],
  ["FIAT", ["ABARTH"]],
  ["CITROEN", ["DS"]],
  ["HYUNDAI", ["GENESIS"]],
  ["RENAULT", ["ALPINE"]],
]);

const CORPORATE_TAIL =
  /\s+(CARS?|AG|GMBH|S\.?A\.?S?\.?|S\.?P\.?A\.?|S\.?R\.?O\.?|LTD\.?|LIMITED|LIMIT|LIM|LLC|INC\.?|CORPORATION|CORPORTION|CORP\.?|CO\.?|COMPANY|NV\/SA|A\.S\.?|PLC|UK|CHINA|TURKIYE|SLOVAKIA|SPORT|MOTORSPORT|AUTOMOTIVE|AUTOMOBILE|AUTOMOBILES)(\s.*|\.?)$/;

/** Leading "new model" words that some countries prepend to commercial names. */
const LEADING_NEW_WORDS =
  /^(NEW|NUEVO|NUEVA|NOUVEAU|NOUVELLE|NUOVO|NUOVA|NEUE|NEUER|NEUES|NOVO|NOVA|NOVY|NY|NIEUWE)\s+/;
/** Tokens that begin an engine, gearbox, or body specification suffix. */
const SPECIFICATION_TOKENS = new Set([
  "S&S",
  "EAT8",
  "EAT6",
  "EDC",
  "EDCS6",
  "DSG",
  "DCT",
  "CVT",
  "AUT",
  "AUT.",
  "AUTO",
  "AUTOMATIC",
  "AUTOMATIK",
  "MAN",
  "MAN.",
  "MANUAL",
  "BLUEHDI",
  "BHDI",
  "HDI",
  "PURETECH",
  "TDI",
  "TSI",
  "TFSI",
  "TDCI",
  "DCI",
  "TCE",
  "CDTI",
  "CRDI",
  "ECOBOOST",
  "ECOBLUE",
  "MHEV",
  "GASOLINA",
  "ELECTRICO",
  "DIESEL",
  "PETROL",
  "BENZIN",
  "BENZINA",
  "FURGON",
  "3P",
  "4P",
  "5P",
  "3D",
  "5D",
  "3DR",
  "5DR",
]);

/** Repairs common UTF-8 mojibake, strips diacritics, and keeps the first line. */
function cleanText(value: string): string {
  const firstLine = value.split(/\r?\n/)[0] ?? "";
  return normalizeName(
    firstLine
      .replace(/Ã‹/g, "E")
      .replace(/Ã–/g, "O")
      .replace(/Ã¶/g, "O")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[`´’]/g, ""),
  );
}

/**
 * Reduces a reported make string to the brand name. Returns undefined when
 * the string cannot identify a brand (addresses, numeric codes, holding
 * companies, or unrecoverable typos).
 */
export function normalizeMakeName(rawMake: string | null | undefined): string | undefined {
  if (!rawMake) return undefined;
  let make = cleanText(rawMake);
  if (!/[A-Z]/.test(make)) return undefined;

  make = MAKE_ALIASES.get(make) ?? make;
  // Coachbuilders and secondary brands: "FIAT/CAPRON", "MG. ROEWE", "OPEL, VAUXHALL".
  make = make.split(/\s*[,/]\s*|\.\s+|\s+-\s+|\s+\/\s+/)[0]?.trim() ?? "";
  // "VOLKSWAGEN VW", "VOLKSWAGENVWVW", "VOLKSWAGEN.VW".
  for (const [pattern, brand] of MAKE_PREFIXES) {
    if (pattern.test(make)) {
      make = brand ?? make.replace(pattern, "").trim();
      break;
    }
  }

  make = make.replace(/\s*\(.*?\)\s*/g, " ").trim();
  make = make.replace(/\s+MOTORS?\b.*$/, "");
  make = make.replace(/\s+\d+$/, "");
  for (let previous = ""; previous !== make; ) {
    previous = make;
    make = make.replace(CORPORATE_TAIL, "").trim();
  }
  make = MAKE_ALIASES.get(make) ?? make;
  make = make.replace(/[.,:;]+$/, "").replace(/\s+/g, " ").trim();

  if (make.length < 2 || !/[A-Z]/.test(make) || REJECTED_MAKES.has(make)) return undefined;
  return make;
}

/**
 * Splits "SEAT / CUPRA FORMENTOR" into make CUPRA and model FORMENTOR when a
 * country reports a sub-brand as part of the commercial name.
 */
export function splitSubBrand(makeName: string, modelName: string): [string, string] {
  for (const subBrand of SUB_BRANDS.get(makeName) ?? []) {
    if (modelName.startsWith(`${subBrand} `)) {
      return [subBrand, modelName.slice(subBrand.length + 1)];
    }
  }
  return [makeName, modelName];
}

/**
 * Reduces a reported commercial name to a model name by dropping engine and
 * power suffixes such as "T-ROC / 1.5 / TSI AUT." or "ID.3 PRO 150 KW".
 */
export function normalizeModelName(
  rawModel: string | null | undefined,
  makeName: string,
): string | undefined {
  if (!rawModel) return undefined;
  let model = cleanText(rawModel);
  model = model.split(/\s\/|\/\s/)[0]?.trim() ?? "";
  model = model.replace(/\s*\((?:M1|N1)G?\)\s*$/, "");
  model = model.replace(/\s+\d+(?:[.,]\d+)?\s*(?:KW|CV|PS|HP|BHP|KG)\b.*$/, "");
  model = model.replace(/\s*\/+\s*$/, "").replace(/\s+/g, " ").trim();
  model = model.replace(LEADING_NEW_WORDS, "");
  if (model.startsWith(`${makeName} `)) model = model.slice(makeName.length + 1);

  const tokens = model.split(" ");
  const cutIndex = tokens.findIndex(
    (token, index) =>
      index > 0 && (SPECIFICATION_TOKENS.has(token) || /^\d+[.,]\d+$/.test(token)),
  );
  if (cutIndex > 0) model = tokens.slice(0, cutIndex).join(" ");
  // Trailing power figures after a trim name: "3008 ALLURE HYBRID 136".
  model = model.replace(/^(\S+\s+\S+.*?)\s+\d{3,}$/, "$1");

  if (
    !/[A-Z0-9]/.test(model) ||
    model === makeName ||
    ["N/A", "NA", "NOT APPLICABLE", "OTHER", "UNKNOWN", "UNSPECIFIED", "NULL"].includes(model)
  ) {
    return undefined;
  }
  return model;
}

/** Spelling-insensitive key so "T-CROSS", "T CROSS", and "T - CROSS" merge. */
export function spellingKey(modelName: string): string {
  return modelName.replace(/[^A-Z0-9]/g, "");
}
