import graph from "./identity-data";
import { listAppearancePackages, type AppearancePackage, type AppearancePackageQuery } from "./identity";
export type { AppearancePackage, AppearancePackageQuery, ExteriorDifference } from "./identity";
export { EXTERIOR_DIFFERENCES, appearancePackageSlug } from "./identity";
/**
 * The appearance packages (Lexus F SPORT, BMW M Sport…) offered on a catalog vehicle in a year, from the
 * bundled identity graph. A market-scoped package is returned only when `market` is given and matches;
 * with no market, only packages without a market scope. With `anyMarket: true`, every package offered on
 * the row in the year in any market or none: the union, by `specificationId`, of the market-less call and
 * the call for every market (`market` is then ignored).
 */
export function getAppearancePackages(query: AppearancePackageQuery): AppearancePackage[] {
  return listAppearancePackages(graph, query);
}
