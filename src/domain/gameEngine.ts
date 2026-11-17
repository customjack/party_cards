import type {
  BlackCard,
  CardPack,
  GameRuntime,
  Player,
  ReactionId,
  ReactionLimit,
  RoundSettings,
  WhiteCard,
} from "./types";

export class CardGameEngine {
  static createStage(
    round: RoundSettings,
    players: Player[],
    packs: CardPack[],
    previousScores: Record<string, number> = {},
    totalHandIndex = 0,
    previousReactionTotals: GameRuntime["reactionTotals"] = {},
    previousScoreHistory: GameRuntime["scoreHistory"] = [],
    previousGame?: GameRuntime,
    cycleIndex = 0,
  ): GameRuntime {
    const active = players.filter((player) => !player.spectator),
      allowedPacks = packs.filter(
        (pack) => round.useAllPacks || round.packIds.includes(pack.id),
      ),
      blackPool = this.mergePackCards(
        allowedPacks,
        (pack) => pack.blackCards,
        (card) => this.cardTextKey(card.text),
      ),
      whitePool = this.mergePackCards(
        allowedPacks,
        (pack) => pack.whiteCards,
        (card) =>
          card.blank ? "__blank_response__" : this.cardTextKey(card.text),
      ),
      retainedHands =
        round.keepHandFromPreviousStage && previousGame
          ? Object.fromEntries(
              players.map((player) => [
                player.id,
                structuredClone(
                  (previousGame.hands[player.id] ?? []).filter(
                    (card) =>
                      !(previousGame.submissions[player.id] ?? []).some(
                        (played) => played.id === card.id,
                      ),
                  ),
                ),
              ]),
            )
          : {},
      retainedIds = new Set(
        Object.values(retainedHands)
          .flat()
          .map((card) => card.id),
      ),
      allowedWhiteCards = whitePool.filter(
        (card) => round.allowBlankCards || !card.blank,
      ),
      blackDeck = this.shuffle(blackPool),
      whiteDeck = this.shuffle(
        allowedWhiteCards.filter((card) => !retainedIds.has(card.id)),
      ),
      game: GameRuntime = {
        scoreHistory: structuredClone(previousScoreHistory),
        cycleIndex,
        allowedWhiteCardIds: allowedWhiteCards.map((card) => card.id),
        roundIndex: 0,
        handIndex: 0,
        totalHandIndex,
        judgeId:
          active[totalHandIndex % Math.max(1, active.length)]?.id ?? "host",
        blackCard: blackDeck.pop() ?? this.fallbackBlack(),
        hands: {
          ...Object.fromEntries(active.map((player) => [player.id, []])),
          ...retainedHands,
        },
        submissions: {},
        lockedPlayerIds: [],
        discardsThisTurn: {},
        discardsThisStage: {},
        revealOrder: [],
        scores: {
          ...previousScores,
          ...Object.fromEntries(
            active.map((player) => [player.id, previousScores[player.id] ?? 0]),
          ),
        },
        reactions: {},
        reactionTotals: {
          ...structuredClone(previousReactionTotals),
          ...Object.fromEntries(
            active.map((player) => [
              player.id,
              structuredClone(previousReactionTotals[player.id] ?? {}),
            ]),
          ),
        },
        whiteDeck,
        blackDeck,
        whiteDiscard: [],
        blackDiscard: [],
      };
    active.forEach((player) => {
      this.refillHand(
        game,
        player.id,
        Math.max(round.handSize, game.blackCard.pick),
      );
    });
    if (!game.scoreHistory.length)
      game.scoreHistory.push({
        turn: totalHandIndex,
        cycleIndex,
        roundIndex: 0,
        roundStartTurn: totalHandIndex + 1,
        scores: { ...game.scores },
        names: Object.fromEntries(players.map((p) => [p.id, p.name])),
      });
    return game;
  }

  static submit(
    game: GameRuntime,
    playerId: string,
    cardIds: string[],
    blankAnswers: Record<string, string> = {},
  ) {
    const hand = game.hands[playerId] ?? [],
      unique = [...new Set(cardIds)],
      cards = unique
        .map((id) => hand.find((card) => card.id === id))
        .filter(Boolean) as WhiteCard[];
    if (cards.length !== game.blackCard.pick) return false;
    const resolved = cards.map((card) =>
      card.blank
        ? {
            ...card,
            text: String(blankAnswers[card.id] ?? "")
              .trim()
              .slice(0, 180),
          }
        : card,
    );
    if (resolved.some((card) => !card.text)) return false;
    game.submissions[playerId] = resolved;
    if (!game.lockedPlayerIds.includes(playerId))
      game.lockedPlayerIds.push(playerId);
    return true;
  }

  static remainingDiscards(
    game: GameRuntime,
    round: RoundSettings,
    playerId: string,
  ) {
    return Math.max(
      0,
      Math.min(
        round.maxDiscardsPerTurn - (game.discardsThisTurn[playerId] ?? 0),
        round.maxDiscardsPerStage === "unlimited"
          ? Infinity
          : round.maxDiscardsPerStage - (game.discardsThisStage[playerId] ?? 0),
      ),
    );
  }

  static discard(
    game: GameRuntime,
    round: RoundSettings,
    playerId: string,
    cardIds: string[],
  ) {
    const hand = game.hands[playerId];
    if (
      !hand ||
      !Array.isArray(cardIds) ||
      !cardIds.length ||
      new Set(cardIds).size !== cardIds.length ||
      game.lockedPlayerIds.includes(playerId) ||
      cardIds.length > this.remainingDiscards(game, round, playerId) ||
      hand.length - cardIds.length < game.blackCard.pick ||
      cardIds.some((id) => !hand.some((card) => card.id === id))
    )
      return false;
    game.whiteDiscard.push(...hand.filter((card) => cardIds.includes(card.id)));
    game.hands[playerId] = hand.filter((card) => !cardIds.includes(card.id));
    game.discardsThisTurn[playerId] =
      (game.discardsThisTurn[playerId] ?? 0) + cardIds.length;
    game.discardsThisStage[playerId] =
      (game.discardsThisStage[playerId] ?? 0) + cardIds.length;
    return true;
  }

  static unlock(game: GameRuntime, playerId: string) {
    delete game.submissions[playerId];
    game.lockedPlayerIds = game.lockedPlayerIds.filter((id) => id !== playerId);
  }

  static eligibleSubmitters(
    game: GameRuntime,
    round: RoundSettings,
    players: Player[],
  ) {
    return players
      .filter(
        (player) =>
          !player.spectator &&
          player.connected &&
          (round.allowJudgeToSubmit || player.id !== game.judgeId),
      )
      .map((player) => player.id);
  }

  static autoSubmit(
    game: GameRuntime,
    round: RoundSettings,
    players: Player[],
  ) {
    this.eligibleSubmitters(game, round, players).forEach((id) => {
      if (!game.lockedPlayerIds.includes(id)) {
        const preferred = [...(game.hands[id] ?? [])].sort(
          (left, right) => Number(left.blank) - Number(right.blank),
        );
        const selected = preferred.slice(0, game.blackCard.pick);
        this.submit(
          game,
          id,
          selected.map((card) => card.id),
          Object.fromEntries(
            selected
              .filter((card) => card.blank)
              .map((card) => [card.id, "No response."]),
          ),
        );
      }
    });
  }

  static beginReveal(game: GameRuntime) {
    game.revealOrder = this.shuffle(Object.keys(game.submissions));
  }

  static chooseWinner(game: GameRuntime, playerId: string, points: number) {
    if (!game.submissions[playerId]) return false;
    game.winnerId = playerId;
    game.scores[playerId] = (game.scores[playerId] ?? 0) + points;
    return true;
  }

  static react(
    game: GameRuntime,
    reactorId: string,
    targetPlayerId: string,
    reaction: ReactionId,
    points = 0,
    totalLimit: ReactionLimit = "unlimited",
    targetLimit: ReactionLimit = 1,
  ) {
    const given = game.reactions[reactorId] ?? [];
    const within = (limit: ReactionLimit, count: number) =>
      limit === "unlimited" || count < limit;
    if (
      reactorId === targetPlayerId ||
      !within(totalLimit, given.length) ||
      !within(
        targetLimit,
        given.filter((item) => item.targetPlayerId === targetPlayerId).length,
      ) ||
      !game.submissions[targetPlayerId]
    )
      return false;
    game.reactions[reactorId] = [...given, { targetPlayerId, reaction }];
    const totals = (game.reactionTotals[targetPlayerId] ??= {});
    totals[reaction] = (totals[reaction] ?? 0) + 1;
    game.scores[targetPlayerId] = (game.scores[targetPlayerId] ?? 0) + points;
    return true;
  }

  static prepareNextHand(
    game: GameRuntime,
    round: RoundSettings,
    players: Player[],
  ) {
    const previousJudge = game.judgeId,
      previousWinner = game.winnerId,
      active = players.filter((player) => !player.spectator),
      ids = active.map((player) => player.id);
    Object.entries(game.submissions).forEach(([playerId, cards]) => {
      const hand = game.hands[playerId] ?? [];
      game.whiteDiscard.push(
        ...hand.filter((card) => cards.some((played) => played.id === card.id)),
      );
      game.hands[playerId] = hand.filter(
        (card) => !cards.some((played) => played.id === card.id),
      );
    });
    game.blackDiscard.push(game.blackCard);
    game.handIndex += 1;
    game.totalHandIndex += 1;
    if (
      round.judgeStrategy === "previous-winner" &&
      previousWinner &&
      ids.includes(previousWinner)
    )
      game.judgeId = previousWinner;
    else if (round.judgeStrategy === "random") {
      const choices = ids.filter((id) => id !== previousJudge);
      game.judgeId =
        choices[Math.floor(Math.random() * choices.length)] ?? ids[0] ?? "host";
    } else {
      const index = Math.max(0, ids.indexOf(previousJudge));
      game.judgeId = ids[(index + 1) % Math.max(1, ids.length)] ?? "host";
    }
    game.blackCard = this.drawBlack(game);
    game.submissions = {};
    game.lockedPlayerIds = [];
    game.revealOrder = [];
    game.winnerId = undefined;
    game.reactions = {};
    game.discardsThisTurn = {};
    active.forEach((player) => {
      game.scores[player.id] ??= 0;
      game.reactionTotals[player.id] ??= {};
      this.refillHand(
        game,
        player.id,
        Math.max(round.handSize, game.blackCard.pick),
      );
    });
  }

  private static refillHand(game: GameRuntime, playerId: string, size: number) {
    const hand = (game.hands[playerId] ??= []);
    while (hand.length < size) {
      if (!game.whiteDeck.length) {
        game.whiteDeck = this.shuffle(
          game.whiteDiscard.filter((card) =>
            game.allowedWhiteCardIds.includes(card.id),
          ),
        );
        game.whiteDiscard = [];
      }
      const card = game.whiteDeck.pop();
      if (!card) break;
      hand.push(card);
    }
  }

  private static drawBlack(game: GameRuntime): BlackCard {
    if (!game.blackDeck.length) {
      game.blackDeck = this.shuffle(game.blackDiscard);
      game.blackDiscard = [];
    }
    return game.blackDeck.pop() ?? this.fallbackBlack();
  }

  private static fallbackBlack(): BlackCard {
    return { id: crypto.randomUUID(), text: "The answer is ____.", pick: 1 };
  }

  private static mergePackCards<T extends { id: string }>(
    packs: CardPack[],
    cardsForPack: (pack: CardPack) => T[],
    duplicateKey: (card: T) => string,
  ): T[] {
    const priorPackKeys = new Set<string>();
    return packs.flatMap((pack) => {
      const keysBeforeThisPack = new Set(priorPackKeys);
      // Use original pack positions so card identities survive pool/filter changes.
      const cards = cardsForPack(pack)
        .map((card, index) => ({
          ...card,
          id: `${pack.id}:${card.id}:${index}`,
        }))
        .filter((card) => !keysBeforeThisPack.has(duplicateKey(card)));
      cards.forEach((card) => priorPackKeys.add(duplicateKey(card)));
      return cards;
    });
  }

  private static cardTextKey(text: string) {
    return text.trim().replace(/\s+/g, " ").toLowerCase();
  }

  static shuffle<T>(items: T[]) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }
}
