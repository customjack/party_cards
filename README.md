# Party Cards

A configurable, host-authoritative, peer-to-peer card party game. All default
cards are original and included in the repository; no Cards Against Humanity
card text or artwork is used.

## Run locally

```bash
npm install
npm run dev
```

To run the web app with a local PeerJS signaling server:

```bash
npm run dev:full
```

## How it works

- The host owns the deck, hands, timers, phase changes, validation, and scores.
- Clients only receive their own private hand.
- Rooms reconnect using a stable browser player ID.
- Card packs and saved rules live in browser local storage and can be imported
  or exported as JSON.
- Built-in packs and rules use the same JSON format as user exports.

## Deploy

Enable **GitHub Actions** as the Pages source in **Settings → Pages**, then push
to `main`. The included workflow builds and deploys `dist` automatically.

## Licensing

The application code is MIT licensed. The original built-in card text is
released under CC0 1.0; see `CONTENT-LICENSE.md`. Imported packs keep whatever
license their authors assign to them.
