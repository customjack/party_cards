import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Settings2, X } from "lucide-react";
import type { LobbySnapshot } from "../domain/types";
import { isTimerPaused } from "../domain/timer";
import type { HostSession } from "../network/session";

export function AdminControls({
  snapshot,
  session,
  onStop,
  onKick,
}: {
  snapshot: LobbySnapshot;
  session: HostSession;
  onStop: () => void;
  onKick: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");
  const paused = isTimerPaused(snapshot);
  const connected = snapshot.players.filter(
    (player) => player.connected && !player.isHost,
  );
  const empty = snapshot.players.filter(
    (player) => !player.connected && !player.isHost && !player.spectator,
  );
  const source = connected.find((player) => player.id === sourceId);
  const target = empty.find((player) => player.id === targetId);
  const advanceLabel = {
    answering: "Reveal answers now",
    reveal: "Start judging now",
    judging: "Pick a random winner",
    results: "Continue past results",
    scoreboard: "Start next hand or stage",
    lobby: "Continue",
    finished: "Continue",
  }[snapshot.phase];
  return (
    <>
      <button
        className="scoreboard-trigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Settings2 aria-hidden="true" /> Admin controls
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="scoreboard-dialog admin-dialog"
          aria-labelledby="admin-title"
        >
          <div className="section-heading">
            <h2 id="admin-title">Admin controls</h2>
            <button
              className="button secondary"
              aria-label="Close admin controls"
              onClick={() => dialog.current?.close()}
              autoFocus
            >
              <X />
            </button>
          </div>
          <section>
            <h3>Timer &amp; game flow</h3>
            <p>
              {paused
                ? "Timer paused for everyone."
                : "The timer keeps running while this menu is open."}{" "}
              Players can still play cards and choose a winner while the timer
              is paused.
            </p>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() =>
                  paused ? session.resumeTimer() : session.pauseTimer()
                }
              >
                {paused ? "Resume timer" : "Pause timer"}
              </button>
              <button
                className="button secondary"
                onClick={() => session.addTime()}
              >
                Add 30 seconds
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  if (
                    confirm(
                      `${advanceLabel}? This advances the game for everyone.`,
                    )
                  )
                    session.advancePhase();
                }}
              >
                {advanceLabel}
              </button>
            </div>
          </section>
          <section>
            <h3>Scores &amp; players</h3>
            <p>
              Set a player's total score. Score targets are checked when results
              finish.
            </p>
            {snapshot.players.map((player) => (
              <div className="admin-player" key={player.id}>
                <div>
                  <b>{player.name}</b>
                  <small>
                    {player.connected ? "Connected" : "Disconnected"}
                    {player.spectator ? " · Spectator" : ""}
                  </small>
                </div>
                {Object.hasOwn(snapshot.game!.scores, player.id) && (
                  <ScoreEditor
                    name={player.name}
                    score={snapshot.game!.scores[player.id]}
                    onSave={(score) => session.setPlayerScore(player.id, score)}
                  />
                )}
                {!player.isHost && (
                  <button
                    className="button secondary compact"
                    onClick={() => onKick(player.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </section>
          <section>
            <h3>Assign a disconnected seat</h3>
            <p>
              The connected player takes over the seat's name, hand, score, and
              judge role. Their previous active seat stays disconnected. The
              previous owner cannot automatically reclaim the assigned seat.
            </p>
            <div className="settings-grid">
              <label className="mini-field">
                <span>Connected player</span>
                <select
                  value={source ? sourceId : ""}
                  onChange={(event) => {
                    setSourceId(event.target.value);
                    setMessage("");
                  }}
                >
                  <option value="">Choose a player</option>
                  {connected.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mini-field">
                <span>Disconnected seat</span>
                <select
                  value={target ? targetId : ""}
                  onChange={(event) => {
                    setTargetId(event.target.value);
                    setMessage("");
                  }}
                >
                  <option value="">Choose a seat</option>
                  {empty.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="button secondary"
              disabled={!source || !target}
              onClick={() => {
                if (
                  !source ||
                  !target ||
                  !confirm(
                    `Assign ${source.name} to ${target.name}'s seat? They will use that seat's hand and score.`,
                  )
                )
                  return;
                if (session.reassignPlayer(sourceId, targetId)) {
                  setSourceId("");
                  setTargetId("");
                  setMessage("Seat reassigned.");
                } else
                  setMessage(
                    "The connection or seat changed. Choose an available player and seat again.",
                  );
              }}
            >
              Assign seat
            </button>
            <p role="status">{message}</p>
          </section>
          <section>
            <h3>End this game</h3>
            <p>
              Return everyone to the lobby. Scores and hands are cleared;
              players and settings stay.
            </p>
            <button className="button secondary admin-stop" onClick={onStop}>
              Stop game
            </button>
          </section>
        </dialog>,
        document.body,
      )}
    </>
  );
}

function ScoreEditor({
  name,
  score,
  onSave,
}: {
  name: string;
  score: number;
  onSave: (score: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(score);
  return (
    <form
      className="admin-score"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          value.trim() &&
          Number.isFinite(Number(value)) &&
          Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER
        ) {
          onSave(Number(value));
          setDraft(null);
        }
      }}
    >
      <input
        aria-label={`Score for ${name}`}
        type="number"
        step="any"
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        required
      />
      <button className="button secondary compact" type="submit">
        Set score
      </button>
    </form>
  );
}
