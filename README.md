# Number Ninja

Number Ninja is a lightweight K-5 math practice app with student accounts, Parent
Dojo controls, adaptive placement, mastery challenges, assignments, learning plans,
badges, cosmetics, and parent reporting.

The app intentionally stays plain HTML/CSS/JavaScript. There is no framework, no
build step, and no paid runtime dependency.

## Current Architecture

- Frontend: `index.html`, `family.html`, and files in `js/`.
- API: Vercel serverless routes in `api/`.
- Persistence: Upstash Redis REST through `lib/storage.js`.
- Data keys: player records use `player:<lowercase username>`.
- Activity history: recent detailed attempts are stored in monthly activity bucket
  keys, with compact permanent summaries in the base activity key.

Required runtime environment variables:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Optional:

```text
ADMIN_TOKEN
```

`ADMIN_TOKEN` enables `/admin.html` and `/api/admin`. Without it, the admin API
fails closed with `admin_not_configured`.

## Deployment

Use Vercel Hobby and Upstash Redis Free only. Do not enable Vercel Pro, Upstash
Pay as You Go, paid add-ons, paid overages, cron, analytics, or real-money
features.

See [docs/VERCEL-DEPLOYMENT.md](docs/VERCEL-DEPLOYMENT.md) for exact setup,
Preview deployment, data migration, and no-paid-feature verification steps.

## Legacy Cloudflare Migration

The production runtime no longer depends on Cloudflare Pages Functions or
Cloudflare KV. The Cloudflare migration utility is retained only for copy-only
cutover from old KV data into Upstash:

```bash
node scripts/migrate-cloudflare-kv-to-upstash.js --dry-run
node scripts/migrate-cloudflare-kv-to-upstash.js
```

The migration script does not delete Cloudflare data and does not change player
record formats.

## Testing

Tests are plain Node scripts:

```bash
node familytest.js
node phase1test.js
node curriculumtest.js
node wbtest.js
node admintest.js
node storagetest.js
node migrationtest.js
node placementtest.js
node masterytest.js
node dailytest.js
node recommendationtest.js
node dateintegritytest.js
node assignmenttest.js
node assignmentexecutiontest.js
node learningplantest.js
node achievementtest.js
node cosmetictest.js
node currencyintegritytest.js
node phase4ctest.js
node phase5atest.js
node phase5retentiontest.js
node phase5breporttest.js
node phase5cfinaltest.js
```

`e2e.js` requires Playwright. It is optional for local development unless
Playwright is installed.

## Release Readiness

See [docs/RELEASE-READINESS.md](docs/RELEASE-READINESS.md) for the current
production-readiness checklist, known limitations, security model, and rollback
considerations.

## License

MIT for the code. See `LICENSE`.
