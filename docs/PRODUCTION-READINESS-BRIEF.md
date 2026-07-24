# FounderOS: Production-Readiness Brief

Audience: the Claude Code agent (and engineers) working inside this repo.
Author: Operator, an outside collaborator, at the repo owner's invitation.
Status: awareness and a verified map, not a mandate. Prioritize with the owner.

## Read this first (plain summary)

FounderOS is in genuinely good shape. On a fresh clone everything builds, all 869
tests pass, every page loads, and there are no secrets leaked in git history. This
brief is not a list of things that are broken. It is a map of what it takes to go
from a strong single-user build to production and multi-tenant, plus a handful of
small real bugs worth fixing along the way.

The four things that matter most:

1. Auth. There is no login or user model yet. Nothing should be exposed on the
   internet until that exists. This is the biggest single gap.
2. Empty state. The dashboards show seeded demo numbers as if they were real,
   because the database seeds itself on first run. For a real product, and for every
   new customer, it should start empty and fill only as integrations connect. The
   app already has most of the machinery for this; it mainly needs to stop seeding
   by default.
3. Supabase and multi-tenant. Supabase is not actually the app's database today, and
   there is no multi-tenant support yet. Both are real builds, not a config toggle.
   The brief lays out two ways to get there.
4. A short list of small, safe fixes: three connectors that show "connected" without
   checking, a file-permission gap on saved keys, and a database setting, worth doing
   regardless of the roadmap.

How to use this: hand it to the Claude Code agent working in the repo. Every item
has a file, a reason, a fix, and a way to verify, and it is written to be worked
through in the order in Section 13, not all at once. It is input, not instructions.
The priorities are yours.

## 0. How to use this document

This is a survey of what stands between FounderOS today and "truly production
ready," written so an agent working in this repo can investigate, verify, and fix
in a sensible order. It is deliberately exhaustive. It is not a demand to do all of
it, and it is not a redesign. The existing architecture is good; most of this is
hardening, an honest empty state, and a few structural additions.

Working rules for anyone acting on this (from `AGENTS.md` and `CLAUDE.md`, restated
so they are not missed):

- Do not push to `main` or any remote without the owner's explicit yes. Work on a
  `founder-os` branch, small checkpoints, often.
- TDD. Failing test first in `tests/`, then implement. `npm test` and
  `npm run typecheck` must be green before claiming anything done.
- Everything reads and writes through the repo layer (`lib/db.ts` repos +
  `lib/schemas.ts` Zod + `lib/seed.ts`). Never query SQLite from a page or route.
- `/org` markup is frozen. Do not restructure it.
- Do not kill the dev server on 4100. If an edit crash-loops hot reload it can
  corrupt `.next`; fix fast, and if needed `rm -rf .next` and restart.
- No em or en dashes in written output. Never commit secrets.
- Verify every finding below against the current code before acting. Line numbers
  are accurate as of this writing but will drift.

Each finding uses the same shape: what it is, where, why it matters for production,
the fix, and how to verify.

## 1. What FounderOS is today

A single-user "operator OS": a web dashboard that presents one founder's business as
AI-assisted departments (home console, comms inbox, social growth, agent roster, org
chart, a knowledge brain graph, client funnel, finances, roadmap, integrations).

- Stack: Next.js 14 App Router with React server components, TypeScript, Tailwind.
  One app on port 4100. No backend service beyond Next.js API routes.
- Data base: a single local `better-sqlite3` file, `data/founder-os.db`
  (`lib/data.ts:15`), seeded with placeholder data on first touch, read through one
  repo layer (`lib/db.ts`) with Zod validation on the way out.
- Integrations: about 19 connectors in `lib/connectors/*`, each returning an honest
  `ConnectorStatus`. Some call hosted APIs (Slack, Stripe, Notion, Beehiiv,
  ManyChat, Attio, WebinarJam, GoHighLevel, Meta Ads, email over IMAP, calendar).
  Some read the local Mac directly (WhatsApp desktop DB, Wispr, Obsidian vault,
  local ports and Homebrew binaries, the gbrain CLI).

The three seams that matter for everything below: the repo layer (`lib/db.ts`), the
credential resolver (`lib/creds.ts`), and the connector isolation (`lib/connectors/*`).
Because all data, all credentials, and all integrations each pass through a single
choke point, the large changes in this brief attach to three places rather than
being smeared across 19 pages.

## 2. Current health baseline (the good starting point)

Verified on a fresh clone:

- `npm install`, `npm run typecheck` clean, `npm test` = 869 tests pass across 98
  files, `npm run build` succeeds, `npm run seed` populates 27 tables.
- Live server returns 200 on all 17 pages and every API route, no runtime errors.
- Git history contains no leaked secrets (scanned all blobs for live-key patterns).
- A test already asserts secrets never leak into a connector status payload.

This is why the work below is tractable. The foundation is disciplined and tested.

## 3. The production-readiness gap at a glance

The big rocks, in rough order of weight:

1. There is no authentication, session, or user/tenant model anywhere. This is the
   single largest gap for any deployment past a personal laptop.
2. The database is one shared SQLite file with no tenant scoping. Multi-tenant needs
   data isolation.
3. The dashboards show seeded numbers as if real, because the database is seeded on
   first touch and most pages render whatever is in the table. A real product, and
   every new tenant, must start empty and fill only from real integrations
   (Section 5).
4. Credentials resolve from the developer's home directory. That does not survive a
   move to a server, and it cannot be per-tenant as written.
5. About a third of the connectors read the local Mac and have no meaning on a Linux
   server. A hosted product needs a decision on each.
6. A handful of concrete correctness, security, and reliability bugs (Sections 6 to
   8) that are worth fixing regardless of the deployment story.
7. Supply-chain: six high-severity dependency advisories.

Sections 4 to 12 break these into workstreams with concrete tasks.

## 4. Workstream: security hardening

### 4.1 No auth on any route, several with real side effects (systemic, P0 before any exposure)

There is no `middleware.ts` and no auth check on any route. Confirmed: only the
ManyChat webhook does any gating. Several routes have real side effects reachable by
anyone who can reach the port:

- `app/api/connections/connect/route.ts` and `app/api/keys/route.ts` write values
  into `.env.local` (and `/api/keys` mutates live `process.env`). An attacker can
  overwrite `STRIPE_SECRET_KEY`, `SLACK_BOT_TOKEN`, inbox passwords, and more.
- `app/api/comms/reply/route.ts` sends real Slack messages and real SMTP email from
  the configured inbox. `app/api/social/dm/reply/route.ts` sends a real Instagram DM
  via ManyChat.

Why it matters: the moment this binds past loopback without auth it is credential
overwrite plus outbound-message abuse.

Fix: add an auth layer and a `middleware.ts` that rejects unauthenticated requests
before any route runs. For a single-tenant VPS milestone, even one-user login or
HTTP basic auth at the proxy is enough. For multi-tenant, this becomes the tenant
resolver (Section 9).

Verify: an unauthenticated request to any `/api/*` mutation returns 401.

### 4.2 `.env.local` written world-readable (P1, confirmed)

`lib/creds.ts:95` passes `{ mode: 0o600 }` to `writeFileSync`, but the mode only
applies when the file is created. On an existing `.env.local` (the common case) the
mode is unchanged, so it stays at the umask default, typically `0644`. The second
writer at `lib/keys.ts:79` passes no mode at all. This file holds Stripe keys and
Gmail app passwords.

Fix: call `fs.chmodSync(file, 0o600)` after the write, in both `lib/creds.ts` and
`lib/keys.ts`.

Verify: after an upsert against a pre-existing `0644` file, the mode is `0600`. Add
a test in the style of the existing creds tests.

### 4.3 `/api/keys` returns an uncaught 500 on a multiline value (P2, confirmed)

`app/api/keys/route.ts` accepts any string up to 4096 chars (schema at lines 15 to
18), but `upsertEnvLocal` in `lib/keys.ts:55` throws on a newline, and the route
does not catch (call at line 30). Body `{"envVar":"NOTION_API_KEY","value":"a\nb"}`
passes validation, then 500s with a stack in dev.

Fix: add `.regex(/^[^\n\r]+$/)` to the value in `SetKeySchema`, or wrap the upsert
in try/catch and return 400. The sibling `connect` route already handles this
correctly, so mirror it.

Verify: the multiline body returns 400, not 500.

### 4.4 ManyChat webhook secret compare and open-by-default (P2 to P3)

`app/api/webhooks/manychat/route.ts:19` gates with a plain string compare, not
`crypto.timingSafeEqual`. Timing recovery over HTTP is impractical, so this is low,
but if you touch it, make it constant-time. More relevant: when
`MANYCHAT_WEBHOOK_SECRET` is unset the endpoint is fully open and any POST can
insert DM rows (`getDb().social.upsertDmMessage` at line 29). Stored text renders
through normal React escaping, so it is not stored XSS, but for production the
secret should be required, not optional.

Fix: require the secret in production, and use `crypto.timingSafeEqual` on
equal-length buffers.

### 4.5 Unbounded request-body reads on the upload routes (P3, DoS)

`app/api/finances/bank-statement/route.ts:44` (`req.arrayBuffer()`) and
`app/api/finances/statements/route.ts:19` (`req.text()`) read the whole body into
memory with no size cap. App Router route handlers do not impose the old pages-API
limit. Add an explicit size cap before reading. Moot behind loopback, real once
public.

### 4.6 Confirmed safe, do not chase these

To save time: all SQL is parameterized through the repo layer including the
dynamically sized `deleteWhereIdNotIn` (but see 6.2); GET endpoints never return
secret values (`/api/keys` GET is masked, `/api/connections` returns state only);
the `connect` route allowlists env keys and rejects newlines and writes `0600`
intent; JSON parsing is guarded everywhere; the PDF path uses `execFile` with fixed
args and no shell; there is no SSRF (connectors post to fixed hosts); `brain/dump`
folder and title are regex and slugify guarded.

## 5. Workstream: empty state and seeded-data honesty (start empty unless integrated)

This is the one that makes the product honest for a real user, and it is a
prerequisite for multi-tenant, where every new tenant's first login must be an empty
OS that fills as they connect.

The problem: the dashboards show numbers even when nothing is integrated. The
connectors are honest ("not configured"), but the numbers on the pages are not,
because they come from the seeded database, not from the connectors. Most pages read
whatever is in the table without checking whether it came from a real integration or
from the seed.

Root cause: `lib/data.ts:18` seeds the database unconditionally on first touch, "so
a fresh clone boots looking alive." That is correct for a demo and wrong for
production and for a fresh tenant. `lib/seed.ts` writes 455 social snapshots, seeded
DM counts (`lib/social.ts:131`, literally "seeded dummy until a real source lands"),
14 funnel contacts with 61 touches, email-list snapshots, metrics, and brain folder
counts.

What is already honest, do not redo these:

- `/analytics` operating metrics: `lib/operating-metrics.ts` carries no seeded
  numbers, splits tiles into live versus pending, and shows an honest dash for
  pending.
- `/finances`: `app/finances/page.tsx:33` treats Stripe as live only when the API
  answers; a present-but-invalid key stays pending, never a fake number.
- The social read helpers already fall to null on an empty table, for example
  `lib/social.ts:113` (`followers: latest.get(...)?.followers ?? null`) and
  `lib/social.ts:335`. They do the right thing when the table is empty; the seed is
  what fills it.
- `agents/real.ts` distinguishes "Serving Attio live" from "Serving seeded funnel."
- Provenance is already recorded: snapshots carry a `source` (for example
  `zernio-config` versus `seed...`), and `lib/db.ts:843` has `deleteSeeded()` for
  the email list.

What still renders seeded data as real, the work:

- Social growth (`/social`): the follower diagrams and audience share read the 455
  seeded snapshots, so they show a full history with zero integrations.
- DM counts and the DM inbox: seeded dummy per `lib/social.ts:131` plus the seeded
  `social_dm_messages`.
- The funnel (`/funnel`): 14 seeded contacts and their touches render as a live
  pipeline.
- The brain viz page counts and the "918 pages" figure on `/brain`.
- Any home pulse tile or card that reads a seeded count.

The fix, in order:

1. Make seeding opt-in. Change `lib/data.ts` so it seeds only under an explicit demo
   flag (for example `FOUNDER_OS_SEED=1`, or a `demo` mode), not on every fresh
   database. A production or fresh-tenant database starts empty. This one change
   makes every already-honest read helper fall to its null, pending, or dash path
   automatically, so a large fraction of the surfaces go correctly empty with no
   page edits.
2. Design and verify an empty state for every card that does not already have one: a
   short "Connect X to populate" message where a chart or number would be, matching
   the honest pattern analytics and finances already use. The connector's own
   `not_configured` detail string is good copy to reuse.
3. For any surface that must coexist with partial data, filter reads to exclude
   seed-sourced rows (extend the `source`-based `deleteSeeded` pattern, or add a
   read variant that excludes `source like 'seed%'`), so a live integration and
   leftover seed never mix.
4. Keep the demo experience available behind the flag, so a sales walkthrough can
   still boot the rich seeded version on purpose. This resolves the tension with the
   project's stated "larp-first" design: larp-first is correct for the demo,
   empty-first is correct for production and for every new tenant.

Verify: with seeding off and no integrations, every page renders an empty state and
no dashboard shows a nonzero number. With a single connector keyed and live, only
that connector's surface populates. Extend the smoke tests
(`tests/smoke.test.ts`, `tests/smoke-api.test.ts`) to assert the empty-state render
path, since they currently run against a seeded DB.

Doing this early also de-risks the seed-data privacy concern, since a fresh instance
would no longer ship one persona's figures.

## 6. Workstream: data layer and integrity

### 6.1 Foreign-key enforcement is never enabled (P1, confirmed)

`lib/db.ts:373` sets `journal_mode = WAL` but never sets `foreign_keys`. The DDL
declares five `REFERENCES` relationships, but whether they enforce depends on the
compiled default of whichever `better-sqlite3` build is installed. On the current
build it is on; on a build defaulting off, orphan rows persist silently. This is a
portability landmine across environments.

Fix: `db.pragma('foreign_keys = ON')` in `openDb`, right after the WAL pragma.

Verify: an insert of a `funnel_touch` with a nonexistent `contact_id` throws
`FOREIGN KEY constraint failed`. Confirm the app-layer insert paths order parent
before child.

### 6.2 `deleteWhereIdNotIn([])` wipes the whole table (P2, confirmed, latent)

`lib/db.ts:391` and five sibling methods build `DELETE FROM t WHERE id NOT IN
(${placeholders})`. With an empty array this becomes `WHERE id NOT IN ()`, which
SQLite treats as always true, so it deletes every row. Verified: an empty array took
skills from 12 rows to 0. Not reachable today because seed callers pass non-empty
constants, but one dynamically built list away from silent data loss.

Fix: early-return when `ids.length === 0`, or make the truncate intent explicit.

### 6.3 Read path has no error isolation (P3, plausible)

Every `rowTo*` mapper calls `Schema.parse(row)` with strict enums and bare
`JSON.parse` and no try/catch (for example `lib/db.ts:365, 478, 507`). Only
`agentMessages` guards its JSON. Because columns are `NOT NULL DEFAULT '[]'` and only
the repos write them, this cannot trigger from current code, but any manual DB edit,
a partial migration, or a future non-repo writer makes `.all()` throw for the entire
result set and takes down the page. For production robustness, add per-row try/catch
(skip and log) on the list reads that back pages.

### 6.4 `FunnelContact.url` is a dead field (P4, cosmetic)

`lib/schemas.ts:487` defines `url` with a default of null, but there is no column in
the `funnel_contacts` DDL, the insert omits it, and the read never selects it, so it
always defaults back to null. Either add the column and wire it, or drop the field.

### 6.5 Confirmed OK in the data layer

Checked and fine: every INSERT column list matches its DDL across all 28 tables; a
fresh seed parses clean through all 34 read methods; migrations guard with
`columns.has(...)` and use defaults on `NOT NULL` adds; double-seed is idempotent
even with FK plus `INSERT OR REPLACE`; the `getDb` singleton is synchronous so there
is no double-seed race; seed insert order respects FKs; date-string ordering is
correct.

## 7. Workstream: connector honesty and reliability

### 7.1 Three connectors fake "connected" (P1, confirmed, on-thesis)

This one matters more than its size because it breaks the project's own stated rule,
"never reports a fake connected," which is printed in each of these file headers:

- `lib/connectors/trakyo.ts:34`
- `lib/connectors/meta-ads.ts:33`
- `lib/connectors/ghl.ts:30`

Each returns `state: 'connected'` the instant a key string is present, with no
network call. Trakyo is the sharpest: its own comment admits there is no public API
yet, so there is nothing to connect to, yet it shows green. GHL claims "LC
opportunities feed the funnel live" on token presence alone. Compare the good
connectors (attio, slack, notion, beehiiv) which all make a real verifying request.

Fix: either make a real verifying probe, or introduce a distinct state such as
`configured` (unverified) so that `connected` always means verified. The
`ConnectorStatus` type in `lib/connectors/types.ts` may need a new state value.

Verify: with a present-but-invalid key and no network, these return the unverified
state, not `connected`.

### 7.2 `wispr` runs a synchronous SQLite read on the request path (P2, confirmed)

`lib/connectors/wispr.ts:25` opens the DB and runs four `COUNT(*)` scans inline,
during the connections-board render. `better-sqlite3` is synchronous, so a slow read
freezes the whole server event loop, not just this connector. The sibling
`whatsapp.ts` deliberately solved exactly this with a bounded child-process read, a
5s SIGKILL, `busy_timeout`, a `maxBuffer` cap, and a 60s status cache.

Fix: mirror the `whatsapp.ts` pattern for `wispr`.

### 7.3 Stripe status has no request timeout (P2, plausible)

`lib/connectors/payments.ts:152` constructs `new Stripe(key)` with no timeout, so it
uses the SDK default near 80 seconds plus retries. Every other network connector
caps at 4 to 8 seconds via `AbortSignal.timeout`. A slow Stripe can hang the
connections board.

Fix: `new Stripe(key, { timeout: 5000, maxNetworkRetries: 0 })`.

### 7.4 Pasted secrets with quotes or padding are silently altered (P3, confirmed)

`parseEnvFile` trims and strips a surrounding quote pair on read (`lib/creds.ts:23`),
but `upsertEnvLocal` writes the value verbatim. So a value like `"abc"` or `  abc  `
reads back different from what was pasted, producing a confusing auth failure. Rare
for typical tokens, real for values that legitimately contain quotes or whitespace.

Fix: quote-wrap on write, or reject or normalize such values at the write boundary,
so read and write are symmetric.

### 7.5 `upsertEnvLocal` primitive lacks key-name validation (P4, latent)

`lib/creds.ts:74` writes any key verbatim, unlike its twin in `lib/keys.ts:53` which
enforces a name regex and rejects newlines. Currently guarded by the callers (the
connect route allowlists keys), but harden the primitive itself for defense in depth.

### 7.6 Confirmed OK in connectors

No secret value leaks into any status detail or meta; `allConnectorStatuses`
(`lib/connectors/index.ts:71`) wraps every check so one throwing connector degrades
to an error status instead of 500ing the page; connectors never mutate the local
files they read (all SQLite opens are readonly with `fileMustExist`); the API-based
connectors cap network calls with timeouts; `whatsapp.ts` is the reference pattern.

## 8. Workstream: multi-tenancy (the largest structural piece)

The five hard blockers. Each ends with what it takes.

### 8.1 No auth, no identity

There is no `middleware.ts`, no session, and no user or tenant record. Multi-tenant
starts here: `users` and `tenants` tables, sessions or JWT, and a `middleware.ts`
that resolves the current tenant on every request before any data is touched.

### 8.2 One global database, shared by everyone

`lib/data.ts:15` opens one file as an app-wide singleton, and there is no `tenant_id`
on any table. Two options in 8.6. A new tenant must also start empty (Section 5).

### 8.3 Credentials come from the developer's home directory

`lib/creds.ts:44` resolves keys from `~/.config/social/.env`,
`~/knowledge/.env.agents`, `~/.config/mcp.json`, `~/Projects/...`, then `.env.local`.
On a server this is one shared filesystem, so every tenant would share one set of
keys. Each tenant needs their own credential store: encrypted DB rows or a secrets
manager, keyed by tenant. This change is contained to `lib/creds.ts` and the two
routes that write keys.

### 8.4 A third of the connectors read the local Mac

Desktop-bound: WhatsApp (`lib/connectors/whatsapp.ts:19`), Wispr
(`lib/connectors/wispr.ts:7`), Obsidian (`lib/connectors/obsidian.ts:6`), G-Brain
CLI and store (`lib/connectors/gbrain.ts:10-11`), local-stack ports and Homebrew
binaries (`lib/connectors/local-stack.ts:42`). On a Linux server these have no
meaning and return not-configured honestly. For a hosted product, decide per
connector: drop it, gate it behind an optional local agent the tenant runs, or
replace it with a hosted API (for example WhatsApp Business API instead of the
desktop database). The hosted API connectors port cleanly with per-tenant keys.

### 8.5 The OS identity "Alex" is hardcoded into the core

`lib/knowledge-graph.ts:152` places a node labeled "Alex" at the center of the brain
graph; `lib/life-map.ts:180` centers the life map on "Alex's Life"; funnel, seed
pillars, and schemas narrate "Alex." The self of the OS must come from the tenant
record, not a constant. This is spread across the visualization and seed layers.

### 8.6 Supabase reality and the two paths

Important, because the UI is misleading here. Supabase is not the application
database today and is not set up for multi-tenancy. There is no Supabase, Postgres,
or auth package in `package.json`; the app persists to the local SQLite file. The
"Supabase" that appears on `/brain` and `/integrations` belongs to a separate tool,
the G-Brain CLI, which uses its own Supabase project for note embeddings and which
this app only shells out to. The rest are seeded demo and roadmap text. So adopting
Supabase for multi-tenant data is a migration to build, not a foundation to switch
on.

Path A, isolated instance per tenant: one container or process per tenant, each with
its own SQLite file via `FOUNDER_OS_DB` and its own `.env.local`, behind a
per-subdomain proxy. Small code change since the app already treats the database and
credentials as per-process. Does not scale past a handful of tenants. Fastest way to
the first two or three real tenants.

Path B, true multi-tenant: one app on Postgres (Supabase fits) with a `tenant_id` on
every table and row-level security, real auth and sessions, a per-tenant encrypted
credential store, an empty starting state per tenant (Section 5), and the desktop
connectors dropped or gated. This is the actual SaaS. It is several bounded pieces:
an auth system, the data-model migration off SQLite, tenant scoping threaded through
the `lib/db.ts` repos, and the identity de-hardcoding from 8.5.

Recommendation: ship Path A on a VPS to prove it with the first tenants, while
building Path B's auth layer and Postgres move in parallel as the durable target. Do
not build multi-tenant on top of `better-sqlite3`; a file database is the wrong
primitive for many tenants in one process, and swapping it later is more painful than
doing it during the auth build.

## 9. Workstream: VPS deployment (single-tenant milestone first)

A plain single-tenant deploy is the sensible first milestone and is achievable
quickly:

- Node 18+, `npm install`, `npm run build`, `npm start` on 4100 behind a reverse
  proxy (Caddy or Nginx) with TLS.
- `better-sqlite3` compiles natively on Linux: install `build-essential` and
  `python3` for the build. Install `poppler-utils` so the finances PDF import works
  (the code already tries a bare `pdftotext` first, at
  `app/api/finances/bank-statement/route.ts:12`).
- The SQLite file auto-seeds on first request today; once Section 5 lands, a
  production instance starts empty instead.
- Set the hosted-connector keys you want live in `.env.local` (mode `0600`).
- The desktop connectors report not-configured; that is correct, not breakage.
- Do not expose it without auth first (Section 4.1). Even single-tenant, the write
  and message-send routes are open.

Note `next.config.mjs` already externalizes `better-sqlite3`, `node-ical`, and
`nodemailer` for server components, so the native build is handled.

## 10. Workstream: dependencies and supply chain

Six high-severity npm advisories.

- `imapflow` to `nodemailer`: on the live email path, fixes with a safe minor bump
  to `imapflow@1.5.0` and `nodemailer@9.0.3`. Do this one.
- postcss advisories: nested inside Next's own tree, clear only with a breaking Next
  16 upgrade. Note and defer for a demo; schedule for production.
- Safe minor bumps available with no breaking change: stripe, postcss top-level,
  autoprefixer, `@notionhq/client`, `ai`, `tsx`.

Verify with `npm audit` and `npm test` after each bump.

## 11. Hardcoded-value inventory (to de-hardcode for any non-Alex tenant)

Grouped, with representative locations:

- Home-directory credential and data paths: `lib/creds.ts:44-47`,
  `lib/connectors/zernio.ts:7`, `lib/connectors/obsidian.ts:6`,
  `lib/connectors/gbrain.ts:10-11`, `lib/connectors/wispr.ts:7`,
  `lib/connectors/whatsapp.ts:19`, `lib/brain-dump.ts:11`, `lib/skills-catalog.ts:20`,
  `scripts/generate-brain-docs.ts:18`.
- macOS binary paths: `lib/connectors/local-stack.ts:42` (`/opt/homebrew/bin`),
  `app/api/finances/bank-statement/route.ts:12`.
- Localhost ports (the desktop stack, not the app's own deps): 4000, 3789, 11434,
  18789 in `lib/connectors/local-stack.ts:46-49` and `app/layout.tsx:35-36`.
- Identity and business specifics: "Alex" across `lib/knowledge-graph.ts`,
  `lib/life-map.ts`, `lib/funnel.ts`, `lib/tree-layout.ts`, `lib/memory-core.ts`,
  `lib/schemas.ts`, `lib/seed.ts`; "Vantage" and "Launchpad Cohort" and
  `owner@example.com` in `lib/finances.ts`, `lib/graph-lens.ts:36-37`,
  `lib/funnel-ghl.ts`. Most business specifics live in `lib/seed.ts` and are the
  seed to be replaced (Section 5); the identity node (8.5) is structural, not seed.
- Database path: `lib/data.ts:15`, single file, overridable only by the global
  `FOUNDER_OS_DB`.

Already parameterized and helpful: `FOUNDER_OS_DB`, `GBRAIN_STORE`, `GBRAIN_BIN`,
`OBSIDIAN_VAULT`, `NEXT_DIST_DIR` are env-overridable.

## 12. Cross-cutting production basics that are missing

Not bugs, but expected before "production":

- Observability: no structured logging, error reporting, or health endpoint.
  Consider a `/api/health` that checks the DB opens and returns build info, plus an
  error reporter once there is auth.
- CI: no CI config in the repo. `npm test` and `npm run typecheck` are fast and
  belong in a pre-merge check.
- Rate limiting on the public webhook and the message-send routes.
- Backups: for SQLite, a file backup or WAL checkpoint routine; for Postgres later,
  managed backups.
- Secrets management: `.env.local` is fine for one machine; multi-tenant needs the
  per-tenant store from 8.3.

## 13. Suggested sequence

- P0: add auth and a `middleware.ts` gate (4.1) before any exposure. Single-user
  login is enough for the first VPS milestone.
- P0 to P1: make seeding opt-in and give each card an empty state (Section 5). This
  is the honest-product change and a hard prerequisite for multi-tenant. Low risk,
  high signal.
- P0 to P1: stand up the single-tenant VPS deploy (Section 9) behind that auth.
- P1: the honest-connector fix (7.1), the `.env.local` chmod (4.2), and the
  `foreign_keys` pragma (6.1). Small, high value, each has a test.
- P1 to P2: the reliability fixes (7.2 wispr, 7.3 Stripe), the `/api/keys` 400 (4.3),
  the `deleteWhereIdNotIn` guard (6.2), the email dependency bump (Section 10).
- P2: build the tenant model and Postgres migration (Path B, Section 8). Do it as its
  own sequence: auth and tenant tables, then the data-layer move with `tenant_id` and
  RLS, then credentials per tenant, then identity de-hardcoding, then the connector
  decisions.
- P3: the remaining hardening (read-path isolation 6.3, body caps 4.5, webhook
  constant-time 4.4), observability and CI (Section 12), and the remaining dep bumps.

## 14. Fast verification commands

- Baseline: `npm install && npm run typecheck && npm test && npm run build`.
- Seed and inspect: `npm run seed`, then open `data/founder-os.db`.
- Live smoke: `npm start`, then curl the pages and `/api/connections`.
- Empty-state check (after Section 5): boot with seeding off and confirm no page
  shows a nonzero number.
- Secret scan before any commit: grep history for live-key patterns.
- After any dependency change: `npm audit` and `npm test`.

## 15. What not to touch or worry about

- The `/org` markup is frozen by owner directive.
- The connectors that read the local Mac are not broken; they are honest about being
  desktop-only. Do not "fix" them into faking data.
- The demo seed data (names, figures, handles) is placeholder by design. It is not a
  data-quality bug; the task is to stop showing it as real (Section 5), not to
  correct the numbers.
- The lists in 4.6, 6.5, and 7.6 were checked and are safe. Do not spend cycles there.

Prepared by Operator as outside awareness for the FounderOS team. Own the
priorities; this is a map, not a mandate.
