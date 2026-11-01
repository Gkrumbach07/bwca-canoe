# The co-op relay

A Cloudflare Worker and a Durable Object per room (docs/plans/coop.md, "The architecture for a static site"). Rooms are
keyed by a six-letter code; the room forwards each browser's messages to the others, keeps the host's last snapshot for
a joiner, and forgets everything ten minutes after the last one leaves. The game stays a static site on Pages.

## Locally

```bash
cd server/room && npm install
npm run dev          # ws://localhost:8787, the address the game's dev build uses by default
npm run dev:slow     # the same with 100 ms added to every message it forwards (the two-browser test)
RELAY=ws://localhost:8787 npm test
```

In development the game reads `?relay=ws://localhost:<port>` to use another port. The two-browser rig is
`scripts/coop/two-browsers.mjs` (two headless Chromiums join one room and paddle; it writes a report and a screenshot pair).

## Deploying (once)

The R2 bucket already lives in a Cloudflare account; the relay goes in the same one.

1. Cloudflare dashboard → *My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"* template, for that account.
2. GitHub → the repository → *Settings → Secrets and variables → Actions*:
   - secret `CLOUDFLARE_API_TOKEN`: the token
   - secret `CLOUDFLARE_ACCOUNT_ID`: the account ID (the dashboard's right-hand column on *Workers & Pages*)
3. Run *Actions → Deploy the co-op relay → Run workflow* (or push a change under `server/room/`). It prints the
   Worker's address, `https://bwca-canoe-room.<subdomain>.workers.dev`.
4. Set the repository **variable** `RELAY_URL` to that address with `wss://` in front, and run the Pages workflow. The
   game then shows *Invite friends* on the pause card of a Sandbox season and *Join a trip* on the title.

Without `RELAY_URL` the built game has no co-op items at all. The free plan covers it: SQLite-backed Durable Objects,
about 100k requests a day.
