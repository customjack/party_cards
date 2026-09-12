import { describe, expect, it } from "vitest";
import { defaultGameTemplate, starterPack } from "./defaults";
import { CardGameEngine } from "./gameEngine";
import type { Player } from "./types";
import { cardsToPick } from "./cardRules";

const players = (count: number): Player[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    avatar: "✦",
    avatarColor: "#ffc83d",
    connected: true,
    spectator: false,
    isHost: index === 0,
  }));

describe("CardGameEngine", () => {
  it("infers the number of cards from separate prompt blanks", () => {
    expect(cardsToPick("Why ____?")).toBe(1);
    expect(cardsToPick("____, then ____, then ____.")).toBe(3);
    expect(cardsToPick("A question without a printed blank?")).toBe(1);
    expect(
      starterPack.blackCards.every(
        (card) => card.pick === cardsToPick(card.text),
      ),
    ).toBe(true);
  });
  it("loads original defaults from export-compatible resources", () => {
    expect(defaultGameTemplate.schemaVersion).toBe(1);
    expect(defaultGameTemplate.showScoreboardAfterEachHand).toBe(true);
    expect(defaultGameTemplate.maxReactionsPerPlayer).toBe("unlimited");
    expect(defaultGameTemplate.maxReactionsPerTarget).toBe(1);
    expect(
      Object.values(defaultGameTemplate.reactionPoints).every(
        (points) => points === 0,
      ),
    ).toBe(true);
    expect(starterPack.blackCards.length).toBeGreaterThanOrEqual(20);
    expect(starterPack.whiteCards.length).toBeGreaterThanOrEqual(50);
  });

  it("carries reaction tallies into the next stage", () => {
    const first = CardGameEngine.createStage(
      defaultGameTemplate.rounds[0],
      players(3),
      [starterPack],
    );
    first.reactionTotals.p1 = { brilliant: 2, blunder: 1 };
    const next = CardGameEngine.createStage(
      defaultGameTemplate.rounds[0],
      players(3),
      [starterPack],
      first.scores,
      first.totalHandIndex + 1,
      first.reactionTotals,
    );
    expect(next.reactionTotals.p1).toEqual({ brilliant: 2, blunder: 1 });
  });

  it("locks one reaction per player and optionally scores it", () => {
    const roster = players(3);
    const game = CardGameEngine.createStage(
      defaultGameTemplate.rounds[0],
      roster,
      [starterPack],
    );
    const targets = roster.filter((player) => player.id !== game.judgeId);
    for (const target of targets)
      CardGameEngine.submit(game, target.id, [game.hands[target.id][0].id]);
    expect(
      CardGameEngine.react(game, game.judgeId, targets[0].id, "brilliant", 3),
    ).toBe(true);
    expect(game.reactionTotals[targets[0].id].brilliant).toBe(1);
    expect(game.scores[targets[0].id]).toBe(3);
    expect(
      CardGameEngine.react(game, game.judgeId, targets[0].id, "good", 3),
    ).toBe(false);
    expect(
      CardGameEngine.react(game, game.judgeId, targets[1].id, "good", 0),
    ).toBe(true);
  });

  it("deals a complete private hand to every player in a large lobby", () => {
    const round = { ...defaultGameTemplate.rounds[0], handSize: 10 },
      game = CardGameEngine.createStage(round, players(12), [starterPack]);
    expect(Object.values(game.hands)).toHaveLength(12);
    expect(Object.values(game.hands).every((hand) => hand.length === 10)).toBe(
      true,
    );
  });

  it("validates multi-card submissions against the player's hand", () => {
    const game = CardGameEngine.createStage(
      defaultGameTemplate.rounds[0],
      players(4),
      [starterPack],
    );
    game.blackCard = { id: "pick-two", text: "____ and ____", pick: 2 };
    const submitter = players(4).find((player) => player.id !== game.judgeId)!,
      cards = game.hands[submitter.id].slice(0, 2);
    expect(CardGameEngine.submit(game, submitter.id, [cards[0].id])).toBe(
      false,
    );
    expect(
      CardGameEngine.submit(
        game,
        submitter.id,
        cards.map((card) => card.id),
      ),
    ).toBe(true);
    expect(game.lockedPlayerIds).toContain(submitter.id);
  });

  it("rotates judges and replenishes played cards", () => {
    const roster = players(4),
      round = defaultGameTemplate.rounds[0],
      game = CardGameEngine.createStage(round, roster, [starterPack]),
      firstJudge = game.judgeId,
      submitter = roster.find((player) => player.id !== firstJudge)!;
    const originalSize = game.hands[submitter.id].length;
    CardGameEngine.submit(game, submitter.id, [game.hands[submitter.id][0].id]);
    CardGameEngine.prepareNextHand(game, round, roster);
    expect(game.judgeId).not.toBe(firstJudge);
    expect(game.hands[submitter.id]).toHaveLength(originalSize);
    expect(game.submissions).toEqual({});
  });

  it("awards the configured score only to a valid submission", () => {
    const game = CardGameEngine.createStage(
        defaultGameTemplate.rounds[0],
        players(3),
        [starterPack],
      ),
      winner = players(3).find((player) => player.id !== game.judgeId)!;
    CardGameEngine.submit(game, winner.id, [game.hands[winner.id][0].id]);
    expect(CardGameEngine.chooseWinner(game, "missing", 2)).toBe(false);
    expect(CardGameEngine.chooseWinner(game, winner.id, 2)).toBe(true);
    expect(game.scores[winner.id]).toBe(2);
  });
});
