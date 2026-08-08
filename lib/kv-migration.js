const PLAYER_PREFIX = "player:";

class MigrationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationConfigurationError";
  }
}

function envValue(env, key) {
  return env && Object.prototype.hasOwnProperty.call(env, key) ? env[key] : process.env[key];
}

function cleanBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

async function readJsonResponse(res, label) {
  let body;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  if (!res.ok || !body || body.success === false) {
    const detail = body && body.errors && body.errors.length ? JSON.stringify(body.errors) : "HTTP " + res.status;
    throw new Error(label + " failed: " + detail);
  }
  return body;
}

function createCloudflareKvSource(env) {
  const accountId = String(envValue(env, "CLOUDFLARE_ACCOUNT_ID") || "").trim();
  const namespaceId = String(envValue(env, "CLOUDFLARE_KV_NAMESPACE_ID") || "").trim();
  const token = String(envValue(env, "CLOUDFLARE_API_TOKEN") || "").trim();
  const baseUrl = cleanBaseUrl(envValue(env, "CLOUDFLARE_API_BASE_URL") || "https://api.cloudflare.com/client/v4");
  if (!accountId || !namespaceId || !token) {
    throw new MigrationConfigurationError("Cloudflare KV credentials are not configured.");
  }

  const root = baseUrl + "/accounts/" + encodeURIComponent(accountId) + "/storage/kv/namespaces/" + encodeURIComponent(namespaceId);
  const headers = { authorization: "Bearer " + token };

  return {
    async listPlayerKeys() {
      const keys = [];
      let cursor;
      for (let guard = 0; guard < 10000; guard++) {
        const url = new URL(root + "/keys");
        url.searchParams.set("prefix", PLAYER_PREFIX);
        url.searchParams.set("limit", "1000");
        if (cursor) url.searchParams.set("cursor", cursor);
        const res = await fetch(url, { headers });
        const body = await readJsonResponse(res, "Cloudflare KV list");
        for (const item of body.result || []) {
          if (item && typeof item.name === "string" && item.name.startsWith(PLAYER_PREFIX)) keys.push(item.name);
        }
        const info = body.result_info || {};
        if (!info.cursor || info.cursor === cursor) break;
        cursor = info.cursor;
      }
      return keys;
    },
    async get(key) {
      const res = await fetch(root + "/values/" + encodeURIComponent(key), { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Cloudflare KV value read failed for " + key + ": HTTP " + res.status);
      return res.text();
    },
  };
}

async function migratePlayerRecords(source, destination, options) {
  const opts = options || {};
  const dryRun = !!opts.dryRun;
  const verify = opts.verify !== false;
  const logger = opts.logger || { log() {}, error() {} };
  const summary = {
    totalFound: 0,
    copied: 0,
    wouldCopy: 0,
    alreadyIdentical: 0,
    conflicts: 0,
    failures: 0,
    conflictKeys: [],
    failureKeys: [],
  };

  const keys = await source.listPlayerKeys();
  summary.totalFound = keys.length;

  for (const key of keys) {
    try {
      const sourceValue = await source.get(key);
      if (sourceValue === null || sourceValue === undefined) {
        summary.failures++;
        summary.failureKeys.push({ key, error: "source_missing" });
        logger.error("FAIL " + key + " source_missing");
        continue;
      }

      const destValue = await destination.get(key);
      if (destValue === sourceValue) {
        summary.alreadyIdentical++;
        logger.log("SKIP " + key + " already identical");
        continue;
      }
      if (destValue !== null && destValue !== undefined) {
        summary.conflicts++;
        summary.conflictKeys.push(key);
        logger.error("CONFLICT " + key + " destination differs");
        continue;
      }

      if (dryRun) {
        summary.wouldCopy++;
        logger.log("DRY-RUN copy " + key);
        continue;
      }

      await destination.set(key, sourceValue);
      if (verify) {
        const readBack = await destination.get(key);
        if (readBack !== sourceValue) {
          summary.failures++;
          summary.failureKeys.push({ key, error: "verification_failed" });
          logger.error("FAIL " + key + " verification_failed");
          continue;
        }
      }
      summary.copied++;
      logger.log("COPY " + key);
    } catch (err) {
      summary.failures++;
      summary.failureKeys.push({ key, error: err && err.message ? err.message : String(err) });
      logger.error("FAIL " + key + " " + (err && err.message ? err.message : String(err)));
    }
  }

  summary.ok = summary.conflicts === 0 && summary.failures === 0;
  return summary;
}

module.exports = {
  PLAYER_PREFIX,
  MigrationConfigurationError,
  createCloudflareKvSource,
  migratePlayerRecords,
};
