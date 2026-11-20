import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedImage } from "../services/images";
import { ClientSession } from "./session";

const state = vi.hoisted(() => ({
  peers: [] as Map<string, (...args: any[]) => void>[],
  connections: [] as {
    events: Map<string, (...args: any[]) => void>;
    send: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("./peerConfig", () => ({ getPeerOptions: () => ({}) }));
vi.mock("peerjs", () => ({
  default: class {
    events = new Map<string, (...args: any[]) => void>();
    constructor() {
      state.peers.push(this.events);
    }
    on(name: string, callback: (...args: any[]) => void) {
      this.events.set(name, callback);
    }
    connect() {
      const events = new Map<string, (...args: any[]) => void>();
      const send = vi.fn();
      state.connections.push({ events, send });
      return {
        open: true,
        on: (name: string, callback: (...args: any[]) => void) =>
          events.set(name, callback),
        send,
      };
    }
    destroy() {}
  },
}));
const sessions: ClientSession[] = [];
afterEach(() => {
  sessions.forEach((session) => session.destroy());
  sessions.length = 0;
  vi.unstubAllGlobals();
});
function connect() {
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {} });
  const client = new ClientSession("IMAGES", {
    name: "Viewer",
    avatar: "✦",
    avatarColor: "#ffc83d",
    spectator: false,
  });
  sessions.push(client);
  state.peers.at(-1)!.get("open")!();
  const connection = state.connections.at(-1)!;
  connection.events.get("open")!();
  return { client, connection };
}

describe("client image transfer", () => {
  it("shares in-flight requests and loads persisted images without downloading again", async () => {
    const { client, connection } = connect();
    const id = `pack:${crypto.randomUUID()}`;
    const data =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    const first = client.getImage(id),
      second = client.getImage(id);
    await vi.waitFor(() =>
      expect(connection.send).toHaveBeenCalledWith({
        type: "REQUEST_IMAGE",
        payload: { imageId: id },
      }),
    );
    expect(
      connection.send.mock.calls.filter(
        ([command]) => command.type === "REQUEST_IMAGE",
      ),
    ).toHaveLength(1);
    connection.events.get("data")!({
      type: "IMAGE",
      payload: { imageId: id, data },
    });
    expect(await first).toBe(data);
    expect(await second).toBe(data);
    await vi.waitFor(async () => expect(await cachedImage(id)).toBe(data));
    const next = connect();
    expect(await next.client.getImage(id)).toBe(data);
    expect(
      next.connection.send.mock.calls.some(
        ([command]) => command.type === "REQUEST_IMAGE",
      ),
    ).toBe(false);
  });

  it("rejects invalid image responses and lets the player retry", async () => {
    const { client, connection } = connect();
    const id = `pack:${crypto.randomUUID()}`;
    const first = client.getImage(id);
    const rejected = expect(first).rejects.toThrow("Image unavailable");
    await vi.waitFor(() =>
      expect(connection.send).toHaveBeenCalledWith({
        type: "REQUEST_IMAGE",
        payload: { imageId: id },
      }),
    );
    connection.events.get("data")!({
      type: "IMAGE",
      payload: { imageId: id, data: "https://example.com/image.svg" },
    });
    await rejected;
    const retry = client.getImage(id);
    const retryRejected = expect(retry).rejects.toThrow();
    await vi.waitFor(() =>
      expect(
        connection.send.mock.calls.filter(
          ([command]) => command.type === "REQUEST_IMAGE",
        ),
      ).toHaveLength(2),
    );
    client.destroy();
    await retryRejected;
  });
});
