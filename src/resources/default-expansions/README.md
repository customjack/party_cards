# Default expansions

Put redistributable Party Cards pack exports in this directory. Files must end
in `.cards.json`, for example:

```text
my-expansion.cards.json
```

Vite discovers matching files at build time. They appear in the editor and
lobby as read-only built-in packs after restarting the development server (or
rebuilding the production site).

Use the same JSON format produced by **Editor → Card packs → Export**. Every
pack must have its own unique `id`. Only add content you have permission to
redistribute; imported browser-local packs belong in the editor instead.
