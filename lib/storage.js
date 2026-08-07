class StorageConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

function cleanBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function envValue(env, key) {
  return env && Object.prototype.hasOwnProperty.call(env, key) ? env[key] : process.env[key];
}

function createUpstashStore(env) {
  const url = cleanBaseUrl(envValue(env, "UPSTASH_REDIS_REST_URL"));
  const token = String(envValue(env, "UPSTASH_REDIS_REST_TOKEN") || "").trim();
  if (!url || !token) {
    throw new StorageConfigurationError("Upstash Redis REST credentials are not configured.");
  }

  async function command(args) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    });
    let body;
    try {
      body = await res.json();
    } catch (_) {
      body = null;
    }
    if (!res.ok || (body && body.error)) {
      const detail = body && body.error ? String(body.error) : "HTTP " + res.status;
      throw new Error("Upstash Redis command failed: " + detail);
    }
    return body ? body.result : null;
  }

  return {
    async get(key) {
      return command(["GET", key]);
    },
    async set(key, value) {
      await command(["SET", key, value]);
    },
    async delete(key) {
      await command(["DEL", key]);
    },
    async list(prefix, cursor) {
      const result = await command(["SCAN", cursor || "0", "MATCH", prefix + "*", "COUNT", "100"]);
      const nextCursor = Array.isArray(result) ? String(result[0] || "0") : "0";
      const keys = Array.isArray(result) && Array.isArray(result[1]) ? result[1] : [];
      return { keys, cursor: nextCursor, complete: nextCursor === "0" };
    },
  };
}

function createStore(env) {
  if (env && env.store) return env.store;
  return createUpstashStore(env);
}

module.exports = {
  StorageConfigurationError,
  createStore,
  createUpstashStore,
};
