import { describe, expect, it } from "vitest";
import { defaultGameTemplate } from "../domain/defaults";
import { SettingsValidator } from "../domain/validation";
import { normalizeSettings } from "./storage";

describe("discard settings compatibility", () => {
  it("adds defaults to older saved and imported stages", () => {
    const legacy = JSON.parse(JSON.stringify(defaultGameTemplate));
    legacy.id = "legacy";
    delete legacy.rounds[0].maxDiscardsPerTurn;
    delete legacy.rounds[0].maxDiscardsPerStage;
    const stage = normalizeSettings(legacy).rounds[0];
    expect(stage.maxDiscardsPerTurn).toBe(1);
    expect(stage.maxDiscardsPerStage).toBe("unlimited");
  });

  it("preserves explicit disabled limits and rejects invalid limits", () => {
    const settings = structuredClone(defaultGameTemplate);
    settings.id = "custom";
    settings.rounds[0].maxDiscardsPerTurn = 0;
    settings.rounds[0].maxDiscardsPerStage = 0;
    expect(normalizeSettings(settings).rounds[0]).toEqual(settings.rounds[0]);
    for (const limit of [-1, 0.5, NaN, Infinity]) {
      const issues = SettingsValidator.validateRound(
        { ...settings.rounds[0], maxDiscardsPerTurn: limit },
        3,
      );
      expect(issues.some((issue) => issue.level === "error")).toBe(true);
    }
  });
});

describe("reaction timing settings compatibility", () => {
  it("defaults older rules to no reactions after reveal", () => {
    const legacy = JSON.parse(JSON.stringify(defaultGameTemplate));
    legacy.id = "legacy";
    delete legacy.allowReactionsAfterReveal;
    expect(normalizeSettings(legacy).rounds[0].allowReactionsAfterReveal).toBe(
      false,
    );
  });

  it.each([false, true])("preserves an explicit setting of %s", (enabled) => {
    const settings = {
      ...structuredClone(defaultGameTemplate),
      id: "custom",
      rounds: defaultGameTemplate.rounds.map((round) => ({
        ...round,
        allowReactionsAfterReveal: enabled,
      })),
    };
    expect(
      normalizeSettings(settings).rounds[0].allowReactionsAfterReveal,
    ).toBe(enabled);
  });
});

describe("stage reaction migration and pack selection", () => {
  it("migrates old global reaction settings to every stage without overwriting stage overrides", () => {
    const legacy = JSON.parse(JSON.stringify(defaultGameTemplate));
    legacy.id = "legacy-scoring";
    legacy.reactionPoints = { brilliant: 5, blunder: -2 };
    legacy.maxReactionsPerPlayer = 3;
    legacy.maxReactionsPerTarget = 2;
    legacy.allowReactionsAfterReveal = true;
    for (const key of [
      "reactionPoints",
      "maxReactionsPerPlayer",
      "maxReactionsPerTarget",
      "allowReactionsAfterReveal",
      "useAllPacks",
    ])
      delete legacy.rounds[0][key];
    legacy.rounds.push({
      ...legacy.rounds[0],
      id: "second",
      reactionPoints: { brilliant: 0 },
      allowReactionsAfterReveal: false,
    });
    const migrated = normalizeSettings(legacy);
    expect(migrated.rounds[0].reactionPoints.brilliant).toBe(5);
    expect(migrated.rounds[0].reactionPoints.blunder).toBe(-2);
    expect(migrated.rounds[1].reactionPoints.brilliant).toBe(0);
    expect(migrated.rounds[0].allowReactionsAfterReveal).toBe(true);
    expect(migrated.rounds[1].allowReactionsAfterReveal).toBe(false);
    expect(migrated.rounds[1].maxReactionsPerPlayer).toBe(3);
    expect(migrated).not.toHaveProperty("reactionPoints");
    expect(migrated.rounds[0].useAllPacks).toBe(true);
    expect(migrated.maxSpectators).toBe(64);
    expect(migrated.allowSpectatorReactions).toBe(true);
  });

  it("preserves an explicitly empty pack pool and a zero spectator limit", () => {
    const settings = structuredClone(defaultGameTemplate);
    settings.id = "no-packs";
    settings.maxSpectators = 0;
    settings.allowSpectatorReactions = false;
    settings.rounds[0].useAllPacks = false;
    settings.rounds[0].packIds = [];
    const normalized = normalizeSettings(settings);
    expect(normalized.maxSpectators).toBe(0);
    expect(normalized.allowSpectatorReactions).toBe(false);
    expect(normalized.rounds[0].useAllPacks).toBe(false);
    expect(normalized.rounds[0].packIds).toEqual([]);
  });
});
