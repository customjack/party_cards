import Peer, { type DataConnection } from "peerjs";
import { CardGameEngine } from "../domain/gameEngine";
import {
  NAME_MAX_LENGTH,
  REACTIONS,
  type CardPack,
  type ClientCommand,
  type GameSettings,
  type HostEvent,
  type LobbySnapshot,
  type Player,
  type ProfilePayload,
  type ReactionId,
} from "../domain/types";
import { getPeerOptions } from "./peerConfig";
import { isGameComplete, nextStageIndex } from "../domain/winCondition";

const PREFIX = "party-cards-",
  RECONNECT_GRACE_MS = 60_000;
const makeCode = () =>
  Array.from(
    { length: 6 },
    () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)],
  ).join("");
const makeClientId = () => `${PREFIX}connection-${crypto.randomUUID()}`;
const getResumeToken = (room: string) => {
  const key = `party-cards-seat-${room}`;
  const saved = sessionStorage.getItem(key);
  if (saved) return saved;
  const token = crypto.randomUUID();
  sessionStorage.setItem(key, token);
  return token;
};
export type ConnectionState =
  "connecting" | "connected" | "reconnecting" | "disconnected";

export abstract class GameSession {
  protected peer?: Peer;
  protected snapshotListeners = new Set<(snapshot: LobbySnapshot) => void>();
  protected errorListeners = new Set<(message: string) => void>();
  protected statusListeners = new Set<(state: ConnectionState) => void>();
  protected connectionState: ConnectionState = "connecting";
  onSnapshot(listener: (snapshot: LobbySnapshot) => void) {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }
  onError(listener: (message: string) => void) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
  onStatus(listener: (state: ConnectionState) => void) {
    this.statusListeners.add(listener);
    listener(this.connectionState);
    return () => this.statusListeners.delete(listener);
  }
  protected emit(snapshot: LobbySnapshot) {
    this.snapshotListeners.forEach((listener) =>
      listener(structuredClone(snapshot)),
    );
  }
  protected fail(message: string) {
    this.errorListeners.forEach((listener) => listener(message));
  }
  protected setStatus(state: ConnectionState) {
    this.connectionState = state;
    this.statusListeners.forEach((listener) => listener(state));
  }
  get localPlayerId(): string | undefined {
    return this instanceof HostSession ? "host" : this.peer?.id;
  }
  destroy() {
    this.peer?.destroy();
  }
}

export class HostSession extends GameSession {
  private connections = new Map<string, DataConnection>();
  private connectionPlayers = new Map<string, string>();
  private dropTimers = new Map<string, number>();
  private state: LobbySnapshot;
  private packs: CardPack[];
  private clock: number;
  private signalingRetry?: number;
  private readonly peerId: string;
  private hasOpened = false;
  private kickedPlayerIds = new Set<string>();
  constructor(host: ProfilePayload, settings: GameSettings, packs: CardPack[]) {
    super();
    const code = makeCode();
    this.state = {
      roomCode: code,
      settings: structuredClone(settings),
      selectedPackIds: packs.map((pack) => pack.id),
      phase: "lobby",
      serverTime: Date.now(),
      players: [
        {
          ...host,
          id: "host",
          spectator: false,
          connected: true,
          isHost: true,
        },
      ],
    };
    this.packs = structuredClone(packs);
    this.peerId = `${PREFIX}${code}`;
    this.createPeer();
    this.clock = window.setInterval(() => this.tick(), 500);
  }
  get snapshot() {
    return this.viewFor("host");
  }
  updateSettings(settings: GameSettings, selectedPackIds: string[]) {
    if (this.state.phase !== "lobby") return;
    this.state.settings = structuredClone(settings);
    this.state.selectedPackIds = [...selectedPackIds];
    this.broadcast();
  }
  updateHost(profile: ProfilePayload) {
    this.state.players[0] = {
      ...this.state.players[0],
      ...this.cleanProfile(profile),
      spectator: false,
    };
    this.broadcast();
  }
  kickPlayer(playerId: string) {
    const player = this.state.players.find((item) => item.id === playerId);
    if (!player || player.isHost) return;
    this.kickedPlayerIds.add(playerId);
    this.state.players = this.state.players.filter(
      (item) => item.id !== playerId,
    );
    this.removePlayerFromGame(playerId);
    this.connections.forEach((connection, connectionId) => {
      if (this.connectionPlayers.get(connectionId) !== playerId) return;
      if (connection.open)
        connection.send({
          type: "KICKED",
          payload: { reason: "The host removed you from the game." },
        } satisfies HostEvent);
      this.connections.delete(connectionId);
      this.connectionPlayers.delete(connectionId);
      const timer = this.dropTimers.get(connectionId);
      if (timer) clearTimeout(timer);
      this.dropTimers.delete(connectionId);
      window.setTimeout(() => connection.close(), 50);
    });
    this.broadcast();
  }
  start() {
    if (this.state.phase !== "lobby" || !this.state.settings.rounds.length)
      return;
    const round = this.state.settings.rounds[0],
      packs = this.activePacks();
    this.state.game = CardGameEngine.createStage(
      round,
      this.state.players,
      packs,
    );
    this.state.phase = "answering";
    this.setDeadline(round.answerTimeSeconds);
    this.broadcast();
  }
  submitCards(
    playerId: string,
    cardIds: string[],
    blankAnswers: Record<string, string> = {},
  ) {
    if (this.state.phase !== "answering" || !this.state.game) return;
    const round = this.currentRound(),
      eligible = CardGameEngine.eligibleSubmitters(
        this.state.game,
        round,
        this.state.players,
      );
    if (
      !eligible.includes(playerId) ||
      !CardGameEngine.submit(this.state.game, playerId, cardIds, blankAnswers)
    )
      return;
    if (
      round.endAnsweringWhenAllPlayed &&
      eligible.every((id) => this.state.game!.lockedPlayerIds.includes(id))
    )
      this.beginReveal();
    this.broadcast();
  }
  unlockCards(playerId: string) {
    if (this.state.phase !== "answering" || !this.state.game) return;
    CardGameEngine.unlock(this.state.game, playerId);
    this.broadcast();
  }
  chooseWinner(playerId: string, winnerId: string) {
    if (
      this.state.phase !== "judging" ||
      !this.state.game ||
      this.state.game.judgeId !== playerId
    )
      return;
    if (
      !CardGameEngine.chooseWinner(
        this.state.game,
        winnerId,
        this.currentRound().winnerPoints,
      )
    )
      return;
    this.state.phase = "results";
    this.setDeadline(this.currentRound().resultsTimeSeconds);
    this.broadcast();
  }
  react(playerId: string, targetPlayerId: string, reaction: ReactionId) {
    const game = this.state.game;
    if (
      !game ||
      !["reveal", "judging", "results"].includes(this.state.phase) ||
      !REACTIONS.some((item) => item.id === reaction) ||
      !this.state.players.some((player) => player.id === playerId) ||
      !CardGameEngine.react(
        game,
        playerId,
        targetPlayerId,
        reaction,
        this.state.settings.reactionPoints[reaction] ?? 0,
        this.state.settings.maxReactionsPerPlayer,
        this.state.settings.maxReactionsPerTarget,
      )
    )
      return;
    this.broadcast();
  }
  playAgain() {
    if (this.state.phase !== "finished") return;
    this.state.game = undefined;
    this.state.phase = "lobby";
    this.state.phaseEndsAt = undefined;
    this.broadcast();
  }
  override destroy() {
    clearInterval(this.clock);
    if (this.signalingRetry) clearTimeout(this.signalingRetry);
    this.dropTimers.forEach((timer) => clearTimeout(timer));
    super.destroy();
  }
  private createPeer() {
    this.peer = new Peer(this.peerId, getPeerOptions());
    const peer = this.peer;
    peer.on("open", () => {
      if (peer !== this.peer) return;
      if (this.signalingRetry) clearTimeout(this.signalingRetry);
      this.hasOpened = true;
      this.setStatus("connected");
      this.broadcast();
    });
    peer.on("connection", (connection) => this.accept(connection));
    peer.on("disconnected", () => this.reconnectSignaling());
    peer.on("error", (error) => {
      if (peer !== this.peer) return;
      if (error.type === "unavailable-id" && !this.hasOpened)
        this.fail("That room code is already in use. Try hosting again.");
      else if (
        [
          "network",
          "socket-error",
          "socket-closed",
          "server-error",
          "unavailable-id",
        ].includes(error.type)
      )
        this.reconnectSignaling();
      else this.fail(error.message);
    });
  }
  private reconnectSignaling() {
    if (this.peer?.destroyed || this.signalingRetry) return;
    this.setStatus("reconnecting");
    try {
      this.peer?.reconnect();
    } catch {
      /* retry below */
    }
    this.signalingRetry = window.setTimeout(() => {
      this.signalingRetry = undefined;
      this.reconnectSignaling();
    }, 2500);
  }
  private accept(connection: DataConnection) {
    connection.on("open", () => {
      const timer = this.dropTimers.get(connection.peer);
      if (timer) clearTimeout(timer);
      this.dropTimers.delete(connection.peer);
      this.connections.get(connection.peer)?.close();
      this.connections.set(connection.peer, connection);
      const player = this.state.players.find(
        (item) => item.id === connection.peer,
      );
      if (player) {
        player.connected = true;
        this.broadcast();
      }
    });
    connection.on("data", (data) =>
      this.handle(connection, data as ClientCommand),
    );
    connection.on("close", () =>
      this.markDisconnected(connection.peer, connection),
    );
    connection.on("error", () =>
      this.markDisconnected(connection.peer, connection),
    );
  }
  private handle(connection: DataConnection, command: ClientCommand) {
    let id = this.connectionPlayers.get(connection.peer) ?? connection.peer;
    if (command.type === "JOIN") {
      const token = String(command.payload.resumeToken || "")
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 80);
      const requestedId = String(command.payload.playerId || "")
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 140);
      const resumeId =
        requestedId.startsWith(PREFIX) &&
        this.state.players.some((player) => player.id === requestedId)
          ? requestedId
          : token
            ? `${PREFIX}seat-${token}`
            : connection.peer;
      if (this.kickedPlayerIds.has(resumeId)) {
        connection.send({
          type: "KICKED",
          payload: { reason: "The host removed you from the game." },
        } satisfies HostEvent);
        window.setTimeout(() => connection.close(), 50);
        return;
      }
      const resumable = this.state.players.find(
        (player) => player.id === resumeId,
      );
      id =
        resumable &&
        (resumable.connected ||
          !this.state.settings.takeoverDisconnectedPlayers)
          ? connection.peer
          : resumeId;
      this.connectionPlayers.set(connection.peer, id);
      connection.send({
        type: "ASSIGNED_PLAYER",
        payload: { playerId: id },
      } satisfies HostEvent);
      const existing = this.state.players.find((player) => player.id === id);
      if (existing) {
        const profile = this.cleanProfile(command.payload.profile),
          spectator =
            this.state.phase === "lobby"
              ? profile.spectator
              : existing.spectator;
        Object.assign(existing, profile, { spectator, connected: true });
        this.broadcast();
        return;
      }
      const activeCount = this.state.players.filter(
          (player) => !player.spectator,
        ).length,
        requestedSpectator = command.payload.profile.spectator,
        gameActive = this.state.phase !== "lobby",
        openSeat = activeCount < this.state.settings.maxPlayers,
        waitingForNextStage =
          gameActive &&
          !requestedSpectator &&
          openSeat &&
          this.state.settings.lateJoin,
        spectator = requestedSpectator || gameActive || !openSeat;
      if (spectator && !this.state.settings.allowSpectators) {
        connection.send({
          type: "REJECTED",
          payload: { reason: "This room is full or not accepting spectators." },
        } satisfies HostEvent);
        return;
      }
      if (
        gameActive &&
        !requestedSpectator &&
        !waitingForNextStage &&
        this.state.settings.fullRoomFallback === "reject"
      ) {
        connection.send({
          type: "REJECTED",
          payload: {
            reason: "This game is not accepting another player right now.",
          },
        } satisfies HostEvent);
        return;
      }
      this.state.players.push({
        ...this.cleanProfile(command.payload.profile),
        id,
        spectator,
        waitingForNextStage,
        connected: true,
        isHost: false,
      });
      this.broadcast();
      return;
    }
    if (command.type === "REQUEST_SNAPSHOT") {
      connection.send({
        type: "SNAPSHOT",
        payload: this.viewFor(id),
      } satisfies HostEvent);
      return;
    }
    if (command.type === "LEAVE") {
      if (this.state.phase === "lobby")
        this.state.players = this.state.players.filter(
          (player) => player.id !== id,
        );
      else {
        const player = this.state.players.find((item) => item.id === id);
        if (player) player.connected = false;
      }
      this.broadcast();
      return;
    }
    if (command.type === "UPDATE_PROFILE") {
      const player = this.state.players.find((item) => item.id === id);
      if (player && this.state.phase === "lobby")
        Object.assign(player, this.cleanProfile(command.payload));
      this.broadcast();
    } else if (command.type === "SUBMIT_CARDS")
      this.submitCards(
        id,
        command.payload.cardIds,
        command.payload.blankAnswers,
      );
    else if (command.type === "UNLOCK_CARDS") this.unlockCards(id);
    else if (command.type === "CHOOSE_WINNER")
      this.chooseWinner(id, command.payload.playerId);
    else if (command.type === "REACT")
      this.react(id, command.payload.targetPlayerId, command.payload.reaction);
  }
  private markDisconnected(id: string, connection: DataConnection) {
    if (this.connections.get(id) !== connection) return;
    this.connections.delete(id);
    const playerId = this.connectionPlayers.get(id) ?? id;
    this.connectionPlayers.delete(id);
    const stillConnected = [...this.connections.keys()].some(
      (peerId) => this.connectionPlayers.get(peerId) === playerId,
    );
    const player = this.state.players.find((item) => item.id === playerId);
    if (player && !stillConnected) player.connected = false;
    this.broadcast();
    const timer = window.setTimeout(
      () => this.dropTimers.delete(id),
      RECONNECT_GRACE_MS,
    );
    this.dropTimers.set(id, timer);
  }
  private tick() {
    if (["lobby", "finished"].includes(this.state.phase)) return;
    if (this.state.phaseEndsAt && Date.now() >= this.state.phaseEndsAt) {
      if (this.state.phase === "answering") {
        CardGameEngine.autoSubmit(
          this.state.game!,
          this.currentRound(),
          this.state.players,
        );
        this.beginReveal();
      } else if (this.state.phase === "reveal") this.beginJudging();
      else if (this.state.phase === "judging") this.chooseRandomWinner();
      else if (this.state.phase === "results") this.advance();
      else if (this.state.phase === "scoreboard")
        this.continueAfterScoreboard();
      this.broadcast();
    } else if (Date.now() % 5000 < 500) this.broadcast();
  }
  private beginReveal() {
    CardGameEngine.autoSubmit(
      this.state.game!,
      this.currentRound(),
      this.state.players,
    );
    CardGameEngine.beginReveal(this.state.game!);
    this.state.phase = "reveal";
    const count = this.state.game!.revealOrder.length,
      round = this.currentRound();
    this.setDeadline(
      round.revealStyle === "one-at-a-time"
        ? Math.max(1, count) * round.revealTimeSeconds
        : round.revealTimeSeconds,
    );
  }
  private beginJudging() {
    this.state.phase = "judging";
    this.setDeadline(this.currentRound().judgeTimeSeconds);
  }
  private chooseRandomWinner() {
    const choices = Object.keys(this.state.game!.submissions),
      winner = choices[Math.floor(Math.random() * choices.length)];
    if (winner)
      CardGameEngine.chooseWinner(
        this.state.game!,
        winner,
        this.currentRound().winnerPoints,
      );
    this.state.phase = "results";
    this.setDeadline(this.currentRound().resultsTimeSeconds);
  }
  private advance() {
    const game = this.state.game!,
      round = this.currentRound();
    if (isGameComplete(this.state.settings, game)) {
      this.state.phase = "finished";
      this.state.phaseEndsAt = undefined;
    } else if (game.handIndex + 1 < round.hands) {
      if (this.state.settings.showScoreboardAfterEachHand) {
        this.state.phase = "scoreboard";
        this.setDeadline(this.state.settings.scoreboardTimeSeconds);
      } else this.prepareNextHand();
    } else {
      this.state.phase = "scoreboard";
      this.setDeadline(this.state.settings.scoreboardTimeSeconds);
    }
  }
  private continueAfterScoreboard() {
    const game = this.state.game!;
    if (game.handIndex + 1 < this.currentRound().hands) this.prepareNextHand();
    else this.beginNextStage();
  }
  private prepareNextHand() {
    const round = this.currentRound();
    CardGameEngine.prepareNextHand(this.state.game!, round, this.state.players);
    this.state.phase = "answering";
    this.setDeadline(round.answerTimeSeconds);
  }
  private beginNextStage() {
    const previous = this.state.game!,
      index = nextStageIndex(this.state.settings, previous.roundIndex),
      round = this.state.settings.rounds[index];
    let seats = this.state.players.filter((player) => !player.spectator).length;
    this.state.players.forEach((player) => {
      if (
        player.waitingForNextStage &&
        seats < this.state.settings.maxPlayers
      ) {
        player.spectator = false;
        player.waitingForNextStage = false;
        seats += 1;
      }
    });
    this.state.game = CardGameEngine.createStage(
      round,
      this.state.players,
      this.activePacks(),
      previous.scores,
      previous.totalHandIndex + 1,
      previous.reactionTotals,
    );
    this.state.game.roundIndex = index;
    this.state.phase = "answering";
    this.setDeadline(round.answerTimeSeconds);
  }
  private currentRound() {
    return this.state.settings.rounds[this.state.game!.roundIndex];
  }
  private removePlayerFromGame(playerId: string) {
    const game = this.state.game;
    if (!game) return;
    delete game.hands[playerId];
    delete game.submissions[playerId];
    delete game.scores[playerId];
    delete game.reactions[playerId];
    delete game.reactionTotals[playerId];
    game.lockedPlayerIds = game.lockedPlayerIds.filter(
      (id) => id !== playerId,
    );
    game.revealOrder = game.revealOrder.filter((id) => id !== playerId);
    Object.values(game.reactions).forEach((reactions) => {
      const remaining = reactions.filter(
        (reaction) => reaction.targetPlayerId !== playerId,
      );
      reactions.splice(0, reactions.length, ...remaining);
    });
    if (game.winnerId === playerId) game.winnerId = undefined;
    if (game.judgeId !== playerId) return;
    const replacement = this.state.players.find(
      (player) => !player.spectator && player.connected,
    );
    game.judgeId = replacement?.id ?? "host";
    if (
      this.state.phase === "answering" &&
      !this.currentRound().allowJudgeToSubmit
    ) {
      delete game.submissions[game.judgeId];
      game.lockedPlayerIds = game.lockedPlayerIds.filter(
        (id) => id !== game.judgeId,
      );
    }
  }
  private activePacks() {
    return this.packs.filter((pack) =>
      this.state.selectedPackIds.includes(pack.id),
    );
  }
  private setDeadline(seconds: number) {
    this.state.phaseEndsAt = Date.now() + seconds * 1000;
  }
  private cleanProfile(profile: ProfilePayload): ProfilePayload {
    return {
      name:
        String(profile.name || "Player")
          .trim()
          .slice(0, NAME_MAX_LENGTH) || "Player",
      avatar: String(profile.avatar || "✦"),
      avatarColor: /^#[0-9a-f]{6}$/i.test(profile.avatarColor)
        ? profile.avatarColor
        : "#ffc83d",
      spectator: Boolean(profile.spectator),
    };
  }
  private viewFor(playerId: string): LobbySnapshot {
    const snapshot = structuredClone(this.state);
    snapshot.serverTime = Date.now();
    if (snapshot.game) {
      snapshot.game.hands = Object.fromEntries(
        Object.entries(snapshot.game.hands).map(([id, cards]) => [
          id,
          id === playerId ? cards : [],
        ]),
      );
      if (snapshot.phase === "answering")
        snapshot.game.submissions =
          playerId === "host"
            ? snapshot.game.submissions
            : Object.fromEntries(
                Object.entries(snapshot.game.submissions).filter(
                  ([id]) => id === playerId,
                ),
              );
    }
    return snapshot;
  }
  private broadcast() {
    this.emit(this.viewFor("host"));
    this.connections.forEach((connection, connectionId) => {
      if (connection.open)
        connection.send({
          type: "SNAPSHOT",
          payload: this.viewFor(
            this.connectionPlayers.get(connectionId) ?? connectionId,
          ),
        } satisfies HostEvent);
    });
  }
}

export class ClientSession extends GameSession {
  private connection?: DataConnection;
  private readonly roomPeerId: string;
  private readonly profile: ProfilePayload;
  private retry?: number;
  private explicitlyLeft = false;
  private readonly resumeToken: string;
  private playerId: string;
  constructor(code: string, profile: ProfilePayload) {
    super();
    this.profile = profile;
    this.roomPeerId = `${PREFIX}${code.trim().toUpperCase()}`;
    this.resumeToken = getResumeToken(code.trim().toUpperCase());
    this.playerId = `${PREFIX}seat-${this.resumeToken}`;
    this.createPeer();
  }
  override get localPlayerId() {
    return this.playerId;
  }
  submitCards(cardIds: string[], blankAnswers: Record<string, string> = {}) {
    this.send({ type: "SUBMIT_CARDS", payload: { cardIds, blankAnswers } });
  }
  unlockCards() {
    this.send({ type: "UNLOCK_CARDS" });
  }
  chooseWinner(playerId: string) {
    this.send({ type: "CHOOSE_WINNER", payload: { playerId } });
  }
  react(targetPlayerId: string, reaction: ReactionId) {
    this.send({ type: "REACT", payload: { targetPlayerId, reaction } });
  }
  updateProfile(profile: ProfilePayload) {
    Object.assign(this.profile, profile);
    this.send({ type: "UPDATE_PROFILE", payload: profile });
  }
  leave() {
    this.explicitlyLeft = true;
    this.send({ type: "LEAVE" });
    this.destroy();
  }
  private createPeer() {
    this.peer = new Peer(makeClientId(), getPeerOptions());
    this.peer.on("open", () => this.connect());
    this.peer.on("disconnected", () => this.scheduleReconnect());
    this.peer.on("error", (error) => {
      if (
        [
          "network",
          "socket-error",
          "socket-closed",
          "server-error",
          "peer-unavailable",
        ].includes(error.type)
      )
        this.scheduleReconnect();
      else this.fail(error.message);
    });
  }
  private connect() {
    if (this.explicitlyLeft || !this.peer || this.connection?.open) return;
    this.setStatus(
      this.connectionState === "connected" ? "connected" : "connecting",
    );
    const connection = this.peer.connect(this.roomPeerId, { reliable: true });
    this.connection = connection;
    connection.on("open", () => {
      if (connection !== this.connection) return;
      if (this.retry) clearTimeout(this.retry);
      this.retry = undefined;
      this.setStatus("connected");
      connection.send({
        type: "JOIN",
        payload: {
          profile: this.profile,
          resumeToken: this.resumeToken,
          playerId: this.playerId,
        },
      } satisfies ClientCommand);
      connection.send({ type: "REQUEST_SNAPSHOT" } satisfies ClientCommand);
    });
    connection.on("data", (data) => {
      const event = data as HostEvent;
      if (event.type === "SNAPSHOT") this.emit(event.payload);
      else if (event.type === "ASSIGNED_PLAYER")
        this.playerId = event.payload.playerId;
      else if (event.type === "KICKED") {
        this.explicitlyLeft = true;
        this.setStatus("disconnected");
        this.fail(event.payload.reason);
        window.setTimeout(() => connection.close(), 0);
      } else this.fail(event.payload.reason);
    });
    connection.on("close", () => this.scheduleReconnect());
    connection.on("error", () => this.scheduleReconnect());
  }
  private scheduleReconnect() {
    if (this.explicitlyLeft || this.retry) return;
    this.setStatus("reconnecting");
    this.retry = window.setTimeout(() => {
      this.retry = undefined;
      if (!this.peer || this.peer.destroyed) {
        this.createPeer();
        return;
      }
      if (this.peer.disconnected) {
        try {
          this.peer.reconnect();
        } catch {
          this.peer.destroy();
          this.createPeer();
        }
        this.scheduleReconnect();
        return;
      }
      if (this.peer.open) this.connect();
      if (!this.connection?.open) this.scheduleReconnect();
    }, 1800);
  }
  private send(command: ClientCommand) {
    if (this.connection?.open) this.connection.send(command);
  }
  override destroy() {
    if (this.retry) clearTimeout(this.retry);
    super.destroy();
  }
}
