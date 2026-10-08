# Space Attack

A keyboard arcade game built with TypeScript, Vite and PixiJS. The entire visible interface, including scores, fuel, ships and screen controls, is rendered in the game canvas.

## Run locally

```sh
pnpm install
pnpm dev
```

Open the URL printed by Vite. Use left/right arrows to move, hold Space to fire, Enter to start/restart, Escape to pause and M to toggle sound. The pixel controls at the bottom toggle sound, effects and fullscreen.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

The simulation runs at a fixed 60 Hz. A cleared wave plays a short fanfare and celebration, leaves an empty playfield, brings in the next formation, then counts down 3–2–1–GO. Fuel and combat stop during this sequence.

For a quick local check of this sequence, open `/tests/preview.html` on the **development** server and click the start button. This isolated fixture shoots a single remaining alien using the real simulation and renderer. It is excluded from the production build.

Vercel configuration uses a frozen pnpm installation, `pnpm build` and the `dist` output directory. No backend or environment variables are required. Best score and preferences are saved on the current device.
