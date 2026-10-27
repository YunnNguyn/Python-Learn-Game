import type { ChallengeCatalogEntry } from "../../app/services";
import { DELIVERY_TIME_DEFINITION } from "./delivery-time/definition";
// The private solution. Imported only by the lazily loaded Challenge feature, so it stays out of the
// initial bundle. It is still shipped to the browser: this is a practice challenge, not a secure exam.
import deliveryTimeSolution from "./delivery-time/solution.csv?raw";

export const CHALLENGE_CATALOG: readonly ChallengeCatalogEntry[] = [
  { definition: DELIVERY_TIME_DEFINITION, solutionCsv: deliveryTimeSolution },
];
