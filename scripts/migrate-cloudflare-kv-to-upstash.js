#!/usr/bin/env node
const { createUpstashStore } = require("../lib/storage");
const { createCloudflareKvSource, migratePlayerRecords, MigrationConfigurationError } = require("../lib/kv-migration");

function usage() {
  console.log("Usage: node scripts/migrate-cloudflare-kv-to-upstash.js [--dry-run] [--no-verify]");
}

function printSummary(summary, dryRun) {
  console.log("");
  console.log("Migration summary");
  console.log("total Cloudflare player keys found: " + summary.totalFound);
  console.log("records copied: " + summary.copied);
  if (dryRun) console.log("records that would be copied: " + summary.wouldCopy);
  console.log("records already identical: " + summary.alreadyIdentical);
  console.log("conflicts: " + summary.conflicts);
  console.log("failures: " + summary.failures);
  if (summary.conflictKeys.length) console.log("conflict keys: " + summary.conflictKeys.join(", "));
  if (summary.failureKeys.length) {
    console.log("failure keys:");
    for (const item of summary.failureKeys) console.log("- " + item.key + ": " + item.error);
  }
  console.log("final summary: " + (summary.ok ? "SUCCESS" : "FAILED - review conflicts/failures before cutover"));
}

async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const verify = !argv.includes("--no-verify");
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    return 0;
  }

  const source = createCloudflareKvSource(process.env);
  const destination = createUpstashStore(process.env);
  const summary = await migratePlayerRecords(source, destination, { dryRun, verify, logger: console });
  printSummary(summary, dryRun);
  return summary.ok ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    if (err instanceof MigrationConfigurationError) {
      console.error(err.message);
      console.error("Required Cloudflare env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID, CLOUDFLARE_API_TOKEN");
      console.error("Required Upstash env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN");
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  });
}

module.exports = { main, printSummary };
