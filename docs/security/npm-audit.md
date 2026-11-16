# npm audit

Date: 2026-11-15  
Project: `market-cafe-preorder`  
Tooling: Node v24.13.1, npm 11.8.0  
Lockfile: `package-lock.json` (present; `node_modules` present)

Scope: report only. `npm audit fix --force` was not used. No major upgrades were applied. Application source, API routes, `vercel.json`, and tests were not edited. Nothing was committed, pushed, or deployed.

## Before

`npm audit` (and `npm audit --json`) reported **0 vulnerabilities**.

| Severity | Count |
| --- | ---: |
| info | 0 |
| low | 0 |
| moderate | 0 |
| high | 0 |
| critical | 0 |
| **total** | **0** |

Dependency tree counted by npm: 75 prod, 87 dev, 66 optional, 1 peer (162 total).

No advisory names, package names, or severities were listed, because the vulnerability map was empty. No fix was available, including no fix that would require a major version bump.

## What changed

Nothing.

`npm audit fix` was not run. There were no safe (non-major) fixes to apply, and no major-only fixes to decline. `package.json` and `package-lock.json` were left unchanged.

## After

`npm audit` was run again in the same directory. Result is unchanged: **found 0 vulnerabilities** (info 0, low 0, moderate 0, high 0, critical 0).

### Production dependencies only

`npm audit --omit=dev` (and `--json`) reported **found 0 vulnerabilities** (info 0, low 0, moderate 0, high 0, critical 0).

## Left unfixed on purpose

None. There is no remaining advisory in this audit, and no major upgrade was skipped.
