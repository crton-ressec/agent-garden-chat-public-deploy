# Agent Garden waitlist worker module

This is an **additive** Cloudflare Worker package for the existing `agent-garden-d1-api` worker. It contains the waitlist migration and routes requested by the launch-gate phase:

- `GET /v1/waitlist/status/:userId`
- `POST /v1/waitlist/gift`
- `GET /v1/waitlist/stats`
- `POST /v1/admin/waitlist/admit-wave`
- `POST /v1/admin/waitlist/force-unlock`
- `POST /v1/admin/waitlist/adjust-points`

## Deploy

1. Copy `migrations/0002_waitlist.sql` into the existing D1 worker's migration directory, or run it against the existing D1 database.
2. Merge the route logic from `src/index.js` into the existing worker rather than replacing the existing chat, auth, credit, file, and Stripe routes.
3. Set the existing worker's `WORKER_KEY` and the app's `D1_WORKER_KEY` to the same value. Keep both in Cloudflare/Render secrets; never commit them.
4. Set the existing worker's `ADMIN_EMAIL` or `ADMIN_SUBJECT` only in Worker secrets/vars.
5. Run the migration with the existing worker's normal Wrangler project:

```bash
wrangler d1 migrations apply agent-garden-d1 --remote
wrangler deploy
```

`wrangler.toml` is a reference configuration only. Replace the database ID with the existing D1 database ID; do not create a second database accidentally.
