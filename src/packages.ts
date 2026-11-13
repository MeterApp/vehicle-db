import graph from "./identity-data";
import { listAppearancePackages, type AppearancePackage, type AppearancePackageQuery } from "./identity";
export type { AppearancePackage, AppearancePackageQuery, ExteriorDifference } from "./identity";
export { EXTERIOR_DIFFERENCES, appearancePackageSlug } from "./identity";
/**
 * The appearance packages (Lexus F SPORT, BMW M Sport…) offered on a catalog vehicle in a year, from the
 * bundled identity graph. A market-scoped package is returned only when `market` is given and matches;
 * with no market, only packages without a market scope.
 */
export function getAppearancePackages(query: AppearancePackageQuery): AppearancePackage[] {
  return listAppearancePackages(graph, query);
}
