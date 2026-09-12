import { Copy, Plus, Trash2 } from "lucide-react";
import { createRound } from "../domain/defaults";
import {
  REACTIONS,
  type CardPack,
  type GameSettings,
  type ReactionLimit,
  type RoundSettings,
} from "../domain/types";
import { ReactionIcon } from "../resources/ReactionIcon";

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
    <input
      type="number"
      min={min}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
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
    <input
      type="number"
      min="0"
      value={value === "unlimited" ? 0 : value}
      onChange={(event) => {
        const next = Math.max(0, Number(event.target.value) || 0);
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
            label="Allow joining active games"
            hint="Late players spectate until the next stage."
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
        <details className="settings-subsection">
          <summary>Reaction scoring</summary>
          <p>
            Reactions are always counted. Limits reset for every hand; leave
            point values at zero for cosmetic reactions only.
          </p>
          <div className="settings-grid">
            <ReactionLimitField
              label="Total reactions per player"
              value={settings.maxReactionsPerPlayer}
              onChange={(value) => set("maxReactionsPerPlayer", value)}
            />
            <ReactionLimitField
              label="Reactions per card"
              value={settings.maxReactionsPerTarget}
              onChange={(value) => set("maxReactionsPerTarget", value)}
            />
          </div>
          <div className="reaction-settings-grid">
            {REACTIONS.map((reaction) => (
              <div className="reaction-setting" key={reaction.id}>
                <ReactionIcon reaction={reaction.id} />
                <NumberField
                  label={reaction.label}
                  value={settings.reactionPoints[reaction.id]}
                  min={-999}
                  onChange={(points) =>
                    set("reactionPoints", {
                      ...settings.reactionPoints,
                      [reaction.id]: points,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </details>
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
          <summary>
            Pack pool <small>Empty uses all available packs</small>
          </summary>
          <div className="check-grid">
            {packs.map((pack) => (
              <label className="check-card" key={pack.id}>
                <input
                  type="checkbox"
                  checked={round.packIds.includes(pack.id)}
                  onChange={() =>
                    set(
                      "packIds",
                      round.packIds.includes(pack.id)
                        ? round.packIds.filter((id) => id !== pack.id)
                        : [...round.packIds, pack.id],
                    )
                  }
                />
                {pack.name}
              </label>
            ))}
          </div>
        </details>
      </div>
    </details>
  );
}
