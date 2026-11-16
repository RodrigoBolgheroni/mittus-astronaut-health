import { evaluateCheckInActions, listCheckInActions } from "@/lib/api";
import { ceresForecastFromAction, percentFromAction, type ForecastState } from "./forecast";

/**
 * Evaluates the latest check-in. On 409 (outdated / not latest) the stored
 * actions are read instead; with no usable snapshot the forecast is unavailable.
 */
export async function loadForecast(checkInId: string): Promise<ForecastState> {
  try {
    const result = await evaluateCheckInActions(checkInId);
    if (result.status === "insufficient_history") return { kind: "insufficient_history" };
    if (result.status === "ready") {
      const percent = percentFromAction(result.action);
      if (percent !== null) return { kind: "ready", percent, forecast: ceresForecastFromAction(result.action) };
    }
    return { kind: "unavailable" };
  } catch (error) {
    if ((error as { status?: number }).status === 409) {
      try {
        const { actions } = await listCheckInActions(checkInId);
        for (const action of actions) {
          if (action.status === "superseded") continue;
          const percent = percentFromAction(action);
          if (percent !== null) return { kind: "ready", percent, forecast: ceresForecastFromAction(action) };
        }
      } catch {
        /* falls through to unavailable */
      }
    }
    return { kind: "unavailable" };
  }
}
