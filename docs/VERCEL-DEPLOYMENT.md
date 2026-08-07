# Vercel Deployment

This deployment path uses only free-tier services:

- Vercel Hobby plan for static hosting and serverless API routes.
- Upstash Redis Free tier for persistent account and game data.
- GitHub remains the source repository.

Do not enable Vercel Pro, Upstash Pay as You Go, paid fixed Upstash plans, automatic overages, or any option that asks for a credit card. If a free-tier limit is reached, stop and allow the service to fail or rate-limit instead of upgrading automatically.

## 1. Import The Repository Into Vercel

1. Sign in to Vercel with the account that has access to `jbullis/number-ninja`.
2. Confirm the Vercel account or team is on the Hobby/free plan.
3. Choose **Add New...** -> **Project** -> import `jbullis/number-ninja`.
4. Keep the project lightweight:
   - Framework preset: **Other** or Vercel's detected static/default project.
   - Build command: leave empty.
   - Output directory: leave empty.
5. Do not enable paid add-ons such as Analytics, Speed Insights, paid deployment protection, or team Pro features.

## 2. Create Upstash Redis Free Database

1. Sign in to Upstash.
2. Create a Redis database.
3. Select the **Free** plan only.
4. Do not enter a credit card.
5. Do not choose Pay as You Go or a fixed paid plan.
6. Copy the database REST credentials:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

As of August 7, 2026, Upstash lists Redis Free at `$0/month` with 256 MB data size and 500K commands per month. If the Upstash UI shows different terms, stop before creating the database.

## 3. Add Vercel Environment Variables

In Vercel, open the Number Ninja project -> **Settings** -> **Environment Variables** and add:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
ADMIN_TOKEN
```

Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to every Vercel environment that should preserve accounts:

- Preview
- Production
- Development, only if you use `vercel dev`

Add `ADMIN_TOKEN` only if you want `/admin.html` and `/api/admin` enabled. The admin API fails closed with `admin_not_configured` when `ADMIN_TOKEN` is not set.

Never commit real values. `.env.example` contains names only.

## 4. Deploy `feature-k5-expansion` As Preview

1. In GitHub, push the `feature-k5-expansion` branch.
2. In Vercel, ensure Git integration is enabled for preview deployments.
3. Vercel should create a Preview Deployment for that branch automatically.
4. Do not merge into `main` and do not change the production branch.

## 5. Verify The Preview

Open the Preview Deployment URL and check:

1. `/` loads the student game.
2. `/family.html` loads Parent Dojo.
3. `/api/player` returns JSON like:

```json
{"ok":true,"service":"number-ninja","schema":2,"hint":"POST here with an action."}
```

4. Create a test student with a 4-digit PIN.
5. Sign out, sign back in, and confirm progress persists after solving and saving.
6. Create a parent account in `/family.html`.
7. Create or link a child, update grade controls, reset a child PIN, rename a child, unlink a child, and confirm child progress remains.
8. If `ADMIN_TOKEN` is set, open `/admin.html`, enter the token, and confirm stats load.

## 6. Confirm No Paid Features Are Enabled

Before using the deployment broadly:

1. Vercel account/team plan shows **Hobby**.
2. Upstash database plan shows **Free**.
3. Upstash account has no credit card and is not Pay as You Go.
4. Vercel project has no paid add-ons enabled.
5. No automatic overage or upgrade setting is enabled.

If Vercel or Upstash asks for billing information, a paid plan, or pay-as-you-go authorization, stop. The app is designed to use the free limits and fail or rate-limit when those limits are exhausted.

## Data Compatibility

Records keep the existing `player:<lowercase username>` key format and the existing JSON record shape. Legacy student records without `accountType` or K-5 controls are still treated as students and default to Grade 4 without changing saved game progress.
