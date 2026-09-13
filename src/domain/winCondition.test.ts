import { describe, expect, it } from "vitest";
import { defaultGameTemplate, starterPack } from "./defaults";
import { CardGameEngine } from "./gameEngine";
import type { GameSettings, Player } from "./types";
import { isGameComplete, nextStageIndex } from "./winCondition";

const players: Player[] = ["one", "two", "three"].map((id) => ({
  id,
  name: id,
  avatar: "✦",
  avatarColor: "#ffc83d",
  connected: true,
  spectator: false,
  isHost: id === "one",
}));

const setup = () => {
  const settings = structuredClone(defaultGameTemplate);
  const game = CardGameEngine.createStage(
    settings.rounds[0],
    players,
    [starterPack],
  );
  return { settings, game };
};

describe("game win conditions", () => {
  it("finishes after the configured stage sequence by default", () => {
    const { settings, game } = setup();
    expect(isGameComplete(settings, game)).toBe(false);
    game.handIndex = settings.rounds[0].hands - 1;
    expect(isGameComplete(settings, game)).toBe(true);
  });

  it("finishes at a global round count", () => {
    const { settings, game } = setup();
    settings.winCondition = { type: "round-count", target: 3 };
    game.totalHandIndex = 1;
    expect(isGameComplete(settings, game)).toBe(false);
    game.totalHandIndex = 2;
    expect(isGameComplete(settings, game)).toBe(true);
  });

  it("finishes when any player reaches the score target", () => {
    const { settings, game } = setup();
    settings.winCondition = { type: "score-target", target: 5 };
    game.scores.two = 4;
    expect(isGameComplete(settings, game)).toBe(false);
    game.scores.two = 5;
    expect(isGameComplete(settings, game)).toBe(true);
  });

  it("cycles the stage sequence for open-ended targets", () => {
    const settings: GameSettings = {
      ...structuredClone(defaultGameTemplate),
      rounds: [
        defaultGameTemplate.rounds[0],
        { ...defaultGameTemplate.rounds[0], id: "second" },
      ],
    };
    expect(nextStageIndex(settings, 0)).toBe(1);
    expect(nextStageIndex(settings, 1)).toBe(0);
  });
});
