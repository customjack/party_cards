import { describe, expect, it } from "vitest";
import { defaultGameTemplate, starterPack } from "./defaults";
import { SettingsValidator } from "./validation";

describe("stage pack pools", () => {
  it("names every stage without enabled packs, including room-disabled selections", () => {
    const settings = structuredClone(defaultGameTemplate);
    settings.rounds = [
      {
        ...settings.rounds[0],
        name: "Warmup",
        useAllPacks: false,
        packIds: [],
      },
      {
        ...settings.rounds[0],
        id: "final",
        name: "Final",
        useAllPacks: false,
        packIds: ["disabled-room-pack"],
      },
    ];
    const issues = SettingsValidator.validateGame(settings, 3, [starterPack]);
    const emptyPools = issues.filter((issue) =>
      issue.message.includes("no enabled pack pool"),
    );
    expect(emptyPools).toHaveLength(2);
    expect(emptyPools.every((issue) => issue.level === "error")).toBe(true);
    expect(emptyPools[0].message).toContain("Stage 1 (Warmup)");
    expect(emptyPools[1].message).toContain("Stage 2 (Final)");
  });

  it("blocks all inherited stage pools if all room packs are disabled", () => {
    const issues = SettingsValidator.validateGame(defaultGameTemplate, 3, []);
    expect(
      issues.some((issue) => issue.message.includes("no enabled pack pool")),
    ).toBe(true);
  });

  it("accepts selected enabled packs and stage reaction points as a way to win", () => {
    const settings = structuredClone(defaultGameTemplate);
    settings.rounds[0].useAllPacks = false;
    settings.rounds[0].packIds = [starterPack.id];
    settings.rounds[0].winnerPoints = 0;
    settings.rounds[0].reactionPoints.brilliant = 2;
    expect(
      SettingsValidator.validateGame(settings, 3, [starterPack]).filter(
        (issue) => issue.level === "error",
      ),
    ).toEqual([]);
  });
});
