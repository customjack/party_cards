import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Eye,
  Settings2,
  Users,
  X,
} from "lucide-react";
import {
  AVATARS,
  NAME_MAX_LENGTH,
  type Avatar,
  type CardPack,
  type GameSettings,
  type LobbySnapshot,
  type Player,
} from "../domain/types";
import { SettingsValidator } from "../domain/validation";
import {
  ClientSession,
  HostSession,
  type ConnectionState,
} from "../network/session";
import type { SettingsRepository } from "../services/storage";
import { Avatar as PlayerAvatar } from "./Avatar";
import { GameView } from "./GameView";
import { SettingsForm } from "./SettingsForm";

export function JoinCard({
  onBack,
  onJoin,
}: {
  onBack: () => void;
  onJoin: (
    code: string,
    name: string,
    avatar: Avatar,
    color: string,
    spectator: boolean,
  ) => void;
}) {
  const [code, setCode] = useState("");
  const [profile, setProfile] = useState({
    name: "",
    avatar: "✦",
    avatarColor: "#ffc83d",
    spectator: false,
  });
  return (
    <main className="center-page join-page">
      <button className="back-float icon-button" onClick={onBack}>
        <ArrowLeft />
      </button>
      <section className="join-card panel">
        <span className="eyebrow">JOIN A ROOM</span>
        <h1>Enter the code</h1>
        <label className="field">
          <span>Room code</span>
          <input
            className="code-input"
            value={code}
            maxLength={6}
            autoFocus
            onChange={(event) =>
              setCode(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
              )
            }
          />
        </label>
        <label className="field">
          <span>Your display name</span>
          <input
            value={profile.name}
            maxLength={NAME_MAX_LENGTH}
            onChange={(event) =>
              setProfile({ ...profile, name: event.target.value })
            }
          />
        </label>
        <div className="field">
          <span>Choose your icon</span>
          <div className="avatar-picker">
            {AVATARS.map((avatar) => (
              <button
                type="button"
                className={`avatar ${avatar === profile.avatar ? "selected" : ""}`}
                style={{ backgroundColor: profile.avatarColor }}
                onClick={() => setProfile({ ...profile, avatar })}
                key={avatar}
              >
                <span className="avatar-glyph">{avatar}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="field color-field">
          <span>Icon color</span>
          <input
            type="color"
            value={profile.avatarColor}
            onChange={(event) =>
              setProfile({ ...profile, avatarColor: event.target.value })
            }
          />
        </label>
        <label className="toggle-row spectator-toggle">
          <span>
            <b>Join as spectator</b>
            <small>Watch without holding or judging cards.</small>
          </span>
          <input
            type="checkbox"
            checked={profile.spectator}
            onChange={(event) =>
              setProfile({ ...profile, spectator: event.target.checked })
            }
          />
        </label>
        <button
          className="button primary big full"
          disabled={code.length !== 6 || !profile.name.trim()}
          onClick={() =>
            onJoin(
              code,
              profile.name,
              profile.avatar,
              profile.avatarColor,
              profile.spectator,
            )
          }
        >
          Join game
        </button>
      </section>
    </main>
  );
}

export function Lobby({
  session,
  isHost,
  packs,
  settingsRepo,
  onLeave,
}: {
  session: HostSession | ClientSession;
  isHost: boolean;
  packs: CardPack[];
  settingsRepo: SettingsRepository;
  onLeave: () => void;
}) {
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(() =>
    session instanceof HostSession ? session.snapshot : null,
  );
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const offSnapshot = session.onSnapshot(setSnapshot);
    const offError = session.onError(setError);
    const offStatus = session.onStatus(setConnectionState);
    return () => {
      offSnapshot();
      offError();
      offStatus();
    };
  }, [session]);

  if (error)
    return (
      <main className="center-page">
        <section className="join-card panel">
          <h1>Connection problem</h1>
          <p>{error}</p>
          <button className="button primary" onClick={onLeave}>
            Back home
          </button>
        </section>
      </main>
    );
  if (!snapshot)
    return (
      <main className="center-page">
        <div className="spinner" />
        <h1>Connecting…</h1>
        <p>
          {connectionState === "reconnecting"
            ? "Trying the room again."
            : "Finding the host."}
        </p>
      </main>
    );
  if (snapshot.phase !== "lobby")
    return (
      <GameView
        snapshot={snapshot}
        session={session}
        isHost={isHost}
        connectionState={connectionState}
        onLeave={onLeave}
      />
    );

  const me = snapshot.players.find(
    (player) => player.id === session.localPlayerId,
  );
  const players = snapshot.players.filter((player) => !player.spectator);
  const spectators = snapshot.players.filter((player) => player.spectator);
  const selectedPacks = packs.filter((pack) =>
    snapshot.selectedPackIds.includes(pack.id),
  );
  const issues = SettingsValidator.validateGame(
    snapshot.settings,
    players.length,
    selectedPacks,
  );
  const canStart =
    players.length >= 3 && !issues.some((issue) => issue.level === "error");
  const updateSettings = (
    settings: GameSettings,
    selected = snapshot.selectedPackIds,
  ) => (session as HostSession).updateSettings(settings, selected);
  const updateProfile = (changes: Partial<NonNullable<typeof me>>) => {
    if (!me) return;
    const profile = {
      name: me.name,
      avatar: me.avatar,
      avatarColor: me.avatarColor,
      spectator: me.spectator,
      ...changes,
    };
    isHost
      ? (session as HostSession).updateHost(profile)
      : (session as ClientSession).updateProfile(profile);
  };
  const kickPlayer = (player: Player) => {
    if (!isHost || player.isHost) return;
    if (confirm(`Remove “${player.name}” from the game?`))
      (session as HostSession).kickPlayer(player.id);
  };

  return (
    <main className="page shell lobby-page">
      <header className="topbar">
        <button className="icon-button" onClick={onLeave}>
          <ArrowLeft />
        </button>
        <a className="brand">PARTY CARDS</a>
        <span className={`connection ${connectionState}`}>
          <i />
          {connectionState.toUpperCase()}
        </span>
      </header>
      <section className="room-hero">
        <div>
          <span className="eyebrow">ROOM CODE</span>
          <button
            className="room-code"
            title="Copy room code"
            onClick={() => {
              void navigator.clipboard.writeText(snapshot.roomCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {snapshot.roomCode}
            {copied ? <Check /> : <Copy />}
          </button>
        </div>
        <div className="room-stats">
          <div>
            <Users />
            <span>
              <b>
                {players.length}/{snapshot.settings.maxPlayers}
              </b>{" "}
              players
            </span>
          </div>
          <div>
            <Eye />
            <span>
              <b>{spectators.length}</b> spectators
            </span>
          </div>
        </div>
      </section>
      <div className="lobby-grid">
        <section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">LOBBY</span>
              <h2>Players</h2>
            </div>
          </div>
          <div className="player-grid">
            {players.map((player) => (
              <article
                className={`player-card ${player.connected ? "" : "offline"}`}
                key={player.id}
              >
                <PlayerAvatar name={player.avatar} color={player.avatarColor} />
                <div>
                  <b>{player.name}</b>
                  <span>
                    {!player.connected ? (
                      "Reconnecting…"
                    ) : player.isHost ? (
                      <>
                        <Crown /> Host
                      </>
                    ) : player.waitingForNextHand ? (
                      "Joining next hand"
                    ) : (
                      "Player"
                    )}
                  </span>
                </div>
                {isHost && !player.isHost && (
                  <button
                    type="button"
                    className="kick-player-button"
                    title={`Remove ${player.name}`}
                    aria-label={`Remove ${player.name}`}
                    onClick={() => kickPlayer(player)}
                  >
                    <X />
                  </button>
                )}
              </article>
            ))}
            {Array.from(
              {
                length: Math.min(
                  4,
                  Math.max(0, snapshot.settings.maxPlayers - players.length),
                ),
              },
              (_, index) => (
                <article className="player-card empty" key={index}>
                  <div className="avatar">+</div>
                  <div>
                    <b>Open seat</b>
                  </div>
                </article>
              ),
            )}
          </div>
          {spectators.length > 0 && (
            <>
              <div className="section-heading small-heading">
                <div>
                  <span className="eyebrow">SPECTATORS</span>
                </div>
              </div>
              <div className="spectator-list">
                {spectators.map((player) => (
                  <span key={player.id}>
                    {player.avatar} {player.name}
                    {isHost && (
                      <button
                        type="button"
                        className="kick-player-button"
                        title={`Remove ${player.name}`}
                        aria-label={`Remove ${player.name}`}
                        onClick={() => kickPlayer(player)}
                      >
                        <X />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
        <aside className="lobby-sidebar">
          <section className="panel game-summary">
            <div className="panel-title">
              <div>
                <span className="eyebrow">GAME SETTINGS</span>
                <h2>{snapshot.settings.name}</h2>
              </div>
              {isHost && (
                <button
                  className="icon-button small"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings2 />
                </button>
              )}
            </div>
            <dl>
              <div>
                <dt>Stages</dt>
                <dd>{snapshot.settings.rounds.length}</dd>
              </div>
              <div>
                <dt>Hands</dt>
                <dd>
                  {snapshot.settings.rounds.reduce(
                    (sum, round) => sum + round.hands,
                    0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Win</dt>
                <dd>
                  {snapshot.settings.winCondition.type === "all-stages"
                    ? "All stages"
                    : snapshot.settings.winCondition.type === "round-count"
                      ? `${snapshot.settings.winCondition.target} rounds`
                      : `${snapshot.settings.winCondition.target} points`}
                </dd>
              </div>
              <div>
                <dt>Packs</dt>
                <dd>{selectedPacks.length}</dd>
              </div>
            </dl>
          </section>
          {issues.length > 0 && (
            <section className="panel lobby-issues">
              {issues.map((issue) => (
                <p key={issue.message}>{issue.message}</p>
              ))}
            </section>
          )}
          {me && (
            <LobbyProfileEditor
              player={me}
              canChangeRole={!isHost && snapshot.settings.allowSpectators}
              onChange={updateProfile}
            />
          )}
          {isHost ? (
            <button
              className="button primary start-button"
              disabled={!canStart}
              onClick={() => (session as HostSession).start()}
            >
              {players.length < 3 ? "Waiting for players…" : "Start game"} →
            </button>
          ) : (
            <div className="ready-card">
              <span className="pulse-dot" /> Waiting for the host…
            </div>
          )}
        </aside>
      </div>
      {showSettings && isHost && (
        <div className="modal-backdrop rules-modal">
          <section className="panel lobby-settings shared-rules-modal">
            <button
              className="modal-close icon-button"
              onClick={() => setShowSettings(false)}
            >
              <X />
            </button>
            <section className="editor-heading">
              <div>
                <span className="eyebrow">HOST CONTROLS</span>
                <h1>Game rules</h1>
                <p>Changes apply to this lobby until the game starts.</p>
              </div>
            </section>
            <div className="setup-grid">
              <aside className="setup-sidebar rules-sidebar">
                <section className="panel">
                  <div className="panel-title">
                    <h2>Saved settings</h2>
                  </div>
                  {settingsRepo.all().map((item) => (
                    <button
                      className={`pack-list-item ${item.id === snapshot.settings.id ? "active" : ""}`}
                      key={item.id}
                      onClick={() => updateSettings(structuredClone(item))}
                    >
                      <b>{item.name}</b>
                      <span>{item.rounds.length} stages</span>
                    </button>
                  ))}
                </section>
                <section className="panel">
                  <h2>Card packs</h2>
                  <p className="sidebar-hint">
                    Choose the decks available to every stage.
                  </p>
                  {packs.map((pack) => (
                    <label className="check-card" key={pack.id}>
                      <input
                        type="checkbox"
                        checked={snapshot.selectedPackIds.includes(pack.id)}
                        onChange={() =>
                          updateSettings(
                            snapshot.settings,
                            snapshot.selectedPackIds.includes(pack.id)
                              ? snapshot.selectedPackIds.filter(
                                  (id) => id !== pack.id,
                                )
                              : [...snapshot.selectedPackIds, pack.id],
                          )
                        }
                      />
                      <span>
                        <b>{pack.name}</b>
                        <small>
                          {pack.blackCards.length} black ·{" "}
                          {pack.whiteCards.length} white
                        </small>
                      </span>
                    </label>
                  ))}
                </section>
              </aside>
              <section className="settings-column">
                <SettingsForm
                  settings={snapshot.settings}
                  packs={packs}
                  onChange={updateSettings}
                />
              </section>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function LobbyProfileEditor({
  player,
  canChangeRole,
  onChange,
}: {
  player: Player;
  canChangeRole: boolean;
  onChange: (changes: Partial<Player>) => void;
}) {
  const [name, setName] = useState(player.name);
  useEffect(() => setName(player.name), [player.name]);

  const normalizedName = () => name.trim().slice(0, NAME_MAX_LENGTH) || "Player";
  const commitName = () => {
    const next = normalizedName();
    setName(next);
    if (next !== player.name) onChange({ name: next });
  };

  return (
    <section className="panel profile-panel">
      <span className="eyebrow">YOUR PROFILE</span>
      <input
        maxLength={NAME_MAX_LENGTH}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <div className="mini-avatar-picker">
        {AVATARS.map((avatar) => (
          <button
            className={`avatar ${avatar === player.avatar ? "selected" : ""}`}
            style={{ backgroundColor: player.avatarColor }}
            onClick={() => onChange({ name: normalizedName(), avatar })}
            key={avatar}
          >
            <span className="avatar-glyph">{avatar}</span>
          </button>
        ))}
      </div>
      <label className="color-field compact-color-field">
        Icon color
        <input
          type="color"
          value={player.avatarColor}
          onChange={(event) =>
            onChange({
              name: normalizedName(),
              avatarColor: event.target.value,
            })
          }
        />
      </label>
      {canChangeRole && (
        <button
          className="text-button"
          onClick={() =>
            onChange({
              name: normalizedName(),
              spectator: !player.spectator,
            })
          }
        >
          {player.spectator ? "Join as player" : "Switch to spectator"}
        </button>
      )}
    </section>
  );
}
