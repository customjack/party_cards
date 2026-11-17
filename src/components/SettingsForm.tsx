import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createRound } from "../domain/defaults";
import {
  REACTIONS,
  type CardPack,
  type GameSettings,
  type ReactionLimit,
  type RoundSettings,
} from "../domain/types";
import { PackSelector } from "./PackSelector";
import { ReactionIcon } from "../resources/ReactionIcon";

// Keep unfinished edits local so clearing a field doesn't insert 0 or its minimum.
function NumberInput({
  value,
  min = 0,
  placeholder,
  allowEmpty = false,
  onChange,
}: {
  value: number | "";
  min?: number;
  placeholder?: string;
  allowEmpty?: boolean;
  onChange: (value: number | "") => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={min}
      placeholder={placeholder}
      value={draft ?? value}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const next = Number(text);
        if (text !== "" && Number.isFinite(next) && next >= min) onChange(next);
      }}
      onBlur={(event) => {
        const text = event.target.value;
        if (text === "") {
          if (allowEmpty && !event.target.validity.badInput) onChange("");
        } else {
          const next = Number(text);
          if (Number.isFinite(next)) onChange(Math.max(min, next));
        }
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

const NumberField = ({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) => (
  <label className="mini-field">
    <span>{label}</span>
    <NumberInput
      min={min}
      value={value}
      onChange={(next) => {
        if (next !== "") onChange(next);
      }}
    />
  </label>
);
const Toggle = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <label className="toggle-row">
    <span>
      <b>{label}</b>
      {hint && <small>{hint}</small>}
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);
const ReactionLimitField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ReactionLimit;
  onChange: (value: ReactionLimit) => void;
}) => (
  <label className="mini-field">
    <span>
      {label} <small>0 = unlimited</small>
    </span>
    <NumberInput
      min={0}
      value={value === "unlimited" ? 0 : value}
      onChange={(next) => {
        if (next === "") return;
        onChange(next === 0 ? "unlimited" : next);
      }}
    />
  </label>
);

export function SettingsForm({
  settings,
  packs,
  onChange,
  locked = false,
}: {
  settings: GameSettings;
  packs: CardPack[];
  onChange: (settings: GameSettings) => void;
  locked?: boolean;
}) {
  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) =>
    onChange({ ...settings, [key]: value });
  const setRound = (index: number, round: RoundSettings) =>
    set(
      "rounds",
      settings.rounds.map((item, itemIndex) =>
        itemIndex === index ? round : item,
      ),
    );
  return (
    <fieldset className="rules-fieldset" disabled={locked}>
      <section className="panel general-settings">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ROOM</span>
            <h2>Game settings</h2>
          </div>
        </div>
        <div className="settings-grid">
          <label className="field">
            <span>Settings name</span>
            <input
              value={settings.name}
              onChange={(event) => set("name", event.target.value.slice(0, 60))}
            />
          </label>
          <NumberField
            label="Maximum players"
            value={settings.maxPlayers}
            min={2}
            onChange={(value) => set("maxPlayers", Math.max(2, value))}
          />
          <NumberField
            label="Maximum spectators"
            value={settings.maxSpectators}
            onChange={(value) =>
              set("maxSpectators", Math.max(0, Math.floor(value)))
            }
          />
          <label className="mini-field">
            <span>Win condition</span>
            <select
              value={settings.winCondition.type}
              onChange={(event) => {
                const type = event.target
                  .value as GameSettings["winCondition"]["type"];
                if (type === "all-stages")
                  set("winCondition", { type: "all-stages" });
                else
                  set("winCondition", {
                    type,
                    target:
                      type === "round-count"
                        ? Math.max(
                            1,
                            settings.rounds.reduce(
                              (sum, round) => sum + round.hands,
                              0,
                            ),
                          )
                        : 10,
                  });
              }}
            >
              <option value="all-stages">Complete all stages</option>
              <option value="round-count">Rounds played</option>
              <option value="score-target">First to a score</option>
            </select>
          </label>
          {settings.winCondition.type !== "all-stages" && (
            <NumberField
              label={
                settings.winCondition.type === "round-count"
                  ? "Rounds to play"
                  : "Points to win"
              }
              value={settings.winCondition.target}
              min={1}
              onChange={(value) => {
                const type = settings.winCondition.type;
                if (type === "all-stages") return;
                set("winCondition", {
                  type,
                  target: Math.max(1, Math.floor(value || 1)),
                });
              }}
            />
          )}
          <NumberField
            label="Scoreboard seconds"
            value={settings.scoreboardTimeSeconds}
            min={2}
            onChange={(value) => set("scoreboardTimeSeconds", value)}
          />
          <label className="mini-field">
            <span>When a player cannot join</span>
            <select
              value={settings.fullRoomFallback}
              onChange={(event) =>
                set(
                  "fullRoomFallback",
                  event.target.value as GameSettings["fullRoomFallback"],
                )
              }
            >
              <option value="spectator">Join as spectator</option>
              <option value="reject">Reject connection</option>
            </select>
          </label>
        </div>
        <div className="toggles">
          <Toggle
            label="Allow spectators"
            checked={settings.allowSpectators}
            onChange={(value) => set("allowSpectators", value)}
          />
          <Toggle
            label="Allow spectators to react"
            checked={settings.allowSpectatorReactions}
            onChange={(value) => set("allowSpectatorReactions", value)}
          />
          <Toggle
            label="Allow players to join active games"
            hint="Late players enter at the next hand."
            checked={settings.lateJoin}
            onChange={(value) => set("lateJoin", value)}
          />
          <Toggle
            label="Reconnect to an existing seat"
            checked={settings.takeoverDisconnectedPlayers}
            onChange={(value) => set("takeoverDisconnectedPlayers", value)}
          />
          <Toggle
            label="Show scoreboard after every hand"
            hint="Otherwise it appears between stages and at the end."
            checked={settings.showScoreboardAfterEachHand}
            onChange={(value) => set("showScoreboardAfterEachHand", value)}
          />
        </div>
      </section>
      <section className="round-settings">
        <div className="section-heading">
          <div>
            <span className="eyebrow">STRUCTURE</span>
            <h2>
              {settings.rounds.length} stage
              {settings.rounds.length === 1 ? "" : "s"}
            </h2>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              set("rounds", [
                ...settings.rounds,
                createRound(`Stage ${settings.rounds.length + 1}`),
              ])
            }
          >
            <Plus /> Add stage
          </button>
        </div>
        <div className="round-list">
          {settings.rounds.map((round, index) => (
            <RoundForm
              key={round.id}
              round={round}
              index={index}
              packs={packs}
              onChange={(value) => setRound(index, value)}
              onDuplicate={() =>
                set("rounds", [
                  ...settings.rounds.slice(0, index + 1),
                  {
                    ...structuredClone(round),
                    id: crypto.randomUUID(),
                    name: `${round.name} copy`,
                  },
                  ...settings.rounds.slice(index + 1),
                ])
              }
              onRemove={() =>
                set(
                  "rounds",
                  settings.rounds.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            />
          ))}
        </div>
      </section>
    </fieldset>
  );
}

function RoundForm({
  round,
  index,
  packs,
  onChange,
  onDuplicate,
  onRemove,
}: {
  round: RoundSettings;
  index: number;
  packs: CardPack[];
  onChange: (round: RoundSettings) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof RoundSettings>(
    key: K,
    value: RoundSettings[K],
  ) => onChange({ ...round, [key]: value });
  return (
    <details className="round-card" open={index === 0}>
      <summary>
        <span className="round-number">{index + 1}</span>
        <div>
          <b>{round.name}</b>
          <small>
            {round.hands} hands · {round.handSize} cards · {round.judgeStrategy}
          </small>
        </div>
        <span className="round-actions">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onDuplicate();
            }}
          >
            <Copy />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onRemove();
            }}
          >
            <Trash2 />
          </button>
        </span>
      </summary>
      <div className="round-body">
        <label className="field">
          <span>Stage name</span>
          <input
            value={round.name}
            onChange={(event) => set("name", event.target.value.slice(0, 60))}
          />
        </label>
        <details className="settings-subsection" open>
          <summary>Cards &amp; judging</summary>
          <div className="settings-grid">
            <NumberField
              label="Hands to play"
              value={round.hands}
              min={1}
              onChange={(value) => set("hands", Math.max(1, value))}
            />
            <NumberField
              label="Cards in each hand"
              value={round.handSize}
              min={2}
              onChange={(value) => set("handSize", Math.max(2, value))}
            />
            <NumberField
              label="Discards per player per turn (0 = disabled)"
              value={round.maxDiscardsPerTurn}
              onChange={(value) =>
                set("maxDiscardsPerTurn", Math.max(0, Math.floor(value)))
              }
            />
            <label className="mini-field">
              <span>Discards per player per stage</span>
              <NumberInput
                min={0}
                allowEmpty
                placeholder="Unlimited"
                value={
                  round.maxDiscardsPerStage === "unlimited"
                    ? ""
                    : round.maxDiscardsPerStage
                }
                onChange={(next) =>
                  set(
                    "maxDiscardsPerStage",
                    next === "" ? "unlimited" : Math.max(0, Math.floor(next)),
                  )
                }
              />
              <small>
                Leave empty for unlimited. Discarded cards refill next hand.
              </small>
            </label>
            <NumberField
              label="Points for winner"
              value={round.winnerPoints}
              min={0}
              onChange={(value) => set("winnerPoints", value)}
            />
            <label className="mini-field">
              <span>Judge selection</span>
              <select
                value={round.judgeStrategy}
                onChange={(event) =>
                  set(
                    "judgeStrategy",
                    event.target.value as RoundSettings["judgeStrategy"],
                  )
                }
              >
                <option value="rotate">Rotate</option>
                <option value="random">Random</option>
                <option value="previous-winner">Previous winner</option>
              </select>
            </label>
          </div>
          <div className="toggles">
            <Toggle
              label="Hide authors until result"
              checked={round.anonymousSubmissions}
              onChange={(value) => set("anonymousSubmissions", value)}
            />
            <Toggle
              label="Allow the judge to submit"
              checked={round.allowJudgeToSubmit}
              onChange={(value) => set("allowJudgeToSubmit", value)}
            />
            <Toggle
              label="Include blank response cards"
              hint="Players can type a custom response when they draw one."
              checked={round.allowBlankCards}
              onChange={(value) => set("allowBlankCards", value)}
            />
            <Toggle
              label="Reveal when everyone submits"
              hint="Turn off to always use the full answer timer."
              checked={round.endAnsweringWhenAllPlayed}
              onChange={(value) => set("endAnsweringWhenAllPlayed", value)}
            />
          </div>
        </details>
        <details className="settings-subsection">
          <summary>Reaction scoring</summary>
          <Toggle
            label="Allow reactions after the winner is revealed"
            hint="Reactions stay open while cards are revealed and the judge chooses. Turn on to also allow reactions during results."
            checked={round.allowReactionsAfterReveal}
            onChange={(value) => set("allowReactionsAfterReveal", value)}
          />
          <p>
            Reactions are always counted. Limits reset for every hand; leave
            point values at zero for cosmetic reactions only.
          </p>
          <div className="settings-grid">
            <ReactionLimitField
              label="Total reactions per player"
              value={round.maxReactionsPerPlayer}
              onChange={(value) => set("maxReactionsPerPlayer", value)}
            />
            <ReactionLimitField
              label="Reactions per card"
              value={round.maxReactionsPerTarget}
              onChange={(value) => set("maxReactionsPerTarget", value)}
            />
          </div>
          <div className="reaction-settings-grid">
            {REACTIONS.map((reaction) => (
              <div className="reaction-setting" key={reaction.id}>
                <ReactionIcon reaction={reaction.id} />
                <NumberField
                  label={reaction.label}
                  value={round.reactionPoints[reaction.id]}
                  min={-999}
                  onChange={(points) =>
                    set("reactionPoints", {
                      ...round.reactionPoints,
                      [reaction.id]: points,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </details>
        <details className="settings-subsection">
          <summary>Timing &amp; reveal</summary>
          <div className="settings-grid">
            <NumberField
              label="Answer seconds"
              value={round.answerTimeSeconds}
              min={5}
              onChange={(value) => set("answerTimeSeconds", value)}
            />
            <NumberField
              label="Judge seconds"
              value={round.judgeTimeSeconds}
              min={5}
              onChange={(value) => set("judgeTimeSeconds", value)}
            />
            <NumberField
              label="Result seconds"
              value={round.resultsTimeSeconds}
              min={2}
              onChange={(value) => set("resultsTimeSeconds", value)}
            />
            <label className="mini-field">
              <span>Reveal style</span>
              <select
                value={round.revealStyle}
                onChange={(event) =>
                  set(
                    "revealStyle",
                    event.target.value as RoundSettings["revealStyle"],
                  )
                }
              >
                <option value="one-at-a-time">One at a time</option>
                <option value="all-at-once">All at once</option>
              </select>
            </label>
            <NumberField
              label={
                round.revealStyle === "one-at-a-time"
                  ? "Seconds per card"
                  : "Reveal seconds"
              }
              value={round.revealTimeSeconds}
              min={0.2}
              onChange={(value) => set("revealTimeSeconds", value)}
            />
          </div>
        </details>
        <details className="settings-subsection">
          <summary>Pack pool</summary>
          <Toggle
            label="Use all enabled room packs"
            checked={round.useAllPacks}
            onChange={(value) => onChange({ ...round, useAllPacks: value })}
          />
          <PackSelector
            packs={packs}
            selectedIds={
              round.useAllPacks ? packs.map((pack) => pack.id) : round.packIds
            }
            onChange={(packIds) =>
              onChange({ ...round, useAllPacks: false, packIds })
            }
          />
        </details>
      </div>
    </details>
  );
}
