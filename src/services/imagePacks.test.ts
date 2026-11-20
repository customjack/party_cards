import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackRepository, normalizePack } from "./storage";
import { databaseDelete, databaseRead } from "./database";
import { defaultGameTemplate, starterPack } from "../domain/defaults";
import { CardGameEngine } from "../domain/gameEngine";
import type { CardPack } from "../domain/types";
import { validImageData } from "./images";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const imagePack = (): CardPack => ({
  ...structuredClone(starterPack),
  id: "images",
  images: { picture: png },
  blackCards: [
    {
      id: "prompt",
      text: "",
      imageId: "picture",
      imageAlt: "Picture prompt",
      pick: 2,
    },
  ],
  whiteCards: [
    { id: "answer", text: "", imageId: "picture", imageAlt: "Picture answer" },
  ],
});

beforeEach(async () => {
  for (const pack of await databaseRead<CardPack[]>("packs"))
    await databaseDelete("packs", pack.id);
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

describe("image packs", () => {
  it("round-trips image-only cards, captions, and explicit prompt picks in self-contained JSON", () => {
    const pack = normalizePack(JSON.parse(JSON.stringify(imagePack())));
    expect(pack.blackCards[0]).toMatchObject({
      text: "",
      imageId: "picture",
      pick: 2,
      imageAlt: "Picture prompt",
    });
    expect(pack.whiteCards[0].imageId).toBe("picture");
    expect(pack.images).toEqual({ picture: png });
  });

  it("deduplicates repeated image data and prunes unused assets", () => {
    const pack = imagePack();
    pack.images = { picture: png, duplicate: png, unused: png };
    pack.whiteCards[0].imageId = "duplicate";
    const normalized = normalizePack(pack);
    expect(Object.keys(normalized.images!)).toHaveLength(1);
    expect(normalized.whiteCards[0].imageId).toBe(
      normalized.blackCards[0].imageId,
    );
  });

  it("rejects missing images, external URLs and embedded SVG imports", () => {
    for (const data of [
      undefined,
      "https://example.com/image.png",
      "data:image/svg+xml;base64,AAAA",
    ]) {
      const pack = imagePack();
      pack.images = data ? { picture: data } : {};
      expect(() => normalizePack(pack)).toThrow();
    }
    expect(validImageData(png)).toBe(true);
  });

  it("migrates localStorage packs once, then persists packs in IndexedDB", async () => {
    localStorage.setItem("party-cards-packs-v1", JSON.stringify([imagePack()]));
    const repository = new PackRepository();
    await repository.load();
    expect(localStorage.getItem("party-cards-packs-v1")).toBeNull();
    expect(
      repository.all().find((pack) => pack.id === "images")?.images,
    ).toEqual({ picture: png });
    const imported = await repository.import(imagePack());
    const reloaded = new PackRepository();
    await reloaded.load();
    expect(
      reloaded.all().find((pack) => pack.id === imported.id)?.blackCards[0]
        .pick,
    ).toBe(2);
    await reloaded.remove(imported.id);
    expect(await databaseRead("packs", imported.id)).toBeUndefined();
  });

  it("keeps text-only rules and accepts image-only answers without embedding image data in runtime cards", () => {
    const pack = imagePack();
    pack.blackCards[0].pick = 1;
    const players = [
      {
        id: "host",
        name: "Host",
        avatar: "✦",
        avatarColor: "#ffc83d",
        connected: true,
        spectator: false,
        isHost: true,
      },
    ];
    const game = CardGameEngine.createStage(
      defaultGameTemplate.rounds[0],
      players,
      [pack],
    );
    expect(CardGameEngine.submit(game, "host", [game.hands.host[0].id])).toBe(
      true,
    );
    expect(game.blackCard.imageId).toBe("images:picture");
    expect(JSON.stringify(game)).not.toContain("data:image/");
    const textPack = normalizePack({
      ...pack,
      images: {},
      blackCards: [{ id: "text", text: "____ and ____", pick: 1 }],
      whiteCards: [{ id: "text", text: "Response" }],
    });
    expect(textPack.blackCards[0].pick).toBe(2);
  });
});
