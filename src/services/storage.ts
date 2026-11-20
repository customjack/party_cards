import { databaseRead, databaseWrite, databaseDelete } from "./database";
import { validImageData } from "./images";
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
  type RoundSettings,
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
    pick: value.imageId
      ? Math.max(
          1,
          Math.min(10, Math.floor(Number(value.pick)) || cardsToPick(prompt)),
        )
      : cardsToPick(prompt),
    ...(value.imageId
      ? {
          imageId: text(value.imageId, 200),
          imageAlt: text(value.imageAlt, 300),
        }
      : {}),
  };
};
const normalizeWhite = (value: Partial<WhiteCard> | string): WhiteCard => ({
  id:
    typeof value === "string"
      ? crypto.randomUUID()
      : text(value.id, 100) || crypto.randomUUID(),
  text: text(typeof value === "string" ? value : value.text, 180),
  blank: typeof value === "string" ? false : Boolean(value.blank),
  ...(typeof value !== "string" && value.imageId && !value.blank
    ? { imageId: text(value.imageId, 200), imageAlt: text(value.imageAlt, 300) }
    : {}),
});
export const normalizePack = (value: Partial<CardPack>): CardPack => {
  const builtIn = value.id ? getBuiltInPack(value.id) : undefined;
  if (builtIn) return builtIn;
  const now = new Date().toISOString();
  const images: Record<string, string> = {};
  const canonical = new Map<string, string>();
  const normalizeImage = <T extends BlackCard | WhiteCard>(card: T): T => {
    if (!card.imageId) return card;
    const data = value.images?.[card.imageId];
    if (!validImageData(data))
      throw new Error(
        `Missing or unsupported image for card: ${card.text || card.id}`,
      );
    const id = canonical.get(data) ?? card.imageId;
    canonical.set(data, id);
    Object.defineProperty(images, id, {
      value: data,
      enumerable: true,
      configurable: true,
    });
    return { ...card, imageId: id };
  };
  const blackCards = Array.isArray(value.blackCards)
    ? value.blackCards
        .map(normalizeBlack)
        .map(normalizeImage)
        .filter((card) => card.text || card.imageId)
    : [];
  const whiteCards = Array.isArray(value.whiteCards)
    ? value.whiteCards
        .map(normalizeWhite)
        .map(normalizeImage)
        .filter((card) => card.blank || card.text || card.imageId)
    : [];
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
    blackCards,
    whiteCards,
    ...(Object.keys(images).length ? { images } : {}),
    createdAt: value.createdAt || now,
    updatedAt: now,
  };
};
export const normalizeSettings = (
  value: Partial<GameSettings> &
    Partial<
      Pick<
        RoundSettings,
        | "reactionPoints"
        | "maxReactionsPerPlayer"
        | "maxReactionsPerTarget"
        | "allowReactionsAfterReveal"
      >
    >,
): GameSettings => {
  if (value.id === defaultGameTemplate.id)
    return structuredClone(defaultGameTemplate);
  const fallback = defaultGameTemplate.rounds[0];
  const {
    reactionPoints,
    maxReactionsPerPlayer,
    maxReactionsPerTarget,
    allowReactionsAfterReveal,
    ...current
  } = value;
  const limit = (
    value: RoundSettings["maxReactionsPerPlayer"] | undefined,
    fallback: RoundSettings["maxReactionsPerPlayer"],
  ) =>
    value == null
      ? fallback
      : value === "unlimited" || Number(value) <= 0
        ? "unlimited"
        : Math.max(1, Math.floor(Number(value)) || 1);
  return {
    ...structuredClone(defaultGameTemplate),
    ...current,
    schemaVersion: 1,
    id: text(value.id, 100) || crypto.randomUUID(),
    name: text(value.name, 60) || "Custom game",
    maxPlayers: Math.max(2, Number(value.maxPlayers) || 12),
    winCondition:
      value.winCondition?.type === "round-count" ||
      value.winCondition?.type === "score-target"
        ? {
            type: value.winCondition.type,
            target: Math.max(
              1,
              Math.floor(Number(value.winCondition.target) || 1),
            ),
          }
        : { type: "all-stages" },
    showScoreboardAfterEachHand:
      value.showScoreboardAfterEachHand ??
      defaultGameTemplate.showScoreboardAfterEachHand,
    maxSpectators: Number.isFinite(value.maxSpectators)
      ? Math.max(0, Math.floor(value.maxSpectators!))
      : 64,
    allowSpectatorReactions: value.allowSpectatorReactions ?? true,
    rounds: Array.isArray(value.rounds)
      ? value.rounds.map((round) => ({
          ...structuredClone(fallback),
          ...round,
          id: round.id || crypto.randomUUID(),
          allowBlankCards: round.allowBlankCards ?? true,
          keepHandFromPreviousStage: round.keepHandFromPreviousStage ?? true,
          useAllPacks: round.useAllPacks ?? !round.packIds?.length,
          allowReactionsAfterReveal:
            round.allowReactionsAfterReveal ??
            allowReactionsAfterReveal ??
            false,
          maxReactionsPerPlayer: limit(
            round.maxReactionsPerPlayer ?? maxReactionsPerPlayer,
            fallback.maxReactionsPerPlayer,
          ),
          maxReactionsPerTarget: limit(
            round.maxReactionsPerTarget ?? maxReactionsPerTarget,
            fallback.maxReactionsPerTarget,
          ),
          reactionPoints: Object.fromEntries(
            REACTIONS.map(({ id }) => [
              id,
              Number(
                round.reactionPoints?.[id as ReactionId] ??
                  reactionPoints?.[id as ReactionId],
              ) || 0,
            ]),
          ) as RoundSettings["reactionPoints"],
          maxDiscardsPerTurn:
            round.maxDiscardsPerTurn ?? fallback.maxDiscardsPerTurn,
          maxDiscardsPerStage:
            round.maxDiscardsPerStage ?? fallback.maxDiscardsPerStage,
        }))
      : [],
  };
};
export class PackRepository {
  private packs: CardPack[] = [];
  private loading?: Promise<void>;
  load() {
    return (this.loading ??= this.initialize().catch((error) => {
      this.loading = undefined;
      throw error;
    }));
  }
  private async initialize() {
    const stored = await databaseRead<CardPack[]>("packs");
    const legacy = read<CardPack>(PACK_KEY).filter(
      (pack) => !isBuiltInPack(pack.id),
    );
    for (const pack of legacy) {
      if (!stored.some((item) => item.id === pack.id)) {
        const normalized = normalizePack(pack);
        await databaseWrite("packs", normalized);
        stored.push(normalized);
      }
    }
    // Remove the old copy only after every migration write has committed.
    if (legacy.length) localStorage.removeItem(PACK_KEY);
    this.packs = stored
      .filter((pack) => !isBuiltInPack(pack.id))
      .map(normalizePack);
  }
  all() {
    return [...structuredClone(builtInPacks), ...structuredClone(this.packs)];
  }
  async save(pack: CardPack) {
    if (isBuiltInPack(pack.id)) return;
    await this.load();
    const normalized = normalizePack(pack);
    await databaseWrite("packs", normalized);
    this.packs = [
      ...this.packs.filter((item) => item.id !== pack.id),
      normalized,
    ];
  }
  async remove(id: string) {
    if (isBuiltInPack(id)) return;
    await this.load();
    await databaseDelete("packs", id);
    this.packs = this.packs.filter((pack) => pack.id !== id);
  }
  async import(value: unknown) {
    const pack = normalizePack({
      ...(value as CardPack),
      id: crypto.randomUUID(),
    });
    await this.save(pack);
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
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
export async function readJson(file: File) {
  return JSON.parse(await file.text()) as unknown;
}
