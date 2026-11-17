import type {
  GameRuntime,
  LobbySnapshot,
  Player,
  ScoreHistoryPoint,
} from "./types";

export function scorePoint(
  game: GameRuntime,
  players: Player[],
): ScoreHistoryPoint {
  return {
    turn: game.totalHandIndex + 1,
    cycleIndex: game.cycleIndex,
    roundIndex: game.roundIndex,
    roundStartTurn: game.totalHandIndex - game.handIndex + 1,
    scores: { ...game.scores },
    names: Object.fromEntries(players.map((p) => [p.id, p.name])),
  };
}

export function recordScores(game: GameRuntime, players: Player[]) {
  const point = scorePoint(game, players);
  const existing = game.scoreHistory.findIndex(
    (entry) => entry.turn === point.turn,
  );
  if (existing >= 0) game.scoreHistory[existing] = point;
  else game.scoreHistory.push(point);
}

export function gameProgress(snapshot: LobbySnapshot) {
  const game = snapshot.game!;
  const completed = ["results", "scoreboard", "finished"].includes(
    snapshot.phase,
  )
    ? 1
    : 0;
  const condition = snapshot.settings.winCondition;
  const winCondition =
    condition.type === "score-target"
      ? `First to ${condition.target} points`
      : condition.type === "round-count"
        ? `Highest score after ${condition.target} hands`
        : "Highest score after all stages";
  return {
    winCondition,
    cycle: game.cycleIndex + 1,
    round: game.roundIndex + 1,
    rounds: snapshot.settings.rounds.length,
    handsPlayed: game.handIndex + completed,
    handsInRound: snapshot.settings.rounds[game.roundIndex].hands,
    totalHandsPlayed: game.totalHandIndex + completed,
  };
}
