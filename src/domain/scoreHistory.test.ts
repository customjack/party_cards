import { describe, expect, it } from "vitest";
import { defaultGameTemplate, starterPack } from "./defaults";
import { CardGameEngine } from "./gameEngine";
import { gameProgress, recordScores } from "./scoreHistory";
import type { LobbySnapshot, Player } from "./types";

const players: Player[] = [
  {
    id: "host",
    name: "Host",
    avatar: "✦",
    avatarColor: "#ffc83d",
    connected: true,
    spectator: false,
    isHost: true,
  },
];
function setup() {
  const settings = structuredClone(defaultGameTemplate);
  settings.rounds[0].hands = 3;
  const game = CardGameEngine.createStage(settings.rounds[0], players, [
    starterPack,
  ]);
  return {
    settings,
    game,
    snapshot: {
      settings,
      game,
      phase: "answering",
      players,
      roomCode: "TEST",
      selectedPackIds: [],
      serverTime: 0,
    } as LobbySnapshot,
  };
}

describe("score progress", () => {
  it.each([
    "answering",
    "reveal",
    "judging",
    "results",
    "scoreboard",
    "finished",
  ] as const)("counts completed hands correctly during %s", (phase) => {
    const { snapshot, game } = setup();
    game.handIndex = 1;
    game.totalHandIndex = 4;
    snapshot.phase = phase;
    const completed = ["results", "scoreboard", "finished"].includes(phase)
      ? 1
      : 0;
    expect(gameProgress(snapshot)).toMatchObject({
      round: 1,
      rounds: 1,
      handsPlayed: 1 + completed,
      handsInRound: 3,
      totalHandsPlayed: 4 + completed,
    });
  });

  it("describes all supported win conditions", () => {
    const { snapshot } = setup();
    snapshot.settings.winCondition = { type: "score-target", target: 15 };
    expect(gameProgress(snapshot).winCondition).toBe("First to 15 points");
    snapshot.settings.winCondition = { type: "round-count", target: 8 };
    expect(gameProgress(snapshot).winCondition).toBe(
      "Highest score after 8 hands",
    );
    snapshot.settings.winCondition = { type: "all-stages" };
    expect(gameProgress(snapshot).winCondition).toBe(
      "Highest score after all stages",
    );
  });
});

describe("score history", () => {
  it("snapshots scores without mutation, preserves round boundaries, and handles late players", () => {
    const { game, settings } = setup();
    expect(game.scoreHistory[0].scores.host).toBe(0);
    game.scores.host = -2;
    recordScores(game, players);
    game.scores.host = 5;
    expect(game.scoreHistory[1].scores.host).toBe(-2);
    recordScores(game, players);
    expect(game.scoreHistory).toHaveLength(2);
    const next = CardGameEngine.createStage(
      settings.rounds[0],
      players,
      [starterPack],
      game.scores,
      1,
      game.reactionTotals,
      game.scoreHistory,
    );
    next.roundIndex = 1;
    next.scores.late = 3;
    recordScores(next, [
      ...players,
      { ...players[0], id: "late", name: "Late player", isHost: false },
    ]);
    expect(next.scoreHistory.map((point) => point.turn)).toEqual([0, 1, 2]);
    expect(next.scoreHistory[2]).toMatchObject({
      roundIndex: 1,
      roundStartTurn: 2,
      scores: { host: 5, late: 3 },
      names: { late: "Late player" },
    });
    expect(next.scoreHistory[0].scores).not.toHaveProperty("late");
    next.scoreHistory[1].scores.host = 99;
    expect(game.scoreHistory[1].scores.host).toBe(5);
  });
});
