import defaultPackResource from "../resources/default-pack.json";
import defaultSettingsResource from "../resources/default-settings.json";
import type { CardPack, GameSettings, RoundSettings } from "./types";
import { cardsToPick } from "./cardRules";

const clone = <T>(value: T): T => structuredClone(value);
const prepareBuiltInPack = (resource: unknown): CardPack => {
  const pack = clone(resource) as CardPack;
  return {
    ...pack,
    blackCards: (pack.blackCards ?? []).map((card) => ({
      ...card,
      pick: cardsToPick(card.text),
    })),
    whiteCards: pack.whiteCards ?? [],
  };
};

export const starterPack = prepareBuiltInPack(defaultPackResource);

const expansionModules = import.meta.glob(
  "../resources/default-expansions/*.cards.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

export const defaultExpansionPacks = Object.values(expansionModules)
  .map(prepareBuiltInPack)
  .sort((left, right) => left.name.localeCompare(right.name));

export const builtInPacks = [starterPack, ...defaultExpansionPacks];
const builtInPacksById = new Map(builtInPacks.map((pack) => [pack.id, pack]));

export const isBuiltInPack = (id: string) => builtInPacksById.has(id);
export const getBuiltInPack = (id: string) => {
  const pack = builtInPacksById.get(id);
  return pack ? clone(pack) : undefined;
};
export const defaultGameTemplate = clone(
  defaultSettingsResource,
) as GameSettings;
export const createRound = (name = "Card rounds"): RoundSettings => ({
  ...clone(defaultGameTemplate.rounds[0]),
  id: crypto.randomUUID(),
  name,
});
export const createGameSettings = (name = "Custom game"): GameSettings => ({
  ...clone(defaultGameTemplate),
  id: crypto.randomUUID(),
  name,
  rounds: defaultGameTemplate.rounds.map((round) => ({
    ...clone(round),
    id: crypto.randomUUID(),
  })),
});
