# Contributing

Contributions are welcome from anyone — bug reports, docs fixes, and pull
requests alike. No CLA, no contributor agreement: by opening a PR you agree
your contribution is licensed under the [MIT License](LICENSE), same as the
rest of the project.

## Before you start

For anything larger than a bug fix or a docs tweak, open an issue first and
describe what you want to change. It's cheaper for both of us than a PR that
turns out to go the wrong direction. Small fixes need no issue — just send
the PR.

## Getting set up

Requirements: Node 22+, Docker (for local Postgres).

```bash
git clone https://github.com/saswatsaubhagya/obs-alert.git
cd obs-alert
npm install
docker compose up -d                    # Postgres on localhost:5433
cp .env.example .env                    # then set AUTH_SECRET: openssl rand -base64 32
npm run db:migrate                      # create the schema
npm run db:seed                         # seed the EventType table
npm run dev                             # http://localhost:3000
```

The test suite uses a **separate database**, created once:

```bash
docker compose exec -T db psql -U postgres -c 'CREATE DATABASE obsalert_test'
npm run db:test:deploy
```

`resetDb()` truncates every table, so the suite refuses to run if
`TEST_DATABASE_URL` and `DATABASE_URL` resolve to the same database. Don't
work around that check — it is the only thing standing between a test run and
your development data.

## Before you open a PR

All four must pass:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

CI builds the Docker image on every PR, so a broken `npm run build` fails there
too.

## What a good PR looks like

- **One change per PR.** A bug fix and a refactor in one branch is two PRs.
- **Tests for behaviour changes.** New logic, a fixed bug, a changed contract —
  add or update a test under `tests/`. The suite is plain Vitest against a real
  Postgres; follow the existing files, there are no fixtures or mocks to learn.
- **Match the surrounding code.** Same naming, same structure, same comment
  density. Comments here explain *why*, not *what* — see the Dockerfile or
  `src/proxy.ts` for the house style.
- **Describe the why in the PR body.** What breaks without this change, and how
  you verified it works.
- **Don't commit** `.env`, generated output, or editor/agent tooling configs.

## Project rules

Two rules are not negotiable, both learned from real bugs:

1. **Every `'use server'` export must validate its arguments at runtime before
   they reach Prisma.** A server action's parameters are wire input,
   deserialized from a request body; the TypeScript types guarantee nothing
   about what actually arrives. Build the object you pass to Prisma field by
   field from an allow-list — never spread a caller-supplied patch into
   `update`/`create`, since an unchecked `userId` in it selects another tenant's
   row. Check value types, and return a 400-shaped result for bad input rather
   than throwing.
2. **`src/proxy.ts` keeps its name.** On Next.js 16.3.4 a file named
   `middleware.ts` is bundled as Edge Middleware, and Edge cannot load
   `@node-rs/argon2`'s native module. Renaming it breaks password auth.

Read `AGENTS.md` before writing code — this repo runs a Next.js version whose
APIs and conventions differ from most published examples, and the real docs
ship in `node_modules/next/dist/docs/`.

## Reporting bugs

Open an issue with: what you did, what happened, what you expected, and your
Node version plus how you're running the app (local `npm run dev`, Docker
image, behind a proxy). If it involves an alert not firing, include the
request you sent and the response you got back — with the ingest key redacted.

## Security issues

Don't open a public issue for a vulnerability. Report it privately through
GitHub's [security advisories](https://github.com/saswatsaubhagya/obs-alert/security/advisories/new)
instead.
