import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultGameTemplate, starterPack } from "../domain/defaults";
import { SettingsRepository } from "../services/storage";
import { HostSession } from "./session";

vi.mock("peerjs", () => ({
  default: class {
    on() {}
    destroy() {}
  },
}));
vi.mock("./peerConfig", () => ({ getPeerOptions: () => ({}) }));

let session: HostSession | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});

afterEach(() => {
  session?.destroy();
  session = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function startGame(useSavedRules: boolean) {
  session = new HostSession(
    { name: "Host", avatar: "✦", avatarColor: "#ffc83d", spectator: false },
    defaultGameTemplate,
    [starterPack],
  );
  const settings = structuredClone(defaultGameTemplate);
  settings.winCondition = { type: "score-target", target: 15 };
  Object.assign(settings.rounds[0], {
    winnerPoints: 2,
    allowJudgeToSubmit: true,
    allowBlankCards: false,
    revealStyle: "all-at-once",
    revealTimeSeconds: 1,
    judgeTimeSeconds: 1,
    resultsTimeSeconds: 1,
  });
  settings.showScoreboardAfterEachHand = false;
  if (useSavedRules) {
    settings.id = "first-to-15";
    const repository = new SettingsRepository();
    repository.save(settings);
    session.updateSettings(
      repository.all().find((item) => item.id === settings.id)!,
      [starterPack.id],
    );
  } else {
    // Lobby edits keep the built-in preset ID; they must still take effect.
    session.updateSettings(settings, [starterPack.id]);
  }
  session.start();
  return session;
}

function submitHand(host: HostSession) {
  const game = host.snapshot.game!;
  host.submitCards(
    "host",
    game.hands.host.slice(0, game.blackCard.pick).map((card) => card.id),
  );
  vi.advanceTimersByTime(1000);
  expect(host.snapshot.phase).toBe("judging");
}

describe("host scoring with a 15-point target and 2 points per win", () => {
  it.each([false, true])(
    "preserves the reward through lobby settings, scoring and game completion (saved rules: %s)",
    (useSavedRules) => {
      const host = startGame(useSavedRules);
      expect(host.snapshot.settings.winCondition).toEqual({
        type: "score-target",
        target: 15,
      });
      expect(host.snapshot.settings.rounds[0].winnerPoints).toBe(2);
      for (let wins = 1; wins <= 8; wins += 1) {
        submitHand(host);
        host.chooseWinner("host", "host");
        // A duplicate click or message must not award the win again.
        host.chooseWinner("host", "host");
        expect(host.snapshot.phase).toBe("results");
        expect(host.snapshot.game!.scores.host).toBe(wins * 2);
        expect(
          host.snapshot.settings.rounds[host.snapshot.game!.roundIndex]
            .winnerPoints,
        ).toBe(2);
        vi.advanceTimersByTime(1000);
        expect(host.snapshot.phase).toBe(wins === 8 ? "finished" : "answering");
      }
    },
  );

  it("uses the same 2-point reward when the judging timer expires", () => {
    const host = startGame(false);
    submitHand(host);
    vi.advanceTimersByTime(1000);
    expect(host.snapshot.phase).toBe("results");
    expect(host.snapshot.game!.scores.host).toBe(2);
  });
});
