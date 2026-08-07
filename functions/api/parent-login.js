/* Parent-only login endpoint.
 * Prevents a mistyped parent username from falling through the legacy student
 * auto-create behavior in /api/player.
 */

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function cleanName(n) {
  return String(n || "").trim().slice(0, 20);
}
function canon(n) {
  return cleanName(n).toLowerCase();
}
function keyFor(n) {
  return "player:" + canon(n);
}
function validPin(p) {
  return /^[0-9]{4}$/.test(String(p || ""));
}
async function hashPin(name, pin) {
  const salt = "numberNinja:v1:" + canon(name);
  const bytes = new TextEncoder().encode(salt + ":" + pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function sameHash(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.NINJA_KV) return json({ ok:false, error:"server_not_configured" }, 500);

  let body;
  try { body = await request.json(); }
  catch (_) { return json({ ok:false, error:"bad_request" }, 400); }

  const name = cleanName(body.name);
  const pin = String(body.pin || "");
  if (!name) return json({ ok:false, error:"name_required" }, 400);
  if (!validPin(pin)) return json({ ok:false, error:"pin_must_be_4_digits" }, 400);

  const raw = await env.NINJA_KV.get(keyFor(name));
  if (!raw) return json({ ok:false, error:"no_such_account" }, 404);

  let rec;
  try { rec = JSON.parse(raw); }
  catch (_) { return json({ ok:false, error:"bad_account_record" }, 500); }

  if (rec.accountType !== "parent") return json({ ok:false, error:"wrong_account_type" }, 403);
  const pinHash = await hashPin(name, pin);
  if (!sameHash(rec.pinHash, pinHash)) return json({ ok:false, error:"wrong_pin" }, 403);

  return json({
    ok:true,
    accountType:"parent",
    username:rec.displayName || name,
    children:Array.isArray(rec.children) ? rec.children : [],
  });
}

export async function onRequestGet() {
  return json({ ok:true, service:"number-ninja-parent-login" });
}
