import type { LobbySnapshot } from "./types";

type TimerState = Pick<LobbySnapshot, "pausedTimeRemainingMs" | "phaseEndsAt">;

export function isTimerPaused(state: TimerState) {
  // PeerJS encodes undefined fields as null on remote clients.
  return state.pausedTimeRemainingMs != null;
}

export function timerSeconds(state: TimerState, serverNow: number) {
  if (state.pausedTimeRemainingMs != null)
    return Math.max(0, Math.ceil(state.pausedTimeRemainingMs / 1000));
  return state.phaseEndsAt != null
    ? Math.max(0, Math.ceil((state.phaseEndsAt - serverNow) / 1000))
    : null;
}
