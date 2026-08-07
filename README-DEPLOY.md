# Number Ninja, deploy to Vercel with saved progress

Number Ninja now deploys as a lightweight Vercel project:

```text
index.html and family.html      static frontend
api/player.js                   student + parent account/save API
api/parent-login.js             parent-only login API
api/admin.js                    optional token-gated admin stats API
lib/storage.js                  Upstash Redis REST persistence adapter
docs/VERCEL-DEPLOYMENT.md       full free-tier setup guide
```

There is no framework and no build step. Vercel serves the HTML/CSS/JS files as
static assets and turns files in `api/` into serverless functions.

## Required environment variables

Set these in Vercel for Preview deployments:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Optional:

```text
ADMIN_TOKEN
```

`ADMIN_TOKEN` enables `/api/admin` and `/admin.html`. Without it, admin stats fail
closed with `admin_not_configured`.

Do not commit real values. Use `.env.example` as the variable-name template.

## Free-tier requirement

Use Vercel Hobby and Upstash Redis Free only. Do not enable Pro, paid fixed plans,
Pay as You Go, paid add-ons, automatic upgrades, or paid overages. If a free-tier
limit is reached, stop and allow rate-limiting/failure instead of upgrading.

See [docs/VERCEL-DEPLOYMENT.md](docs/VERCEL-DEPLOYMENT.md) for exact setup and
verification steps.
