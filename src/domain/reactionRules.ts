import type { RoundSettings, LobbySnapshot } from "./types";

export function canReactDuringPhase(
  phase: LobbySnapshot["phase"],
  settings: Pick<RoundSettings, "allowReactionsAfterReveal">,
) {
  return (
    phase === "reveal" ||
    phase === "judging" ||
    (settings.allowReactionsAfterReveal === true && phase === "results")
  );
}
