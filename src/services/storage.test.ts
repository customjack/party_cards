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
