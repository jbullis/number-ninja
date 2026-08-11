# Release Readiness

This document summarizes the K-5 expansion state before any merge or production
promotion. It is a checklist for final manual validation, not approval to deploy.

## Architecture

- Vercel Hobby serves static files and serverless API routes.
- Upstash Redis Free stores player records and activity buckets.
- GitHub remains the source of truth.
- No framework, build step, cron, paid analytics, paid add-ons, or real-money
  functionality is required.

Required runtime variables:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Optional:

```text
ADMIN_TOKEN
```

`ADMIN_TOKEN` enables token-gated admin stats. The admin API fails closed when it
is absent.

## Completed Feature Areas

- Phase 1: accounts, onboarding, parent linking, child rename/reset/unlink.
- Phase 2A: adaptive placement with server-scored responses.
- Phase 2B: mastery challenge, Black Belt certification, spaced review.
- Phase 2C: recommendations, daily goals, streaks, grace days, vacation pauses.
- Phase 3A: parent assignment creation, editing, scheduling.
- Phase 3B: student assignment execution, progress, rewards.
- Phase 3C: persistent remediation/enrichment learning plan.
- Phase 4A: achievements, badges, history.
- Phase 4B: cosmetics, shop, server-authoritative purchases.
- Phase 4C: economy balance and anti-farming.
- Phase 5A: server-authoritative ordinary practice and 90-day detailed activity.
- Phase 5B: parent reports, alerts, CSV export, print/PDF layout.
- Phase 5C: final curriculum, generator, security, rename, and release audit.

## Data Model Overview

- Main record: `player:<lowercase username>`.
- Activity summary: `player:<lowercase username>:activity`.
- Detailed activity buckets: `player:<lowercase username>:activity:YYYY-MM`.
- Detailed attempts are retained for 90 days by server timestamp.
- Permanent daily and skill summaries remain in the base activity summary.
- Child rename migrates main record, parent child list, activity summary, and
  retained monthly activity buckets.

## Security Model

- Usernames are case-insensitive.
- PINs are four digits by design and stored only as salted SHA-256 hashes.
- Parent-only actions require parent authentication and child linkage.
- Student actions cannot mutate parent controls.
- Browser answers submit question IDs and choice IDs; server scores ordinary
  practice, placement, mastery, and assignment questions.
- General save cannot mint coins or forge server-owned academic counters.
- Cosmetic purchases and assignment rewards are server-authoritative and
  idempotent.
- Reports and CSV exports exclude PIN hashes, answer keys, currency internals, and
  anti-fraud state.

## Test Coverage Map

- `familytest.js`: Parent Dojo structure and static UI contracts.
- `phase1test.js`: accounts, onboarding, linking, legacy Grade 4 behavior.
- `curriculumtest.js`: K-5 curriculum graph basics and grade bands.
- `wbtest.js`: legacy Workbook Quest generator and answer correctness.
- `admintest.js`: optional admin endpoint security.
- `storagetest.js`: Upstash REST storage adapter.
- `migrationtest.js`: copy-only Cloudflare KV to Upstash migration.
- `placementtest.js`: adaptive placement and integrity protections.
- `masterytest.js`: mastery challenge, review, certification behavior.
- `dailytest.js`: daily goals, streaks, grace, vacation.
- `recommendationtest.js`: recommendation priority.
- `dateintegritytest.js`: hardened local date validation.
- `assignmenttest.js`: parent assignment model and validation.
- `assignmentexecutiontest.js`: student assignment execution and rewards.
- `learningplantest.js`: persistent remediation/enrichment.
- `achievementtest.js`: badges and public sanitization.
- `cosmetictest.js`: cosmetic ownership, purchase, equip.
- `currencyintegritytest.js`: coin authority and anti-minting.
- `phase4ctest.js`: economy balance and reward stacking.
- `phase5atest.js`: server-scored ordinary practice and activity history.
- `phase5retentiontest.js`: 90-day bucketed activity retention.
- `phase5breporttest.js`: parent reporting, filters, alerts, CSV.
- `phase5cfinaltest.js`: final generator/security/rename release audit.

## Known Limitations

- Upstash writes are practical last-write updates, not multi-key ACID
  transactions. Idempotency and bounded ledgers reduce duplicate reward risk.
- Browser print/save is used for PDF output. No paid PDF API is used.
- Raw attempt detail is intentionally retained for 90 days; older reports use
  permanent summaries when available.
- Legacy Workbook Quest story stars remain compatibility state. Large story,
  boss-clear, and level-up coin payouts remain disabled unless server-verifiable
  milestone evidence exists.
- Legacy power-up ownership is preserved. Server currency does not trust a
  client-supplied coin boost multiplier.
- The one-time Cloudflare KV migration utility remains for copy-only cutover, but
  production runtime does not require Cloudflare variables.
- Playwright may be unavailable in a local environment. If unavailable, run the
  Node regression suite and complete manual Preview smoke checks.

## Production Promotion Checklist

Do not execute these steps until explicitly approved.

1. Confirm Vercel project is on Hobby/free.
2. Confirm Upstash database is on Free and has no pay-as-you-go or automatic
   overage setting.
3. Confirm Production env vars contain only required runtime values and optional
   `ADMIN_TOKEN` if admin is intended.
4. Rotate or verify secrets before production cutover.
5. Dry-run Cloudflare KV copy if existing production data is still in KV.
6. Run the copy-only migration if needed and resolve conflicts manually.
7. Run the full Node test suite.
8. Smoke test Preview with fresh K, Grade 1, Grade 3, Grade 5, and legacy Grade 4
   records.
9. Verify parent report CSV and print/PDF.
10. Merge only after review approval.
11. Deploy Production from the approved production branch.
12. Smoke test Production.
13. Keep old data/export available until Vercel production is verified.

## Rollback Considerations

- Do not delete legacy Cloudflare KV data during cutover.
- Keep GitHub branch history intact.
- If Production promotion fails, revert the production deployment in Vercel and
  continue serving the previous production branch while inspecting Preview data.
- Upstash player records preserve legacy JSON shapes where practical.

## Current Recommendation

READY FOR FINAL MANUAL VALIDATION, assuming the full test suite remains green and
Preview smoke testing passes.
