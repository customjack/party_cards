import {
  builtInPacks,
  defaultGameTemplate,
  getBuiltInPack,
  isBuiltInPack,
} from "../domain/defaults";
import { cardsToPick } from "../domain/cardRules";
import {
  REACTIONS,
  type BlackCard,
  type CardPack,
  type GameSettings,
  type ReactionId,
  type WhiteCard,
} from "../domain/types";

const PACK_KEY = "party-cards-packs-v1",
  SETTINGS_KEY = "party-cards-settings-v1";
const read = <T>(key: string): T[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const write = <T>(key: string, values: T[]) =>
  localStorage.setItem(key, JSON.stringify(values));
const text = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const normalizeBlack = (value: Partial<BlackCard>): BlackCard => {
  const prompt = text(value.text, 300);
  return {
    id: text(value.id, 100) || crypto.randomUUID(),
    text: prompt,
    pick: cardsToPick(prompt),
  };
};
const normalizeWhite = (value: Partial<WhiteCard> | string): WhiteCard => ({
  id:
    typeof value === "string"
      ? crypto.randomUUID()
      : text(value.id, 100) || crypto.randomUUID(),
  text: text(typeof value === "string" ? value : value.text, 180),
  blank: typeof value === "string" ? false : Boolean(value.blank),
});
export const normalizePack = (value: Partial<CardPack>): CardPack => {
  const builtIn = value.id ? getBuiltInPack(value.id) : undefined;
  if (builtIn) return builtIn;
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: text(value.id, 100) || crypto.randomUUID(),
    name: text(value.name, 60) || "Untitled pack",
    description: text(value.description, 240),
    author: text(value.author, 40),
    tags: Array.isArray(value.tags)
      ? value.tags
          .map((tag) => text(tag, 30))
          .filter(Boolean)
          .slice(0, 12)
      : [],
    blackCards: Array.isArray(value.blackCards)
      ? value.blackCards.map(normalizeBlack).filter((card) => card.text)
      : [],
    whiteCards: Array.isArray(value.whiteCards)
      ? value.whiteCards
          .map(normalizeWhite)
          .filter((card) => card.blank || card.text)
      : [],
    createdAt: value.createdAt || now,
    updatedAt: now,
  };
};
export const normalizeSettings = (
  value: Partial<GameSettings>,
): GameSettings => {
  if (value.id === defaultGameTemplate.id)
    return structuredClone(defaultGameTemplate);
  const fallback = defaultGameTemplate.rounds[0];
  return {
    ...structuredClone(defaultGameTemplate),
    ...value,
    schemaVersion: 1,
    id: text(value.id, 100) || crypto.randomUUID(),
    name: text(value.name, 60) || "Custom game",
    maxPlayers: Math.max(2, Number(value.maxPlayers) || 12),
    winCondition:
      value.winCondition?.type === "round-count" ||
      value.winCondition?.type === "score-target"
        ? {
            type: value.winCondition.type,
            target: Math.max(1, Math.floor(Number(value.winCondition.target) || 1)),
          }
        : { type: "all-stages" },
    showScoreboardAfterEachHand:
      value.showScoreboardAfterEachHand ??
      defaultGameTemplate.showScoreboardAfterEachHand,
    maxReactionsPerPlayer:
      value.maxReactionsPerPlayer == null
        ? defaultGameTemplate.maxReactionsPerPlayer
        : value.maxReactionsPerPlayer === "unlimited" ||
            Number(value.maxReactionsPerPlayer) <= 0
          ? "unlimited"
          : Math.max(1, Number(value.maxReactionsPerPlayer)),
    maxReactionsPerTarget:
      value.maxReactionsPerTarget == null
        ? defaultGameTemplate.maxReactionsPerTarget
        : value.maxReactionsPerTarget === "unlimited" ||
            Number(value.maxReactionsPerTarget) <= 0
          ? "unlimited"
          : Math.max(1, Number(value.maxReactionsPerTarget)),
    reactionPoints: Object.fromEntries(
      REACTIONS.map(({ id }) => [
        id,
        Number(value.reactionPoints?.[id as ReactionId]) || 0,
      ]),
    ) as GameSettings["reactionPoints"],
    rounds: Array.isArray(value.rounds)
      ? value.rounds.map((round) => ({
          ...structuredClone(fallback),
          ...round,
          id: round.id || crypto.randomUUID(),
          allowBlankCards: round.allowBlankCards ?? true,
        }))
      : [],
  };
};
export class PackRepository {
  all() {
    return [
      ...structuredClone(builtInPacks),
      ...read<CardPack>(PACK_KEY)
        .filter((pack) => !isBuiltInPack(pack.id))
        .map(normalizePack),
    ];
  }
  save(pack: CardPack) {
    if (isBuiltInPack(pack.id)) return;
    const packs = read<CardPack>(PACK_KEY),
      normalized = normalizePack(pack),
      index = packs.findIndex((item) => item.id === pack.id);
    if (index >= 0) packs[index] = normalized;
    else packs.push(normalized);
    write(PACK_KEY, packs);
  }
  remove(id: string) {
    if (!isBuiltInPack(id))
      write(
        PACK_KEY,
        read<CardPack>(PACK_KEY).filter((pack) => pack.id !== id),
      );
  }
  import(value: unknown) {
    const pack = normalizePack({
      ...(value as CardPack),
      id: crypto.randomUUID(),
    });
    this.save(pack);
    return pack;
  }
}
export class SettingsRepository {
  all() {
    return [
      structuredClone(defaultGameTemplate),
      ...read<GameSettings>(SETTINGS_KEY).map(normalizeSettings),
    ];
  }
  save(settings: GameSettings) {
    if (settings.id === defaultGameTemplate.id) return;
    const items = read<GameSettings>(SETTINGS_KEY),
      normalized = normalizeSettings(settings),
      index = items.findIndex((item) => item.id === settings.id);
    if (index >= 0) items[index] = normalized;
    else items.push(normalized);
    write(SETTINGS_KEY, items);
  }
  remove(id: string) {
    if (id !== defaultGameTemplate.id)
      write(
        SETTINGS_KEY,
        read<GameSettings>(SETTINGS_KEY).filter((item) => item.id !== id),
      );
  }
  import(value: unknown) {
    const settings = normalizeSettings({
      ...(value as GameSettings),
      id: crypto.randomUUID(),
    });
    this.save(settings);
    return settings;
  }
}
export function downloadJson(filename: string, value: unknown) {
  const link = document.createElement("a"),
    blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    });
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
export async function readJson(file: File) {
  return JSON.parse(await file.text()) as unknown;
}
