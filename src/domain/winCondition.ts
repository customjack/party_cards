import type { GameRuntime, GameSettings } from "./types";

export const isGameComplete = (
  settings: GameSettings,
  game: GameRuntime,
): boolean => {
  const condition = settings.winCondition;
  if (condition.type === "round-count")
    return game.totalHandIndex + 1 >= condition.target;
  if (condition.type === "score-target")
    return Object.values(game.scores).some(
      (score) => score >= condition.target,
    );
  const finalStage = settings.rounds.length - 1;
  return (
    game.roundIndex >= finalStage &&
    game.handIndex + 1 >= settings.rounds[finalStage].hands
  );
};

export const nextStageIndex = (
  settings: GameSettings,
  currentIndex: number,
) => (currentIndex + 1) % settings.rounds.length;
