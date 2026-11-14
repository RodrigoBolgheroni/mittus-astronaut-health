import "server-only";

import snapshot from "@/data/iss-position-snapshot.json";
import { createSpacecraftPositionReader } from "./celestrak";
import { createIssPositionReader } from "./wheretheiss";

export { celestrakUrl } from "./celestrak";
export type { SpacecraftPosition } from "./celestrak";
export { WHERE_THE_ISS_URL } from "./wheretheiss";
export type { IssPosition } from "./wheretheiss";

/** Current ISS position (wheretheiss.at), shared by every request on this instance. */
export const getIssPosition = createIssPositionReader({ snapshot: snapshot.response });

/** Current position of a craft in free flight, by NORAD id (CelesTrak + SGP4). */
export const getSpacecraftPosition = createSpacecraftPositionReader();
