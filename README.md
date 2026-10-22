# Inoread Apps

A pnpm monorepo for small mobile-first SPAs. Apps deploy independently to Cloudflare Pages; a shared Worker routes `/api/*` requests to D1 and validates Cloudflare Access identity tokens. TypeScript settings are shared and strict, with Oxlint and Oxfmt configured at the repository root.

## Structure

- `apps/starter` — Vite + React + TypeScript starter app
- `apps/timer` — configurable workout intervals, built with generator-based MVU
- `workers/api` — Cloudflare Worker API, shared across app subdomains
- `workers/api/migrations` — D1 schema migrations

## Local development

```sh
pnpm install
pnpm dev
```

Run `pnpm check` before committing to typecheck, lint, verify formatting, and run tests. Use `pnpm format` to apply Oxfmt.

Vite runs at `http://localhost:5173` and proxies `/api` to the Worker on port 8787. The local Worker does not receive Cloudflare Access identity headers, so authenticated data calls return 401 locally; the Pages UI itself works. A local-only auth stub can be added if you want to develop data flows before configuring Access.

## Timer

Run `pnpm --filter @inoread/timer dev` and open `http://localhost:5174`. The default workout is 2 minutes × 30 intervals; try 0 minutes, 3 seconds × 3 for a quick test. Each interval ends with a beep, including the final one. Pause/resume and reset are supported.

Keep the page visible and the screen unlocked. The app requests a screen wake lock where supported, but mobile browsers cannot guarantee background or lock-screen beeps. Test the sound on your phone before using it for a workout.

Expand **Event stream** to inspect recent events, download the session log, or verify replay without repeating effects. State and logs are in memory only; reload starts fresh. See `architecture.md` and `apps/timer/PLAN.md` for the design.

## Cloudflare setup

1. Create a D1 database named `inoread-apps` and set its ID in `workers/api/wrangler.jsonc`.
2. Create a Cloudflare Access self-hosted application covering `*.inoread.com`, with Google as an identity provider and a policy allowing your account.
3. In Access, create an application audience for the protected app/API hostname(s). Set the Worker `ACCESS_ISSUER` to your team issuer and `ACCESS_AUD` to the relevant audience tag. The Worker verifies the Access JWT; it never trusts a user ID supplied by the browser.
4. Apply the schema: `pnpm --filter @inoread/api exec wrangler d1 migrations apply inoread-apps --remote`.
5. Deploy the Worker: `pnpm --filter @inoread/api deploy`.
6. Create a Cloudflare Pages project from the repository root (build command `pnpm --filter @inoread/starter build`, output directory `apps/starter/dist`) and attach a subdomain such as `starter.inoread.com`. For the timer, use `pnpm --filter @inoread/timer build`, output `apps/timer/dist`, and attach `timer.inoread.com`.
7. Add more apps under `apps/`. Each hostname gets its own D1 namespace automatically, while the same Access user ID keeps the account consistent across devices.

The Worker route requires the app subdomains to be proxied through Cloudflare DNS. Configure Pages custom domains and Access coverage for each app hostname. Keep credentials and Access configuration out of client-side code.
