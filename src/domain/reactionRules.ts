import type { GameSettings, LobbySnapshot } from "./types";

export function canReactDuringPhase(
  phase: LobbySnapshot["phase"],
  settings: Pick<GameSettings, "allowReactionsAfterReveal">,
) {
  return (
    phase === "reveal" ||
    (settings.allowReactionsAfterReveal === true &&
      (phase === "judging" || phase === "results"))
  );
}
