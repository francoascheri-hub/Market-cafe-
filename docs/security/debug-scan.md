# Debug scan (area 6)

Searched `src/`, `api/`, `scripts/`, `index.html`, `vite.config.ts`, and `public/` for `console.log` / `debug` / `info` (and `warn` / `error`), `debugger`, `/api/debug`, `import.meta.env.DEV` panels, debug buttons, and TODOs that print secrets. `.claude/` was not edited.

## Removed

Nothing. No debug code in files this area is allowed to change.

## Left for the other agent

- `api/orders.ts` line 78: `console.error(e)` inside the request handler. File is owned by another agent. Delegated.

## Noted, not app debug

- `scripts/e2e-screenshots.mjs`: `console.log` for test progress (`ok - …`, final screenshot path). Not edited.
- `scripts/scrape-menu.mjs`: one `console.log` after writing `src/data/menu.json` (item counts). CLI summary, not app debug. Not edited.
- `src/backend/index.ts`: `import.meta.env.VITE_BACKEND` selects local vs API. Real feature. Left as-is.

No `debugger` statements, debug routes, or dev-only UI in the searched trees. Re-checked 2026-11-15: `api/` now has `cors.ts`, `orders.ts`, `rateLimit.ts`, `staffPin.ts` (all owned by other agents); only `orders.ts:78` has console output.
