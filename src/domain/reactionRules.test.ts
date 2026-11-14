import { describe, expect, it } from "vitest";
import { defaultGameTemplate } from "./defaults";
import { canReactDuringPhase } from "./reactionRules";
import type { LobbySnapshot } from "./types";

const phases: LobbySnapshot["phase"][] = [
  "lobby",
  "answering",
  "reveal",
  "judging",
  "results",
  "scoreboard",
  "finished",
];

describe("reaction timing", () => {
  it.each(phases)("only allows reveal by default (phase: %s)", (phase) => {
    expect(defaultGameTemplate.allowReactionsAfterReveal).toBe(false);
    expect(canReactDuringPhase(phase, defaultGameTemplate)).toBe(
      phase === "reveal",
    );
  });

  it.each(phases)(
    "optionally allows judging and results (phase: %s)",
    (phase) => {
      expect(
        canReactDuringPhase(phase, { allowReactionsAfterReveal: true }),
      ).toBe(["reveal", "judging", "results"].includes(phase));
    },
  );
});
