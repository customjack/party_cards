import { ArrowLeft, Download, Plus, Save, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  createGameSettings,
  defaultGameTemplate,
  isBuiltInPack,
  starterPack,
} from "../domain/defaults";
import type {
  BlackCard,
  CardPack,
  GameSettings,
  WhiteCard,
} from "../domain/types";
import {
  downloadJson,
  PackRepository,
  readJson,
  SettingsRepository,
} from "../services/storage";
import { SettingsForm } from "./SettingsForm";
import { cardsToPick } from "../domain/cardRules";

export function Editor({
  packsRepo,
  settingsRepo,
  onBack,
}: {
  packsRepo: PackRepository;
  settingsRepo: SettingsRepository;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"packs" | "rules">("packs"),
    [, forceUpdate] = useState(0);
  return (
    <main className="page shell editor-page">
      <header className="topbar">
        <button className="icon-button" onClick={onBack}>
          <ArrowLeft />
        </button>
        <a className="brand" onClick={onBack}>
          PARTY CARDS
        </a>
        <span className="status-pill">EDITOR</span>
      </header>
      <nav className="editor-tabs">
        <button
          className={mode === "packs" ? "active" : ""}
          onClick={() => setMode("packs")}
        >
          Card packs
        </button>
        <button
          className={mode === "rules" ? "active" : ""}
          onClick={() => setMode("rules")}
        >
          Game rules
        </button>
      </nav>
      {mode === "packs" ? (
        <PackEditor
          repository={packsRepo}
          onSaved={() => forceUpdate((value) => value + 1)}
        />
      ) : (
        <RulesEditor
          repository={settingsRepo}
          packs={packsRepo.all()}
          onSaved={() => forceUpdate((value) => value + 1)}
        />
      )}
    </main>
  );
}

function PackEditor({
  repository,
  onSaved,
}: {
  repository: PackRepository;
  onSaved: () => void;
}) {
  const packs = repository.all(),
    [draft, setDraft] = useState<CardPack>(() => structuredClone(packs[0])),
    [dirty, setDirty] = useState(false),
    file = useRef<HTMLInputElement>(null),
    locked = isBuiltInPack(draft.id);
  const select = (pack: CardPack) => {
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    setDraft(structuredClone(pack));
    setDirty(false);
  };
  const update = (changes: Partial<CardPack>) => {
    setDraft({ ...draft, ...changes, updatedAt: new Date().toISOString() });
    setDirty(true);
  };
  const fresh = () => {
    const now = new Date().toISOString();
    select({
      schemaVersion: 1,
      id: crypto.randomUUID(),
      name: "New card pack",
      description: "",
      author: "",
      tags: [],
      blackCards: [],
      whiteCards: [],
      createdAt: now,
      updatedAt: now,
    });
  };
  return (
    <>
      <section className="editor-heading">
        <div>
          <span className="eyebrow">CONTENT EDITOR</span>
          <h1>Card packs</h1>
          <p>Build reusable black prompt and white response decks.</p>
        </div>
        <EditorActions
          locked={locked}
          dirty={dirty}
          file={file}
          onImport={async (selected) => {
            const imported = repository.import(await readJson(selected));
            setDraft(imported);
            setDirty(false);
            onSaved();
          }}
          onExport={() => downloadJson(`${draft.name}.cards.json`, draft)}
          onSave={() => {
            repository.save(draft);
            setDirty(false);
            onSaved();
          }}
        />
      </section>
      <div className="editor-grid">
        <aside className="panel library">
          <div className="panel-title">
            <h2>Your packs</h2>
            <button className="icon-button small" onClick={fresh}>
              <Plus />
            </button>
          </div>
          {packs.map((pack) => (
            <div className="pack-library-row" key={pack.id}>
              <button
                className={`pack-list-item ${pack.id === draft.id ? "active" : ""}`}
                onClick={() => select(pack)}
              >
                <b>{pack.name}</b>
                <span>
                  {pack.blackCards.length} black · {pack.whiteCards.length}{" "}
                  white
                  {isBuiltInPack(pack.id) ? " · built in" : ""}
                </span>
              </button>
              {!isBuiltInPack(pack.id) && (
                <button
                  className="library-delete"
                  aria-label={`Delete ${pack.name}`}
                  onClick={() => {
                    if (!confirm(`Delete “${pack.name}”?`)) return;
                    repository.remove(pack.id);
                    if (draft.id === pack.id) {
                      setDraft(structuredClone(starterPack));
                      setDirty(false);
                    }
                    onSaved();
                  }}
                >
                  <Trash2 />
                </button>
              )}
            </div>
          ))}
        </aside>
        <fieldset disabled={locked} className="panel pack-form">
          {locked && (
            <div className="validation warning">
              <b>Built-in pack.</b> Export it or use + to create an editable
              pack.
            </div>
          )}
          <div className="settings-grid">
            <label className="field">
              <span>Pack name</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  update({ name: event.target.value.slice(0, 60) })
                }
              />
            </label>
            <label className="field">
              <span>Author</span>
              <input
                value={draft.author}
                onChange={(event) =>
                  update({ author: event.target.value.slice(0, 40) })
                }
              />
            </label>
          </div>
          <label className="field">
            <span>Description</span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                update({ description: event.target.value.slice(0, 240) })
              }
            />
          </label>
          <CardList
            title="Black prompt cards"
            cards={draft.blackCards}
            kind="black"
            onChange={(cards) => update({ blackCards: cards as BlackCard[] })}
          />
          <CardList
            title="White response cards"
            cards={draft.whiteCards}
            kind="white"
            onChange={(cards) => update({ whiteCards: cards as WhiteCard[] })}
          />
        </fieldset>
      </div>
    </>
  );
}

function CardList({
  title,
  cards,
  kind,
  onChange,
}: {
  title: string;
  cards: (BlackCard | WhiteCard)[];
  kind: "black" | "white";
  onChange: (cards: (BlackCard | WhiteCard)[]) => void;
}) {
  const add = () =>
    onChange([
      ...cards,
      kind === "black"
        ? { id: crypto.randomUUID(), text: "", pick: 1 }
        : { id: crypto.randomUUID(), text: "" },
    ]);
  const addBlank = () =>
    onChange([...cards, { id: crypto.randomUUID(), text: "", blank: true }]);
  return (
    <section className={`card-editor-list ${kind}`}>
      <div className="prompt-heading">
        <div>
          <h2>{title}</h2>
          <p>{cards.length} in this pack</p>
        </div>
        <div className="button-row">
          {kind === "white" && (
            <button
              type="button"
              className="button secondary compact"
              onClick={addBlank}
            >
              <Plus /> Add blank card
            </button>
          )}
          <button
            type="button"
            className="button primary compact"
            onClick={add}
          >
            <Plus /> Add card
          </button>
        </div>
      </div>
      <div className="prompt-card-list">
        {cards.map((card, index) => (
          <details
            className={`prompt-editor-card ${kind === "black" ? "black-card-editor" : ""}`}
            key={card.id}
            ref={(element) => {
              if (element && !element.dataset.initialized) {
                element.open = !card.text;
                element.dataset.initialized = "true";
              }
            }}
          >
            <summary>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>
                {(card as WhiteCard).blank
                  ? "Blank card · player writes the response"
                  : card.text || `New ${kind} card`}
              </b>
              <button
                type="button"
                aria-label={`Delete card ${index + 1}`}
                onClick={(event) => {
                  event.preventDefault();
                  onChange(cards.filter((_, itemIndex) => itemIndex !== index));
                }}
              >
                <Trash2 />
              </button>
            </summary>
            <div>
              {(card as WhiteCard).blank ? (
                <div className="blank-card-note">
                  The player who draws this card can type any response before
                  playing it.
                </div>
              ) : (
                <label className="field">
                  <span>{kind === "black" ? "Prompt" : "Response"}</span>
                  <textarea
                    placeholder={
                      kind === "black"
                        ? "Use ____ for each blank."
                        : "Response text"
                    }
                    value={card.text}
                    onChange={(event) =>
                      onChange(
                        cards.map((item, itemIndex) =>
                          itemIndex === index
                            ? (() => {
                                const text = event.target.value.slice(
                                  0,
                                  kind === "black" ? 300 : 180,
                                );
                                return kind === "black"
                                  ? { ...item, text, pick: cardsToPick(text) }
                                  : { ...item, text };
                              })()
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              )}
              {kind === "black" && (
                <small className="inferred-pick">
                  {cardsToPick(card.text)} card
                  {cardsToPick(card.text) === 1 ? "" : "s"} will be played
                </small>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function RulesEditor({
  repository,
  packs,
  onSaved,
}: {
  repository: SettingsRepository;
  packs: CardPack[];
  onSaved: () => void;
}) {
  const items = repository.all(),
    [draft, setDraft] = useState<GameSettings>(() => structuredClone(items[0])),
    [dirty, setDirty] = useState(false),
    file = useRef<HTMLInputElement>(null),
    locked = draft.id === defaultGameTemplate.id;
  const select = (settings: GameSettings) => {
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    setDraft(structuredClone(settings));
    setDirty(false);
  };
  return (
    <>
      <section className="editor-heading">
        <div>
          <span className="eyebrow">RULE EDITOR</span>
          <h1>Game rules</h1>
          <p>Build reusable stage structures and table rules.</p>
        </div>
        <EditorActions
          locked={locked}
          dirty={dirty}
          file={file}
          onImport={async (selected) => {
            const imported = repository.import(await readJson(selected));
            setDraft(imported);
            setDirty(false);
            onSaved();
          }}
          onExport={() => downloadJson(`${draft.name}.rules.json`, draft)}
          onSave={() => {
            repository.save(draft);
            setDirty(false);
            onSaved();
          }}
        />
      </section>
      <div className="setup-grid">
        <aside className="setup-sidebar rules-sidebar">
          <section className="panel">
            <div className="panel-title">
              <h2>Saved settings</h2>
              <button
                className="icon-button small"
                onClick={() => select(createGameSettings())}
              >
                <Plus />
              </button>
            </div>
            {items.map((settings) => (
              <div className="pack-library-row" key={settings.id}>
                <button
                  className={`pack-list-item ${settings.id === draft.id ? "active" : ""}`}
                  onClick={() => select(settings)}
                >
                  <b>{settings.name}</b>
                  <span>
                    {settings.rounds.length} stages
                    {settings.id === defaultGameTemplate.id
                      ? " · built in"
                      : ""}
                  </span>
                </button>
                {settings.id !== defaultGameTemplate.id && (
                  <button
                    className="library-delete"
                    aria-label={`Delete ${settings.name}`}
                    onClick={() => {
                      if (!confirm(`Delete “${settings.name}”?`)) return;
                      repository.remove(settings.id);
                      if (draft.id === settings.id) {
                        setDraft(structuredClone(defaultGameTemplate));
                        setDirty(false);
                      }
                      onSaved();
                    }}
                  >
                    <Trash2 />
                  </button>
                )}
              </div>
            ))}
          </section>
        </aside>
        <section className="settings-column">
          {locked && (
            <div className="validation warning">
              <b>Built-in settings.</b> Use + to create editable settings.
            </div>
          )}
          <SettingsForm
            settings={draft}
            packs={packs}
            locked={locked}
            onChange={(settings) => {
              setDraft(settings);
              setDirty(true);
            }}
          />
        </section>
      </div>
    </>
  );
}

function EditorActions({
  locked,
  dirty,
  file,
  onImport,
  onExport,
  onSave,
}: {
  locked: boolean;
  dirty: boolean;
  file: React.RefObject<HTMLInputElement | null>;
  onImport: (file: File) => void;
  onExport: () => void;
  onSave: () => void;
}) {
  return (
    <div className="button-row">
      <input
        ref={file}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) void onImport(selected);
          event.target.value = "";
        }}
      />
      <button
        className="button secondary"
        onClick={() => file.current?.click()}
      >
        <Upload /> Import
      </button>
      <button className="button secondary" onClick={onExport}>
        <Download /> Export
      </button>
      <button
        className="button primary"
        disabled={locked || !dirty}
        onClick={onSave}
      >
        <Save /> Save
      </button>
    </div>
  );
}
