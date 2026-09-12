import defaultPackResource from "../resources/default-pack.json";
import defaultSettingsResource from "../resources/default-settings.json";
import type { CardPack, GameSettings, RoundSettings } from "./types";

const clone = <T>(value: T): T => structuredClone(value);
export const starterPack = clone(defaultPackResource) as CardPack;
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
