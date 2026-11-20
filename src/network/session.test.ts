import { pack, unpack } from "peerjs-js-binarypack";
import { isTimerPaused, timerSeconds } from "../domain/timer";
import type { LobbySnapshot } from "../domain/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultGameTemplate, starterPack } from "../domain/defaults";
import { SettingsRepository } from "../services/storage";
import { HostSession } from "./session";

const { peerEvents } = vi.hoisted(() => ({
  peerEvents: new Map<string, (...args: any[]) => void>(),
}));

vi.mock("peerjs", () => ({
  default: class {
    on(event: string, callback: (...args: any[]) => void) {
      peerEvents.set(event, callback);
    }
    destroy() {}
  },
}));
vi.mock("./peerConfig", () => ({ getPeerOptions: () => ({}) }));

let session: HostSession | undefined;

beforeEach(() => {
  peerEvents.clear();
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

describe("stopping a game", () => {
  it.each(["answering", "reveal", "judging", "results"])(
    "returns to the lobby from %s and allows a fresh game",
    (phase) => {
      const host = startGame(false);
      if (phase !== "answering") {
        const game = host.snapshot.game!;
        host.submitCards(
          "host",
          game.hands.host.slice(0, game.blackCard.pick).map((card) => card.id),
        );
      }
      if (phase === "judging" || phase === "results")
        vi.advanceTimersByTime(1000);
      if (phase === "results") host.chooseWinner("host", "host");
      expect(host.snapshot.phase).toBe(phase);
      const before = host.snapshot;
      const listener = vi.fn();
      host.onSnapshot(listener);
      host.stopGame();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: "lobby",
          game: undefined,
          phaseEndsAt: undefined,
        }),
      );
      expect(host.snapshot.players).toEqual(before.players);
      expect(host.snapshot.settings).toEqual(before.settings);
      expect(host.snapshot.roomCode).toBe(before.roomCode);
      expect(host.snapshot.selectedPackIds).toEqual(before.selectedPackIds);
      vi.advanceTimersByTime(120_000);
      expect(host.snapshot.phase).toBe("lobby");
      host.start();
      expect(host.snapshot.phase).toBe("answering");
      expect(host.snapshot.game!.scores.host).toBe(0);
      expect(host.snapshot.game!.totalHandIndex).toBe(0);
    },
  );
});

function connectPlayer(token: string, requestedId?: string, spectator = false) {
  const events = new Map<string, (...args: any[]) => void>();
  const connection = {
    peer: `party-cards-connection-${crypto.randomUUID()}`,
    open: true,
    on: (event: string, callback: (...args: any[]) => void) =>
      events.set(event, callback),
    send: vi.fn(),
    close: () => {
      connection.open = false;
      events.get("close")?.();
    },
  };
  peerEvents.get("connection")!(connection);
  events.get("open")!();
  const command = (data: unknown) => events.get("data")!(data);
  command({
    type: "JOIN",
    payload: {
      resumeToken: token,
      playerId: requestedId,
      profile: { name: token, avatar: "✦", avatarColor: "#ffc83d", spectator },
    },
  });
  const assigned = () =>
    connection.send.mock.calls
      .filter(([event]) => event.type === "ASSIGNED_PLAYER")
      .at(-1)![0].payload.playerId as string;
  const snapshot = () =>
    connection.send.mock.calls
      .filter(([event]) => event.type === "SNAPSHOT")
      .at(-1)![0].payload;
  return { connection, command, assigned, snapshot };
}

describe("host admin controls", () => {
  it("pauses the shared deadline, extends it, and resumes without losing remaining time", () => {
    const host = startGame(false);
    vi.advanceTimersByTime(5000);
    const remaining = host.snapshot.phaseEndsAt! - Date.now();
    host.pauseTimer();
    expect(host.snapshot.pausedTimeRemainingMs).toBe(remaining);
    expect(host.snapshot.phaseEndsAt).toBeUndefined();
    vi.advanceTimersByTime(120_000);
    expect(host.snapshot.phase).toBe("answering");
    host.addTime();
    expect(host.snapshot.pausedTimeRemainingMs).toBe(remaining + 30_000);
    host.resumeTimer();
    expect(host.snapshot.phaseEndsAt).toBe(Date.now() + remaining + 30_000);
    expect(host.snapshot.pausedTimeRemainingMs).toBeUndefined();
    vi.advanceTimersByTime(remaining + 30_000);
    expect(host.snapshot.phase).toBe("reveal");
  });

  it("holds early auto-reveal while paused and preserves pause through manual advancement", () => {
    const host = startGame(false);
    host.pauseTimer();
    const game = host.snapshot.game!;
    host.submitCards(
      "host",
      game.hands.host.slice(0, game.blackCard.pick).map((card) => card.id),
    );
    expect(host.snapshot.phase).toBe("answering");
    host.advancePhase();
    expect(host.snapshot.phase).toBe("reveal");
    expect(host.snapshot.pausedTimeRemainingMs).toBe(1000);
    vi.advanceTimersByTime(5000);
    expect(host.snapshot.phase).toBe("reveal");
    host.advancePhase();
    host.chooseWinner("host", "host");
    expect(host.snapshot.phase).toBe("results");
    expect(host.snapshot.pausedTimeRemainingMs).toBe(1000);
    host.stopGame();
    expect(host.snapshot.pausedTimeRemainingMs).toBeUndefined();
    host.start();
    expect(host.snapshot.phaseEndsAt).toBeDefined();
  });

  it("sets scores, validates edits and keeps administrative actions host-only", () => {
    const host = startGame(false);
    const peer = connectPlayer("viewer", undefined, true);
    host.setPlayerScore("host", 12);
    expect(peer.snapshot().game.scores.host).toBe(12);
    host.setPlayerScore("host", -2);
    expect(host.snapshot.game!.scores.host).toBe(-2);
    for (const invalid of [NaN, Infinity, Number.MAX_VALUE])
      expect(host.setPlayerScore("host", invalid)).toBe(false);
    expect(host.setPlayerScore("missing", 5)).toBe(false);
    peer.command({
      type: "SET_SCORE",
      payload: { playerId: "host", score: 999 },
    });
    peer.command({ type: "PAUSE_TIMER" });
    peer.command({ type: "STOP_GAME" });
    expect(host.snapshot.game!.scores.host).toBe(-2);
    expect(host.snapshot.pausedTimeRemainingMs).toBeUndefined();
    expect(host.snapshot.phase).toBe("answering");
  });

  it("transfers a connection into the existing seat and prevents the old owner reclaiming it", () => {
    const host = startGame(false);
    host.stopGame();
    const original = connectPlayer("original");
    const replacement = connectPlayer("replacement");
    const targetId = original.assigned();
    const sourceId = replacement.assigned();
    host.start();
    host.setPlayerScore(targetId, 9);
    host.setPlayerScore(sourceId, 3);
    const hand = original.snapshot().game.hands[targetId];
    original.connection.close();
    expect(host.reassignPlayer(sourceId, targetId)).toBe(true);
    expect(replacement.assigned()).toBe(targetId);
    expect(replacement.snapshot().game.hands[targetId]).toEqual(hand);
    expect(replacement.snapshot().game.scores[targetId]).toBe(9);
    expect(replacement.snapshot().game.scores[sourceId]).toBe(3);
    expect(
      host.snapshot.players.find((p) => p.id === sourceId)?.connected,
    ).toBe(false);
    replacement.command({
      type: "SUBMIT_CARDS",
      payload: {
        cardIds: hand
          .slice(0, host.snapshot.game!.blackCard.pick)
          .map((card: { id: string }) => card.id),
        blankAnswers: {},
      },
    });
    expect(host.snapshot.game!.lockedPlayerIds).toContain(targetId);
    replacement.connection.close();
    const oldOwner = connectPlayer("original", targetId);
    expect(oldOwner.assigned()).not.toBe(targetId);
    const reconnected = connectPlayer("replacement");
    expect(reconnected.assigned()).toBe(targetId);
    expect(reconnected.snapshot().game.scores[targetId]).toBe(9);
    expect(host.reassignPlayer("host", sourceId)).toBe(false);
    expect(host.reassignPlayer(targetId, "host")).toBe(false);
    expect(host.reassignPlayer(sourceId, targetId)).toBe(false);
  });

  it("allows a spectator to take over a disconnected judge without replacing their role", () => {
    const host = startGame(false);
    host.stopGame();
    const original = connectPlayer("judge");
    const targetId = original.assigned();
    host.start();
    // Finish the first hand; rotation makes the disconnected seat the next judge.
    host.advancePhase();
    host.advancePhase();
    host.advancePhase();
    host.advancePhase();
    expect(host.snapshot.game!.judgeId).toBe(targetId);
    original.connection.close();
    const spectator = connectPlayer("spectator", undefined, true);
    const previousId = spectator.assigned();
    expect(host.reassignPlayer(previousId, targetId)).toBe(true);
    expect(host.snapshot.game!.judgeId).toBe(targetId);
    expect(host.snapshot.players.some((p) => p.id === previousId)).toBe(false);
    expect(spectator.assigned()).toBe(targetId);
  });
});

it("resumes the client countdown after PeerJS serializes the cleared pause state as null", async () => {
  const host = startGame(false);
  const peer = connectPlayer("timer-viewer", undefined, true);
  const received = async () =>
    unpack((await pack(peer.snapshot())) as ArrayBuffer) as LobbySnapshot;
  host.pauseTimer();
  const paused = await received();
  expect(isTimerPaused(paused)).toBe(true);
  const remaining = timerSeconds(paused, Date.now());
  vi.advanceTimersByTime(5000);
  expect(timerSeconds(paused, Date.now())).toBe(remaining);
  host.resumeTimer();
  const resumed = await received();
  expect(resumed.pausedTimeRemainingMs).toBeNull();
  expect(isTimerPaused(resumed)).toBe(false);
  expect(timerSeconds(resumed, Date.now())).toBe(remaining);
  vi.advanceTimersByTime(2000);
  expect(timerSeconds(resumed, Date.now())).toBe(remaining! - 2);
  host.pauseTimer();
  expect(isTimerPaused(await received())).toBe(true);
  host.stopGame();
  const stopped = await received();
  expect(isTimerPaused(stopped)).toBe(false);
  expect(timerSeconds(stopped, Date.now())).toBeNull();
});

describe("player and spectator roles", () => {
  const profile = (spectator: boolean) => ({
    name: "Player",
    avatar: "✦",
    avatarColor: "#ffc83d",
    spectator,
  });
  const lobby = (maxPlayers = 2, maxSpectators = 1) => {
    const host = startGame(false);
    host.stopGame();
    host.updateSettings(
      { ...host.snapshot.settings, maxPlayers, maxSpectators },
      [starterPack.id],
    );
    return host;
  };

  it("lets host and clients change lobby roles while enforcing both capacities", () => {
    const host = lobby();
    const peer = connectPlayer("player");
    host.updateHost(profile(true));
    expect(host.snapshot.players.find((p) => p.isHost)?.spectator).toBe(true);
    peer.command({ type: "UPDATE_PROFILE", payload: profile(true) });
    expect(
      host.snapshot.players.find((p) => p.id === peer.assigned())?.spectator,
    ).toBe(false);
    connectPlayer("second-player");
    host.updateHost(profile(false));
    expect(host.snapshot.players.find((p) => p.isHost)?.spectator).toBe(true);
    host.updateSettings({ ...host.snapshot.settings, maxSpectators: 2 }, [
      starterPack.id,
    ]);
    peer.command({ type: "UPDATE_PROFILE", payload: profile(true) });
    host.updateHost(profile(false));
    expect(host.snapshot.players.find((p) => p.isHost)?.spectator).toBe(false);
    peer.command({ type: "UPDATE_PROFILE", payload: profile(false) });
    expect(
      host.snapshot.players.find((p) => p.id === peer.assigned())?.spectator,
    ).toBe(true);
  });

  it("enforces spectator limits on new joins but permits reconnecting to an existing seat", () => {
    const host = lobby();
    const watcher = connectPlayer("watcher", undefined, true);
    const extra = connectPlayer("extra", undefined, true);
    expect(host.snapshot.players.filter((p) => p.spectator)).toHaveLength(1);
    expect(
      extra.connection.send.mock.calls.some(
        ([event]) => event.type === "REJECTED",
      ),
    ).toBe(true);
    watcher.connection.close();
    const resumed = connectPlayer("watcher", watcher.assigned(), true);
    expect(resumed.assigned()).toBe(watcher.assigned());
    expect(host.snapshot.players.filter((p) => p.spectator)).toHaveLength(1);
    expect(
      host.snapshot.players.find((p) => p.id === resumed.assigned())?.connected,
    ).toBe(true);
  });

  it("starts with a spectator host who is neither dealt cards nor selected as judge", () => {
    const host = lobby();
    host.updateHost(profile(true));
    const peer = connectPlayer("player");
    host.start();
    expect(host.snapshot.phase).toBe("answering");
    expect(host.snapshot.game!.judgeId).toBe(peer.assigned());
    expect(host.snapshot.game!.hands.host).toBeUndefined();
    const hand = peer.snapshot().game.hands[peer.assigned()];
    peer.command({
      type: "SUBMIT_CARDS",
      payload: {
        cardIds: hand
          .slice(0, host.snapshot.game!.blackCard.pick)
          .map((card: { id: string }) => card.id),
        blankAnswers: {},
      },
    });
    host.react("host", peer.assigned(), "brilliant");
    expect(host.snapshot.game!.reactionTotals[peer.assigned()].brilliant).toBe(
      1,
    );
  });

  it("reserves admin-promoted player seats and deals them in only on the next hand", () => {
    const host = lobby(2, 3);
    const first = connectPlayer("first-watcher", undefined, true);
    const second = connectPlayer("second-watcher", undefined, true);
    host.start();
    expect(host.setPlayerSpectator(first.assigned(), false)).toBe(true);
    expect(host.setPlayerSpectator(second.assigned(), false)).toBe(false);
    expect(
      host.snapshot.players.find((p) => p.id === first.assigned())
        ?.waitingForNextHand,
    ).toBe(true);
    expect(first.snapshot().game.hands[first.assigned()]).toBeUndefined();
    host.advancePhase();
    host.advancePhase();
    host.advancePhase();
    host.advancePhase();
    expect(host.snapshot.phase).toBe("answering");
    expect(
      host.snapshot.players.find((p) => p.id === first.assigned())?.spectator,
    ).toBe(false);
    expect(first.snapshot().game.hands[first.assigned()]).toHaveLength(
      host.snapshot.settings.rounds[0].handSize,
    );
    expect(host.setPlayerSpectator("host", true)).toBe(true);
    expect(host.snapshot.players.find((p) => p.isHost)?.spectator).toBe(true);
  });

  it("does not let client role commands change roles during an active game", () => {
    const host = lobby();
    const watcher = connectPlayer("watcher", undefined, true);
    host.start();
    watcher.command({ type: "UPDATE_PROFILE", payload: profile(false) });
    expect(
      host.snapshot.players.find((p) => p.id === watcher.assigned())?.spectator,
    ).toBe(true);
    expect(
      host.snapshot.players.find((p) => p.id === watcher.assigned())
        ?.waitingForNextHand,
    ).not.toBe(true);
  });
});

describe("stage reaction scoring and spectator permissions", () => {
  it.each([true, false])(
    "applies each stage's points and spectator reaction permission (%s)",
    (allowed) => {
      const host = startGame(false);
      host.stopGame();
      const settings = host.snapshot.settings;
      settings.allowSpectatorReactions = allowed;
      settings.winCondition = { type: "all-stages" };
      settings.rounds = [2, 5].map((points, index) => ({
        ...structuredClone(settings.rounds[0]),
        id: `stage-${index}`,
        hands: 1,
        reactionPoints: {
          ...settings.rounds[0].reactionPoints,
          brilliant: points,
        },
      }));
      host.updateSettings(settings, [starterPack.id]);
      const watcher = connectPlayer("watcher", undefined, true);
      host.start();
      host.advancePhase();
      watcher.command({
        type: "REACT",
        payload: { targetPlayerId: "host", reaction: "brilliant" },
      });
      expect(host.snapshot.game!.scores.host).toBe(allowed ? 2 : 0);
      host.advancePhase();
      host.chooseWinner("host", "host");
      host.advancePhase();
      host.advancePhase();
      expect(host.snapshot.game!.roundIndex).toBe(1);
      const previous = host.snapshot.game!.scores.host;
      host.advancePhase();
      watcher.command({
        type: "REACT",
        payload: { targetPlayerId: "host", reaction: "brilliant" },
      });
      expect(host.snapshot.game!.scores.host).toBe(
        previous + (allowed ? 5 : 0),
      );
    },
  );

  it("refuses to start if a stage's pack pool is explicitly disabled", () => {
    const host = startGame(false);
    host.stopGame();
    const settings = host.snapshot.settings;
    settings.rounds[0].useAllPacks = false;
    settings.rounds[0].packIds = [];
    host.updateSettings(settings, [starterPack.id]);
    host.start();
    expect(host.snapshot.phase).toBe("lobby");
    settings.rounds[0].packIds = [starterPack.id];
    host.updateSettings(settings, [starterPack.id]);
    host.start();
    expect(host.snapshot.phase).toBe("answering");
  });
});

it("records final hand totals through stage transitions and includes result reactions", () => {
  const host = startGame(false);
  host.stopGame();
  const settings = host.snapshot.settings;
  settings.winCondition = { type: "all-stages" };
  settings.rounds = [0, 1].map((index) => ({
    ...structuredClone(settings.rounds[0]),
    id: `history-${index}`,
    hands: 1,
    allowReactionsAfterReveal: true,
    reactionPoints: { ...settings.rounds[0].reactionPoints, brilliant: 3 },
  }));
  host.updateSettings(settings, [starterPack.id]);
  const watcher = connectPlayer("history-watcher", undefined, true);
  host.start();
  host.advancePhase();
  host.advancePhase();
  host.chooseWinner("host", "host");
  watcher.command({
    type: "REACT",
    payload: { targetPlayerId: "host", reaction: "brilliant" },
  });
  host.advancePhase();
  expect(host.snapshot.game!.scoreHistory[1].scores.host).toBe(5);
  host.setPlayerScore("host", 6);
  expect(host.snapshot.game!.scoreHistory[1].scores.host).toBe(6);
  host.advancePhase();
  expect(host.snapshot.game!.roundIndex).toBe(1);
  host.advancePhase();
  host.advancePhase();
  host.chooseWinner("host", "host");
  host.advancePhase();
  expect(host.snapshot.phase).toBe("finished");
  expect(
    host.snapshot.game!.scoreHistory.map((point) => point.scores.host),
  ).toEqual([0, 6, 8]);
  expect(watcher.snapshot().game.scoreHistory).toEqual(
    host.snapshot.game!.scoreHistory,
  );
  host.stopGame();
  host.start();
  expect(host.snapshot.game!.scoreHistory).toHaveLength(1);
});

it("retains hands when cycling into stage one and records the cycle on the scoreboard and graph", () => {
  const host = startGame(false);
  host.stopGame();
  const settings = host.snapshot.settings;
  settings.winCondition = { type: "round-count", target: 3 };
  settings.rounds = [0, 1].map((index) => ({
    ...structuredClone(settings.rounds[0]),
    id: `cycle-stage-${index}`,
    hands: 1,
  }));
  host.updateSettings(settings, [starterPack.id]);
  host.start();
  for (let stage = 0; stage < 2; stage++) {
    const before = host.snapshot.game!;
    const kept = before.hands.host
      .slice(before.blackCard.pick)
      .map((card) => card.id);
    for (let phase = 0; phase < 5; phase++) host.advancePhase();
    expect(host.snapshot.phase).toBe("answering");
    expect(
      kept.every((id) =>
        host.snapshot.game!.hands.host.some((card) => card.id === id),
      ),
    ).toBe(true);
  }
  expect(host.snapshot.game!.roundIndex).toBe(0);
  expect(host.snapshot.game!.cycleIndex).toBe(1);
  for (let phase = 0; phase < 4; phase++) host.advancePhase();
  expect(host.snapshot.phase).toBe("finished");
  expect(
    host.snapshot.game!.scoreHistory.map((point) => point.cycleIndex),
  ).toEqual([0, 0, 0, 1]);
});

it("serves visible images on demand without placing their bytes or hidden decks in snapshots", () => {
  const host = startGame(false);
  host.destroy();
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const pack = {
    ...structuredClone(starterPack),
    id: "image-pack",
    images: { prompt: png, answer: png },
    blackCards: [{ id: "black", text: "", imageId: "prompt", pick: 1 }],
    whiteCards: [{ id: "white", text: "", imageId: "answer" }],
  };
  session = new HostSession(
    { name: "Host", avatar: "✦", avatarColor: "#ffc83d", spectator: false },
    defaultGameTemplate,
    [pack],
  );
  const viewer = connectPlayer("image-viewer", undefined, true);
  session.start();
  expect(viewer.snapshot().game.blackCard.imageId).toBe("image-pack:prompt");
  expect(viewer.snapshot().game.whiteDeck).toEqual([]);
  expect(JSON.stringify(viewer.snapshot())).not.toContain("data:image/");
  viewer.command({
    type: "REQUEST_IMAGE",
    payload: { imageId: "image-pack:prompt" },
  });
  expect(viewer.connection.send).toHaveBeenLastCalledWith({
    type: "IMAGE",
    payload: { imageId: "image-pack:prompt", data: png },
  });
  viewer.command({
    type: "REQUEST_IMAGE",
    payload: { imageId: "image-pack:answer" },
  });
  expect(viewer.connection.send).toHaveBeenLastCalledWith({
    type: "IMAGE",
    payload: { imageId: "image-pack:answer", data: null },
  });
});
