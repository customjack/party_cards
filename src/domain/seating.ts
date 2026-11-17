import type { LobbySnapshot } from "./types";

export function roleChangeError(
  snapshot: LobbySnapshot,
  playerId: string,
  spectator: boolean,
) {
  const player = snapshot.players.find((item) => item.id === playerId);
  if (!player) return "Player not found.";
  if (player.spectator === spectator) return null;
  if (spectator) {
    if (!snapshot.settings.allowSpectators) return "Spectators are disabled.";
    if (
      snapshot.players.filter((item) => item.spectator).length >=
      snapshot.settings.maxSpectators
    )
      return "The spectator seats are full.";
    if (
      snapshot.game?.judgeId === playerId &&
      ["answering", "reveal", "judging"].includes(snapshot.phase) &&
      !snapshot.players.some(
        (item) => item.id !== playerId && !item.spectator && item.connected,
      )
    )
      return "Another connected player is needed to take over as judge.";
  } else if (
    !player.waitingForNextHand &&
    snapshot.players.filter(
      (item) => !item.spectator || item.waitingForNextHand,
    ).length >= snapshot.settings.maxPlayers
  ) {
    return "The player seats are full.";
  }
  return null;
}
