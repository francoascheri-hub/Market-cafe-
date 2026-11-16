# Secrets scan (Area 4)

Date: 2026-11-15. Read-only scan. No history was rewritten and nothing was committed.

## Git root

- `market-cafe-preorder/` is the only git repo (`git rev-parse --show-toplevel`). The workspace root is not a git repo.
- Branches: `main` and `origin/main`. HEAD is `1c6e3af`.
- **9 commits** total (`git rev-list --all`).

## Method

All commands read git objects directly. Nothing was checked out.

- Committed `.env*` files: `git log --all --full-history --name-only` filtered for `.env`.
- Pattern scan over every commit: `git grep -I -P <patterns> $(git rev-list --all)`. Patterns: `UPSTASH_REDIS_REST_TOKEN=<value>`, `UPSTASH_REDIS_REST_URL=https://*.upstash.io`, `-----BEGIN … PRIVATE KEY-----`, `AKIA[0-9A-Z]{16}`, `Bearer <20+ chars>`, `password = "<value>"`, `STAFF_PIN=<value>`, `sk-…`, `ghp_…`, `AIza…`, `xox[bp]-…`.
- A second case-insensitive fixed-string pass (`git grep -i -F`) for `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_URL`, `PRIVATE KEY`, `AKIA`, `Bearer `, `password`, `STAFF_PIN`, `sk-`, and `secret`, followed by a manual review of each hit.
- `.claude/skills/**` (the vendored third-party design skills) was included in both passes.

## Findings: no leaked secrets

| Where | What | Classification |
|---|---|---|
| `.env.example` (all commits) | `UPSTASH_REDIS_REST_URL=` and `UPSTASH_REDIS_REST_TOKEN=` | **Placeholder**: the values are empty |
| `README.md`, `api/orders.ts` | Variable names only, in docs, error text, and `process.env` reads | Not a secret: no values |
| `.claude/skills/ui-ux-pro-max/data/stacks/shadcn.csv` | Text "Commit bearer tokens" | **Example**: a guideline listed as a "don't". No token |
| `.claude/skills/ui-ux-pro-max/data/stacks/{angular,nuxtjs}.csv` | `password: fb.control('')` and `dbPassword: ''` | **Example/placeholder**: empty strings in code samples |
| `.claude/skills/**` and `public/favicon.svg` | Fixed-string `sk-` hits | False positive: CSS substrings like `mask-`. The strict `sk-[A-Za-z0-9]{20,}` pattern matched nothing |

- The only `.env*` file ever committed is `.env.example`. No `.env`, `.env.local`, or `.env.production` appears in any commit.
- The strict regex pass returned **zero** hits: no real Upstash host or token, no private key, no `AKIA` key, no Bearer token, no `password=` with a value, and no `STAFF_PIN` with a value. `STAFF_PIN` does not appear anywhere in history.

## Redis tokens are server-side only

- `grep -rnE 'UPSTASH|VITE_[A-Z_]*TOKEN|VITE_[A-Z_]*REDIS|@upstash/redis' src index.html vite.config.ts` finds **no matches**.
- `@upstash/redis` is imported only by `api/orders.ts`.
- The only client env var documented in `.env.example` is `VITE_BACKEND`, which is not a secret. The file also warns "Never prefix with VITE_" for the Upstash vars.
- **Not done here:** grepping the production `dist/` bundle. That check needs a build, and this scan did not run one. The parent agent must grep `dist/` for `UPSTASH`, `upstash.io`, and the token prefix after the final `npm run build`.

## .gitignore

The ignore rules are intact and were not modified. Relevant lines:

```
# Secrets / Vercel CLI
.env
.env.*
!.env.example
.vercel
```
