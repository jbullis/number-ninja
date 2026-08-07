const { StorageConfigurationError, createStore } = require("./storage");
const { json, PLAYER_PREFIX } = require("./number-ninja-api");

const DAY = 86400000;

function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getConfiguredStore(env) {
  try {
    return createStore(env);
  } catch (err) {
    if (err instanceof StorageConfigurationError) return null;
    throw err;
  }
}

async function adminGet(request, env) {
  const store = getConfiguredStore(env);
  if (!store) return json({ ok: false, error: "server_not_configured" }, 500);
  if (!(env && env.ADMIN_TOKEN)) return json({ ok: false, error: "admin_not_configured" }, 503);
  if (typeof store.list !== "function") return json({ ok: false, error: "admin_list_not_supported" }, 503);

  const url = new URL(request.url, "https://number-ninja.local");
  const token = request.headers.get("x-admin-token") || url.searchParams.get("token") || "";
  if (!sameToken(token, env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);

  const names = [];
  let cursor = "0";
  for (let guard = 0; guard < 100; guard++) {
    const res = await store.list(PLAYER_PREFIX, cursor);
    for (const key of res.keys || []) names.push(typeof key === "string" ? key : key.name);
    if (res.complete || !res.cursor || res.cursor === "0") break;
    cursor = res.cursor;
  }

  const now = Date.now();
  let active = 0, neverSaved = 0, active7 = 0, active30 = 0, new7 = 0, new30 = 0;
  let totalSolved = 0, maxLevel = 0;
  const roster = [];
  const CONC = 25;
  for (let i = 0; i < names.length; i += CONC) {
    const recs = await Promise.all(
      names.slice(i, i + CONC).map(async (name) => {
        const raw = await store.get(name);
        return { name, rec: raw ? JSON.parse(raw) : null };
      })
    );
    for (const { name, rec } of recs) {
      if (!rec) continue;
      const created = rec.created || 0;
      const updated = rec.updated || created;
      if (created > now - 7 * DAY) new7++;
      if (created > now - 30 * DAY) new30++;
      const d = rec.data;
      if (d) {
        active++;
        if (updated > now - 7 * DAY) active7++;
        if (updated > now - 30 * DAY) active30++;
        const solved = d.progress && d.progress.solved ? Object.keys(d.progress.solved).length : 0;
        totalSolved += solved;
        if ((d.level || 0) > maxLevel) maxLevel = d.level || 0;
        roster.push({ name: name.replace(/^player:/, ""), updated, created, level: d.level || 1, coins: d.coins || 0, solved });
      } else {
        neverSaved++;
      }
    }
  }
  roster.sort((a, b) => b.updated - a.updated);

  return json({
    ok: true,
    generated: now,
    total: names.length,
    active,
    neverSaved,
    active7,
    active30,
    new7,
    new30,
    totalSolved,
    maxLevel,
    roster: roster.slice(0, 100),
  });
}

module.exports = {
  adminGet,
  sameToken,
};
