export const AVATARS = [
  "✦",
  "★",
  "●",
  "◆",
  "■",
  "▲",
  "♥",
  "☀",
  "☾",
  "☁",
  "♬",
  "♠",
  "♣",
  "♦",
  "✿",
  "☂",
  "☃",
  "◎",
  "◉",
  "⬢",
  "✈",
  "☯",
  "∞",
  "π",
  "λ",
  "?",
  "!",
] as const;
export type Avatar = string;
export const NAME_MAX_LENGTH = 20;
export const REACTIONS = [
  { id: "brilliant", label: "Brilliant" },
  { id: "great-move", label: "Great Move" },
  { id: "best-move", label: "Best Move" },
  { id: "excellent", label: "Excellent" },
  { id: "good", label: "Good" },
  { id: "book", label: "Book" },
  { id: "inaccuracy", label: "Inaccuracy" },
  { id: "mistake", label: "Mistake" },
  { id: "miss", label: "Miss" },
  { id: "blunder", label: "Blunder" },
] as const;
export type ReactionId = (typeof REACTIONS)[number]["id"];
export type Reaction = { targetPlayerId: string; reaction: ReactionId };
export type ReactionLimit = number | "unlimited";
export type WinCondition =
  | { type: "all-stages" }
  | { type: "round-count"; target: number }
  | { type: "score-target"; target: number };

export type BlackCard = { id: string; text: string; pick: number };
export type WhiteCard = { id: string; text: string; blank?: boolean };
export type CardPack = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  blackCards: BlackCard[];
  whiteCards: WhiteCard[];
  createdAt: string;
  updatedAt: string;
};

export type JudgeStrategy = "rotate" | "random" | "previous-winner";
export type RevealStyle = "all-at-once" | "one-at-a-time";
export type RoundSettings = {
  id: string;
  name: string;
  hands: number;
  handSize: number;
  winnerPoints: number;
  judgeStrategy: JudgeStrategy;
  answerTimeSeconds: number;
  judgeTimeSeconds: number;
  resultsTimeSeconds: number;
  revealStyle: RevealStyle;
  revealTimeSeconds: number;
  endAnsweringWhenAllPlayed: boolean;
  anonymousSubmissions: boolean;
  allowJudgeToSubmit: boolean;
  allowBlankCards: boolean;
  packIds: string[];
};
export type GameSettings = {
  schemaVersion: 1;
  id: string;
  name: string;
  maxPlayers: number;
  allowSpectators: boolean;
  lateJoin: boolean;
  takeoverDisconnectedPlayers: boolean;
  fullRoomFallback: "spectator" | "reject";
  winCondition: WinCondition;
  scoreboardTimeSeconds: number;
  showScoreboardAfterEachHand: boolean;
  maxReactionsPerPlayer: ReactionLimit;
  maxReactionsPerTarget: ReactionLimit;
  reactionPoints: Record<ReactionId, number>;
  rounds: RoundSettings[];
};
export type Player = {
  id: string;
  name: string;
  avatar: Avatar;
  avatarColor: string;
  connected: boolean;
  spectator: boolean;
  isHost: boolean;
  waitingForNextHand?: boolean;
};
export type Submission = { playerId: string; cards: WhiteCard[] };
export type GameRuntime = {
  roundIndex: number;
  handIndex: number;
  totalHandIndex: number;
  judgeId: string;
  blackCard: BlackCard;
  hands: Record<string, WhiteCard[]>;
  submissions: Record<string, WhiteCard[]>;
  lockedPlayerIds: string[];
  revealOrder: string[];
  winnerId?: string;
  scores: Record<string, number>;
  reactions: Record<string, Reaction[]>;
  reactionTotals: Record<string, Partial<Record<ReactionId, number>>>;
  whiteDeck: WhiteCard[];
  blackDeck: BlackCard[];
  whiteDiscard: WhiteCard[];
  blackDiscard: BlackCard[];
};
export type LobbySnapshot = {
  roomCode: string;
  players: Player[];
  settings: GameSettings;
  selectedPackIds: string[];
  phase:
    | "lobby"
    | "answering"
    | "reveal"
    | "judging"
    | "results"
    | "scoreboard"
    | "finished";
  game?: GameRuntime;
  phaseEndsAt?: number;
  serverTime: number;
};
export type ProfilePayload = {
  name: string;
  avatar: Avatar;
  avatarColor: string;
  spectator: boolean;
};
export type ClientCommand =
  | {
      type: "JOIN";
      payload: {
        profile: ProfilePayload;
        resumeToken: string;
        playerId?: string;
      };
    }
  | { type: "UPDATE_PROFILE"; payload: ProfilePayload }
  | { type: "LEAVE" }
  | {
      type: "SUBMIT_CARDS";
      payload: { cardIds: string[]; blankAnswers: Record<string, string> };
    }
  | { type: "UNLOCK_CARDS" }
  | { type: "CHOOSE_WINNER"; payload: { playerId: string } }
  | {
      type: "REACT";
      payload: { targetPlayerId: string; reaction: ReactionId };
    }
  | { type: "REQUEST_SNAPSHOT" };
export type HostEvent =
  | { type: "SNAPSHOT"; payload: LobbySnapshot }
  | { type: "ASSIGNED_PLAYER"; payload: { playerId: string } }
  | { type: "KICKED"; payload: { reason: string } }
  | { type: "REJECTED"; payload: { reason: string } };
