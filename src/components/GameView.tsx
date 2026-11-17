import {
  Check,
  Crown,
  Lock,
  Trash2,
  Trophy,
  Pause,
  SmilePlus,
  Unlock,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  REACTIONS,
  type GameRuntime,
  type LobbySnapshot,
  type ReactionId,
  type WhiteCard,
} from "../domain/types";
import {
  ClientSession,
  HostSession,
  type ConnectionState,
} from "../network/session";
import { canReactDuringPhase } from "../domain/reactionRules";
import { CardGameEngine } from "../domain/gameEngine";
import { isTimerPaused, timerSeconds } from "../domain/timer";
import { AdminControls } from "./AdminControls";
import { Avatar } from "./Avatar";
import { ReactionIcon } from "../resources/ReactionIcon";

function useCountdown(snapshot: LobbySnapshot) {
  const [offset, setOffset] = useState(snapshot.serverTime - Date.now()),
    [now, setNow] = useState(Date.now());
  useEffect(
    () =>
      setOffset((old) => old * 0.7 + (snapshot.serverTime - Date.now()) * 0.3),
    [snapshot.serverTime],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return timerSeconds(snapshot, now + offset);
}
const renderPrompt = (value: string) =>
  value.split("____").map((part, index, all) => (
    <span key={index}>
      {part}
      {index < all.length - 1 && <u>________</u>}
    </span>
  ));

export function GameView({
  snapshot,
  session,
  isHost,
  connectionState,
  onLeave,
}: {
  snapshot: LobbySnapshot;
  session: HostSession | ClientSession;
  isHost: boolean;
  connectionState: ConnectionState;
  onLeave: () => void;
}) {
  const game = snapshot.game!,
    round = snapshot.settings.rounds[game.roundIndex],
    me = snapshot.players.find((player) => player.id === session.localPlayerId),
    judge = snapshot.players.find((player) => player.id === game.judgeId),
    seconds = useCountdown(snapshot),
    [discardMode, setDiscardMode] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({}),
    [reactionMenuTarget, setReactionMenuTarget] = useState<string | null>(null);
  useEffect(() => {
    setDiscardMode(false);
    setSelected([]);
    setBlankAnswers({});
    setReactionMenuTarget(null);
  }, [game.totalHandIndex, me?.id]);
  const ranking = Object.entries(game.scores).sort(
    (left, right) => right[1] - left[1],
  );
  const stopGame = () => {
    if (
      isHost &&
      confirm(
        "Stop this game and return everyone to the lobby? Current scores and hands will be cleared. Room settings and players will be kept.",
      )
    )
      (session as HostSession).stopGame();
  };
  const kickPlayer = (playerId: string) => {
    const player = snapshot.players.find((item) => item.id === playerId);
    if (
      isHost &&
      player &&
      !player.isHost &&
      confirm(`Remove “${player.name}” from the game?`)
    )
      (session as HostSession).kickPlayer(playerId);
  };
  if (snapshot.phase === "finished")
    return (
      <main className="center-page finish-page">
        <div className="winner-burst">♣ ♦ ♠ ♥</div>
        <span className="eyebrow">FINAL SCORES</span>
        <h1>
          {snapshot.players.find((player) => player.id === ranking[0]?.[0])
            ?.name ?? "Nobody"}{" "}
          wins
        </h1>
        <Leaderboard
          ranking={ranking}
          players={snapshot.players}
          reactionTotals={game.reactionTotals}
        />
        <div className="button-row">
          <button className="button secondary" onClick={onLeave}>
            Back home
          </button>
          {isHost && (
            <button
              className="button primary"
              onClick={() => (session as HostSession).playAgain()}
            >
              Play again
            </button>
          )}
        </div>
      </main>
    );
  if (snapshot.phase === "scoreboard") {
    const stageComplete = game.handIndex + 1 >= round.hands;
    return (
      <main className="game-page scoreboard-page">
        <Header
          snapshot={snapshot}
          seconds={seconds}
          connectionState={connectionState}
          onKick={isHost ? kickPlayer : undefined}
          onStop={isHost ? stopGame : undefined}
          adminSession={isHost ? (session as HostSession) : undefined}
        />
        <section className="play-card scoreboard-card">
          <span className="eyebrow">
            {stageComplete
              ? `STAGE ${game.roundIndex + 1} COMPLETE`
              : `HAND ${game.handIndex + 1} COMPLETE`}
          </span>
          <h1>Score update</h1>
          <Leaderboard
            ranking={ranking}
            players={snapshot.players}
            reactionTotals={game.reactionTotals}
          />
          <p>
            {stageComplete ? "Next stage" : "Next hand"} starts automatically.
          </p>
        </section>
      </main>
    );
  }
  const eligible =
      !me?.spectator && (round.allowJudgeToSubmit || me?.id !== game.judgeId),
    locked = Boolean(me && game.lockedPlayerIds.includes(me.id)),
    hand = me ? (game.hands[me.id] ?? []) : [];
  const remainingDiscards = me
    ? CardGameEngine.remainingDiscards(game, round, me.id)
    : 0;
  const selectionLimit = discardMode
    ? Math.min(
        remainingDiscards,
        Math.max(0, hand.length - game.blackCard.pick),
      )
    : game.blackCard.pick;
  const toggleCard = (cardId: string) =>
    setSelected((items) =>
      selectionLimit === 0
        ? []
        : items.includes(cardId)
          ? items.filter((id) => id !== cardId)
          : items.length < selectionLimit
            ? [...items, cardId]
            : [...items.slice(1), cardId],
    );
  const selectedBlanksAreReady = selected.every((id) => {
    const card = hand.find((item) => item.id === id);
    return !card?.blank || Boolean(blankAnswers[id]?.trim());
  });
  if (snapshot.phase === "answering")
    return (
      <main className="game-page cards-game-page">
        <Header
          snapshot={snapshot}
          seconds={seconds}
          connectionState={connectionState}
          onKick={isHost ? kickPlayer : undefined}
          onStop={isHost ? stopGame : undefined}
          adminSession={isHost ? (session as HostSession) : undefined}
        />
        <PlayerProgress snapshot={snapshot} />
        <section className="table-stage">
          <BlackCardView
            text={game.blackCard.text}
            pick={game.blackCard.pick}
            judge={judge?.name}
          />
          {me && !me.spectator ? (
            <>
              <div className="hand-heading">
                <div>
                  <span className="eyebrow">YOUR HAND</span>
                  <h2>
                    {locked
                      ? "Cards locked in"
                      : discardMode
                        ? "Choose cards to discard"
                        : eligible
                          ? `Choose ${game.blackCard.pick}`
                          : "You’re the Card Judge"}
                  </h2>
                </div>
                {!locked && (
                  <button
                    className="button secondary"
                    disabled={
                      !discardMode &&
                      (remainingDiscards === 0 ||
                        hand.length <= game.blackCard.pick)
                    }
                    onClick={() => {
                      setDiscardMode(!discardMode);
                      setSelected([]);
                    }}
                  >
                    <Trash2 />{" "}
                    {discardMode ? "Cancel discard" : "Discard cards"}
                  </button>
                )}
                {locked && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      isHost
                        ? (session as HostSession).unlockCards("host")
                        : (session as ClientSession).unlockCards()
                    }
                  >
                    <Unlock /> Edit again
                  </button>
                )}
              </div>
              <p className="discard-help">
                {remainingDiscards} discard{remainingDiscards === 1 ? "" : "s"}{" "}
                left this turn
                {round.maxDiscardsPerStage !== "unlimited" &&
                  ` · ${Math.max(0, round.maxDiscardsPerStage - (game.discardsThisStage[me.id] ?? 0))} left this stage`}
                . Replacements arrive next hand. Keep at least{" "}
                {game.blackCard.pick} card{game.blackCard.pick === 1 ? "" : "s"}
                .
              </p>
              <div className={`card-hand ${locked ? "locked" : ""}`}>
                {hand.map((card) =>
                  (() => {
                    const submitted = (game.submissions[me!.id] ?? []).map(
                      (item) => item.id,
                    );
                    const order = (locked ? submitted : selected).indexOf(
                      card.id,
                    );
                    if (card.blank) {
                      const submittedText = game.submissions[me!.id]?.find(
                        (item) => item.id === card.id,
                      )?.text;
                      return (
                        <div
                          className={`white-card blank-white-card ${order >= 0 ? "selected" : ""}`}
                          key={card.id}
                        >
                          {order >= 0 && game.blackCard.pick > 1 && (
                            <span className="selection-order">{order + 1}</span>
                          )}
                          <small>BLANK CARD</small>
                          <textarea
                            aria-label="Custom blank-card response"
                            disabled={locked || discardMode || !eligible}
                            maxLength={180}
                            placeholder="Write anything…"
                            value={submittedText ?? blankAnswers[card.id] ?? ""}
                            onChange={(event) =>
                              setBlankAnswers((answers) => ({
                                ...answers,
                                [card.id]: event.target.value,
                              }))
                            }
                          />
                          {!locked && (
                            <button
                              className="blank-card-select"
                              disabled={!eligible && !discardMode}
                              onClick={() => toggleCard(card.id)}
                            >
                              {order >= 0
                                ? "Deselect card"
                                : discardMode
                                  ? "Discard this card"
                                  : "Use this card"}
                            </button>
                          )}
                        </div>
                      );
                    }
                    return (
                      <button
                        className={`white-card ${order >= 0 ? "selected" : ""}`}
                        disabled={locked || (!eligible && !discardMode)}
                        key={card.id}
                        onClick={() => toggleCard(card.id)}
                      >
                        {order >= 0 && game.blackCard.pick > 1 && (
                          <span className="selection-order">{order + 1}</span>
                        )}
                        {card.text}
                      </button>
                    );
                  })(),
                )}
              </div>
              {!locked && discardMode && (
                <button
                  className="button secondary big"
                  disabled={
                    selected.length === 0 || selected.length > selectionLimit
                  }
                  onClick={() => {
                    isHost
                      ? (session as HostSession).discardCards("host", selected)
                      : (session as ClientSession).discardCards(selected);
                    setSelected([]);
                    setDiscardMode(false);
                  }}
                >
                  <Trash2 /> Discard {selected.length} card
                  {selected.length === 1 ? "" : "s"}
                </button>
              )}
              {!locked && !discardMode && eligible && (
                <button
                  className="button primary big"
                  disabled={
                    selected.length !== game.blackCard.pick ||
                    !selectedBlanksAreReady
                  }
                  onClick={() =>
                    isHost
                      ? (session as HostSession).submitCards(
                          "host",
                          selected,
                          blankAnswers,
                        )
                      : (session as ClientSession).submitCards(
                          selected,
                          blankAnswers,
                        )
                  }
                >
                  <Lock /> Play {game.blackCard.pick} card
                  {game.blackCard.pick === 1 ? "" : "s"}
                </button>
              )}
            </>
          ) : (
            <div className="judge-wait">
              <Crown />
              <h2>
                {me?.spectator ? "You’re spectating" : "You’re the Card Judge"}
              </h2>
              <p>Everyone else is choosing cards.</p>
            </div>
          )}
        </section>
      </main>
    );
  const submissions = game.revealOrder
      .map((id) => ({ id, cards: game.submissions[id] }))
      .filter((entry) => entry.cards?.length),
    isJudge = me?.id === game.judgeId,
    showAuthor = snapshot.phase === "results" || !round.anonymousSubmissions,
    myReactions = me ? (game.reactions[me.id] ?? []) : [];
  const withinReactionLimit = (
    limit: typeof round.maxReactionsPerPlayer,
    count: number,
  ) => limit === "unlimited" || count < limit;
  const react = (targetPlayerId: string, reaction: ReactionId) => {
    if (!me) return;
    isHost
      ? (session as HostSession).react("host", targetPlayerId, reaction)
      : (session as ClientSession).react(targetPlayerId, reaction);
    setReactionMenuTarget(null);
  };
  return (
    <main className="game-page cards-game-page">
      <Header
        snapshot={snapshot}
        seconds={seconds}
        connectionState={connectionState}
        onKick={isHost ? kickPlayer : undefined}
        onStop={isHost ? stopGame : undefined}
        adminSession={isHost ? (session as HostSession) : undefined}
      />
      <section className="table-stage">
        <BlackCardView
          text={game.blackCard.text}
          pick={game.blackCard.pick}
          judge={judge?.name}
        />
        <span className="eyebrow phase-label">
          {snapshot.phase === "reveal"
            ? "REVEALING ANSWERS"
            : snapshot.phase === "judging"
              ? `${judge?.name ?? "The judge"} IS CHOOSING`
              : "WINNER"}
        </span>
        <div className="submission-grid">
          {submissions.map((submission, index) => {
            const reactionCounts = REACTIONS.map((reaction) => ({
              ...reaction,
              count: Object.values(game.reactions)
                .flat()
                .filter(
                  (item) =>
                    item.targetPlayerId === submission.id &&
                    item.reaction === reaction.id,
                ).length,
            })).filter((reaction) => reaction.count);
            const reactionsForCard = myReactions.filter(
              (reaction) => reaction.targetPlayerId === submission.id,
            ).length;
            const canReact =
              canReactDuringPhase(snapshot.phase, round) &&
              me &&
              (!me.spectator || snapshot.settings.allowSpectatorReactions) &&
              submission.id !== me.id &&
              withinReactionLimit(
                round.maxReactionsPerPlayer,
                myReactions.length,
              ) &&
              withinReactionLimit(
                round.maxReactionsPerTarget,
                reactionsForCard,
              );
            return (
              <article
                className={`submission-stack ${game.winnerId === submission.id ? "winner" : ""}`}
                style={{
                  animationDelay:
                    snapshot.phase === "reveal" &&
                    round.revealStyle === "one-at-a-time"
                      ? `${index * round.revealTimeSeconds}s`
                      : "0s",
                }}
                key={submission.id}
              >
                <button
                  className="submission-choice"
                  disabled={snapshot.phase !== "judging" || !isJudge}
                  onClick={() =>
                    isHost
                      ? (session as HostSession).chooseWinner(
                          "host",
                          submission.id,
                        )
                      : (session as ClientSession).chooseWinner(submission.id)
                  }
                >
                  {submission.cards.map(
                    (card: WhiteCard, cardIndex: number) => (
                      <span
                        className={`white-card ${submission.cards.length > 1 ? "ordered-played-card" : ""}`}
                        key={card.id}
                      >
                        {submission.cards.length > 1 && (
                          <span className="played-order">{cardIndex + 1}</span>
                        )}
                        {card.text}
                      </span>
                    ),
                  )}
                  {showAuthor && (
                    <b>
                      {snapshot.players.find(
                        (player) => player.id === submission.id,
                      )?.name ?? "Player"}
                    </b>
                  )}
                  {snapshot.phase === "judging" && isJudge && (
                    <em>Choose winner</em>
                  )}
                  {game.winnerId === submission.id && (
                    <strong>
                      +{round.winnerPoints} point
                      {round.winnerPoints === 1 ? "" : "s"}
                    </strong>
                  )}
                </button>
                {canReact && (
                  <>
                    <button
                      className="reaction-trigger"
                      aria-expanded={reactionMenuTarget === submission.id}
                      aria-label="Add reaction"
                      title="Add reaction"
                      onClick={() =>
                        setReactionMenuTarget((target) =>
                          target === submission.id ? null : submission.id,
                        )
                      }
                    >
                      <SmilePlus />
                    </button>
                    {reactionMenuTarget === submission.id && (
                      <div
                        className="reaction-menu"
                        aria-label="Choose a reaction"
                      >
                        {REACTIONS.map((reaction) => {
                          const points = round.reactionPoints[reaction.id];
                          const pointLabel = `${points > 0 ? "+" : ""}${points} ${Math.abs(points) === 1 ? "point" : "points"}`;
                          const label = `${reaction.label}: ${pointLabel} for this player`;
                          const scoringEnabled = Object.values(
                            round.reactionPoints,
                          ).some((value) => value !== 0);
                          return (
                            <button
                              className={
                                scoringEnabled ? "scored-reaction" : undefined
                              }
                              title={label}
                              aria-label={label}
                              key={reaction.id}
                              onClick={() => react(submission.id, reaction.id)}
                            >
                              <ReactionIcon reaction={reaction.id} />
                              {scoringEnabled && (
                                <small className="reaction-points">
                                  {points > 0 ? "+" : ""}
                                  {points}
                                </small>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
                {reactionCounts.length > 0 && (
                  <div className="reaction-summary">
                    {reactionCounts.map((reaction) => (
                      <span title={reaction.label} key={reaction.id}>
                        <ReactionIcon reaction={reaction.id} />
                        {reaction.count}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {snapshot.phase === "reveal" && (
          <p className="wait-message">Read the cards. Judging opens next.</p>
        )}
        {snapshot.phase === "judging" && !isJudge && (
          <p className="wait-message">The judge is choosing a winner.</p>
        )}
        {snapshot.phase === "results" && (
          <p className="wait-message">Next hand starts automatically.</p>
        )}
      </section>
    </main>
  );
}
function Header({
  snapshot,
  seconds,
  connectionState,
  onKick,
  onStop,
  adminSession,
}: {
  snapshot: LobbySnapshot;
  seconds: number | null;
  connectionState: ConnectionState;
  onKick?: (playerId: string) => void;
  onStop?: () => void;
  adminSession?: HostSession;
}) {
  const scoreboard = useRef<HTMLDialogElement>(null);
  const paused = isTimerPaused(snapshot);
  return (
    <header className="game-header">
      <b>PARTY CARDS</b>
      <span>{snapshot.settings.rounds[snapshot.game!.roundIndex].name}</span>
      <span className={`game-connection ${connectionState}`}>
        <i />
        {connectionState.toUpperCase()}
      </span>
      {seconds !== null && (
        <strong
          className={
            paused ? "timer paused" : seconds <= 10 ? "timer urgent" : "timer"
          }
          aria-label={`${paused ? "Timer paused, " : ""}${seconds} seconds remaining`}
        >
          {paused && (
            <>
              <Pause size={16} aria-hidden="true" /> Paused ·{" "}
            </>
          )}
          {seconds}
        </strong>
      )}
      <span>ROOM {snapshot.roomCode}</span>
      <button
        className="scoreboard-trigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => scoreboard.current?.showModal()}
      >
        <Trophy aria-hidden="true" /> Scoreboard
      </button>
      {adminSession && onStop && onKick && (
        <AdminControls
          snapshot={snapshot}
          session={adminSession}
          onStop={onStop}
          onKick={onKick}
        />
      )}
      <dialog
        ref={scoreboard}
        className="scoreboard-dialog"
        aria-labelledby="scoreboard-title"
      >
        <div className="section-heading">
          <h2 id="scoreboard-title">Scoreboard</h2>
          <button
            className="button secondary"
            onClick={() => scoreboard.current?.close()}
            aria-label="Close scoreboard"
            autoFocus
          >
            <X />
          </button>
        </div>
        <p>Live scores · Play continues while this is open.</p>
        <Leaderboard
          ranking={Object.entries(snapshot.game!.scores).sort(
            (left, right) => right[1] - left[1],
          )}
          players={snapshot.players}
          reactionTotals={snapshot.game!.reactionTotals}
        />
      </dialog>
    </header>
  );
}
function BlackCardView({
  text,
  pick,
  judge,
}: {
  text: string;
  pick: number;
  judge?: string;
}) {
  return (
    <article className="black-card">
      <small>PARTY CARDS · PICK {pick}</small>
      <h1>{renderPrompt(text)}</h1>
      <footer>
        <Crown /> {judge ?? "Judge"}
      </footer>
    </article>
  );
}
function PlayerProgress({ snapshot }: { snapshot: LobbySnapshot }) {
  const game = snapshot.game!,
    round = snapshot.settings.rounds[game.roundIndex];
  return (
    <div className="player-progress">
      {snapshot.players
        .filter(
          (player) =>
            !player.spectator &&
            (round.allowJudgeToSubmit || player.id !== game.judgeId),
        )
        .map((player) => {
          const ready = game.lockedPlayerIds.includes(player.id);
          return (
            <div
              className={`player-status ${ready ? "done" : "working"}`}
              key={player.id}
            >
              <Avatar
                name={player.avatar}
                color={player.avatarColor}
                size="sm"
              />
              <span className="player-status-copy">
                <b>{player.name}</b>
                <small>{ready ? "Ready" : "Choosing cards"}</small>
              </span>
              {ready && <Check aria-hidden />}
            </div>
          );
        })}
    </div>
  );
}
function Leaderboard({
  ranking,
  players,
  reactionTotals,
}: {
  ranking: [string, number][];
  players: LobbySnapshot["players"];
  reactionTotals: GameRuntime["reactionTotals"];
}) {
  return (
    <div className="leaderboard">
      {ranking.map(([id, score], index) => (
        <div className={index === 0 ? "winner" : ""} key={id}>
          <span>{index + 1}</span>
          <div className="leaderboard-player">
            <b>
              {players.find((player) => player.id === id)?.name ?? "Player"}
            </b>
            <ReactionBreakdown totals={reactionTotals[id]} />
          </div>
          <strong>{score}</strong>
        </div>
      ))}
    </div>
  );
}

function ReactionBreakdown({
  totals = {},
}: {
  totals?: Partial<Record<ReactionId, number>>;
}) {
  const reactions = REACTIONS.filter((reaction) => totals[reaction.id]);
  return (
    <div className="final-reactions" aria-label="Reactions received">
      {reactions.length ? (
        reactions.map((reaction) => (
          <span title={reaction.label} key={reaction.id}>
            <ReactionIcon reaction={reaction.id} />
            <b>{totals[reaction.id]}</b>
          </span>
        ))
      ) : (
        <small>No reactions</small>
      )}
    </div>
  );
}
