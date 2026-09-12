import defaultPackResource from "../resources/default-pack.json";
import defaultSettingsResource from "../resources/default-settings.json";
import type { CardPack, GameSettings, RoundSettings } from "./types";
import { cardsToPick } from "./cardRules";

const clone = <T>(value: T): T => structuredClone(value);
export const starterPack = {
  ...(clone(defaultPackResource) as CardPack),
  blackCards: defaultPackResource.blackCards.map((card) => ({
    ...card,
    pick: cardsToPick(card.text),
  })),
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
