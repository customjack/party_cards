import { ArrowRight, Gamepad2, PackagePlus, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { Editor } from "./components/Editor";
import { JoinCard, Lobby } from "./components/Lobby";
import type { Avatar } from "./domain/types";
import { ClientSession, HostSession } from "./network/session";
import { PackRepository, SettingsRepository } from "./services/storage";
import "./styles.css";
type Screen = "home" | "join" | "editor" | "lobby";
export default function App() {
  const packs = useMemo(() => new PackRepository(), []),
    settings = useMemo(() => new SettingsRepository(), []),
    [screen, setScreen] = useState<Screen>("home"),
    [session, setSession] = useState<HostSession | ClientSession>(),
    [isHost, setIsHost] = useState(false);
  const leave = () => {
    if (session instanceof ClientSession) session.leave();
    else session?.destroy();
    setSession(undefined);
    setScreen("home");
  };
  const host = () => {
    const next = new HostSession(
      { name: "Host", avatar: "✦", avatarColor: "#ffc83d", spectator: false },
      structuredClone(settings.all()[0]),
      packs.all(),
    );
    setSession(next);
    setIsHost(true);
    setScreen("lobby");
  };
  const join = (
    code: string,
    name: string,
    avatar: Avatar,
    avatarColor: string,
    spectator: boolean,
  ) => {
    const next = new ClientSession(code, {
      name,
      avatar,
      avatarColor,
      spectator,
    });
    setSession(next);
    setIsHost(false);
    setScreen("lobby");
  };
  if (screen === "editor")
    return (
      <Editor
        packsRepo={packs}
        settingsRepo={settings}
        onBack={() => setScreen("home")}
      />
    );
  if (screen === "join")
    return <JoinCard onBack={() => setScreen("home")} onJoin={join} />;
  if (screen === "lobby" && session)
    return (
      <Lobby
        session={session}
        isHost={isHost}
        packs={packs.all()}
        settingsRepo={settings}
        onLeave={leave}
      />
    );
  return (
    <main className="home-page cards-home">
      <nav>
        <a className="brand">PARTY CARDS</a>
      </nav>
      <section className="home-hero">
        <div className="hero-copy">
          <h1>
            PARTY
            <br />
            <em>CARDS</em>
          </h1>
          <div className="home-actions">
            <button className="action-card host-action" onClick={host}>
              <span className="action-icon">
                <Radio />
              </span>
              <span>
                <b>Host a game</b>
                <small>Create a room and tune it in the lobby.</small>
              </span>
              <ArrowRight />
            </button>
            <button className="action-card" onClick={() => setScreen("join")}>
              <span className="action-icon">
                <Gamepad2 />
              </span>
              <span>
                <b>Join a game</b>
                <small>Enter a six-character room code.</small>
              </span>
              <ArrowRight />
            </button>
            <button className="action-card" onClick={() => setScreen("editor")}>
              <span className="action-icon">
                <PackagePlus />
              </span>
              <span>
                <b>Editor</b>
                <small>Manage card packs and saved game rules.</small>
              </span>
              <ArrowRight />
            </button>
          </div>
        </div>
        <div className="hero-art card-hero" aria-hidden="true">
          <div className="demo-black">My foolproof plan begins with ____.</div>
          <div className="demo-white">
            three raccoons with a business license
          </div>
        </div>
      </section>
    </main>
  );
}
