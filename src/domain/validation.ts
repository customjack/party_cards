import type { CardPack, GameSettings, RoundSettings } from "./types";
export type ValidationIssue = { level: "error" | "warning"; message: string };
export class SettingsValidator {
  static validateRound(
    round: RoundSettings,
    players: number,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (round.hands < 1)
      issues.push({
        level: "error",
        message: "A stage needs at least one hand.",
      });
    if (round.handSize < 2)
      issues.push({
        level: "error",
        message: "Hand size must be at least two.",
      });
    if (players < 3 && !round.allowJudgeToSubmit)
      issues.push({
        level: "warning",
        message: "Three or more players works best when the judge sits out.",
      });
    return issues;
  }
  static validateGame(
    settings: GameSettings,
    players: number,
    packs: CardPack[],
  ): ValidationIssue[] {
    const issues = settings.rounds.flatMap((round, index) =>
      this.validateRound(round, players).map((issue) => ({
        ...issue,
        message: `Stage ${index + 1}: ${issue.message}`,
      })),
    );
    if (!settings.rounds.length)
      issues.push({ level: "error", message: "Add at least one stage." });
    if (!packs.length)
      issues.push({
        level: "error",
        message: "Select at least one card pack.",
      });
    if (packs.length && !packs.some((pack) => pack.blackCards.length))
      issues.push({
        level: "error",
        message: "The selected packs have no black cards.",
      });
    if (packs.length && !packs.some((pack) => pack.whiteCards.length))
      issues.push({
        level: "error",
        message: "The selected packs have no white cards.",
      });
    if (players > settings.maxPlayers)
      issues.push({
        level: "error",
        message: "The lobby exceeds the player limit.",
      });
    const available = new Set(packs.map((pack) => pack.id));
    settings.rounds.forEach((round, index) => {
      if (
        round.packIds.length &&
        !round.packIds.some((id) => available.has(id))
      )
        issues.push({
          level: "error",
          message: `Stage ${index + 1} has no available pack.`,
        });
    });
    return issues;
  }
}
