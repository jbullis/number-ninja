/*
 * Cloudflare Pages Function — Number Ninja account + save server
 * Route: /api/player
 *
 * Backward compatible with the original student-only API while adding:
 * - parent accounts (same username + 4-digit PIN login style)
 * - parent-created child accounts
 * - linking an existing standalone student using username + PIN
 * - one-parent-per-student ownership
 * - parent-only child PIN reset / rename / unlink
 * - parent-owned controls stored outside child-writable game data
 *
 * KV keys remain globally unique and case-insensitive: player:<username>.
 * Legacy records without accountType are treated as students.
 */

const MAX_NAME = 20;
const MAX_DATA = 24000;
const SCHEMA = 2;

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
  return String(n || "").trim().slice(0, MAX_NAME);
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
function accountType(rec) {
  return rec && rec.accountType === "parent" ? "parent" : "student";
}

async function hashPin(name, pin) {
  // Keep the v1 salt so existing accounts remain login-compatible.
  const salt = "numberNinja:v1:" + canon(name);
  const bytes = new TextEncoder().encode(salt + ":" + pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sameHash(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getRecord(kv, name) {
  const raw = await kv.get(keyFor(name));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

async function putRecord(kv, name, rec) {
  rec.schema = SCHEMA;
  rec.updated = Date.now();
  await kv.put(keyFor(name), JSON.stringify(rec));
}

async function authenticate(kv, name, pin, expectedType) {
  const rec = await getRecord(kv, name);
  if (!rec) return { error: json({ ok:false, error:"no_such_account" }, 404) };
  const pinHash = await hashPin(name, pin);
  if (!sameHash(rec.pinHash, pinHash)) return { error: json({ ok:false, error:"wrong_pin" }, 403) };
  const type = accountType(rec);
  if (expectedType && type !== expectedType) return { error: json({ ok:false, error:"wrong_account_type" }, 403) };
  return { rec, type };
}

function defaultControls(grade) {
  const g = ["K","1","2","3","4","5"].includes(String(grade)) ? String(grade) : "4";
  return {
    homeGrade: g,
    allowAboveGrade: true,
    audioInstructions: g === "K" || g === "1",
    skillOverrides: {},
    dailyGoals: {},
    vacationRanges: [],
    assignments: [],
    parentNotes: [],
    placement: { status:"not_started", recommended:true, lastTaken:null },
  };
}

function childSummary(name, rec) {
  const d = rec.data || {};
  return {
    username: cleanName(rec.displayName || name),
    homeGrade: (rec.controls && rec.controls.homeGrade) || (d.profile && d.profile.homeGrade) || "4",
    linked: !!rec.parentKey,
    updated: rec.updated || rec.created || 0,
    level: d.level || 1,
    coins: d.coins || 0,
  };
}

async function addChildToParent(kv, parentName, parentRec, childName) {
  const c = canon(childName);
  parentRec.children = Array.isArray(parentRec.children) ? parentRec.children : [];
  if (!parentRec.children.includes(c)) parentRec.children.push(c);
  await putRecord(kv, parentName, parentRec);
}

async function removeChildFromParent(kv, parentName, parentRec, childName) {
  const c = canon(childName);
  parentRec.children = (Array.isArray(parentRec.children) ? parentRec.children : []).filter(x => x !== c);
  await putRecord(kv, parentName, parentRec);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.NINJA_KV) return json({ ok:false, error:"server_not_configured" }, 500);

  let body;
  try { body = await request.json(); }
  catch (_) { return json({ ok:false, error:"bad_request" }, 400); }

  const action = body.action;
  const name = cleanName(body.name);
  const pin = String(body.pin || "");

  // -------- registration --------
  if (action === "register_parent" || action === "register_student") {
    if (!name) return json({ ok:false, error:"name_required" }, 400);
    if (!validPin(pin)) return json({ ok:false, error:"pin_must_be_4_digits" }, 400);
    if (await getRecord(env.NINJA_KV, name)) return json({ ok:false, error:"name_taken" }, 409);
    const now = Date.now();
    const type = action === "register_parent" ? "parent" : "student";
    const rec = {
      schema: SCHEMA,
      accountType: type,
      displayName: name,
      pinHash: await hashPin(name, pin),
      data: null,
      created: now,
      updated: now,
    };
    if (type === "parent") rec.children = [];
    else rec.controls = defaultControls(body.grade);
    await env.NINJA_KV.put(keyFor(name), JSON.stringify(rec));
    return json({ ok:true, created:true, accountType:type, data:null, controls:rec.controls || null });
  }

  // -------- legacy-compatible login --------
  if (action === "login") {
    if (!name) return json({ ok:false, error:"name_required" }, 400);
    if (!validPin(pin)) return json({ ok:false, error:"pin_must_be_4_digits" }, 400);
    let rec = await getRecord(env.NINJA_KV, name);
    if (!rec) {
      // Preserve original behavior: first-time login creates a standalone student.
      const now = Date.now();
      rec = {
        schema: SCHEMA,
        accountType:"student",
        displayName:name,
        pinHash:await hashPin(name,pin),
        data:null,
        controls:defaultControls(body.grade),
        created:now,
        updated:now,
      };
      await env.NINJA_KV.put(keyFor(name), JSON.stringify(rec));
      return json({ ok:true, created:true, accountType:"student", data:null, controls:rec.controls });
    }
    const pinHash = await hashPin(name, pin);
    if (!sameHash(rec.pinHash, pinHash)) return json({ ok:false, error:"wrong_pin" }, 403);
    const type = accountType(rec);
    // Soft migration: existing records become Grade 4 students without altering game data.
    if (type === "student" && !rec.controls) {
      rec.accountType = "student";
      rec.displayName = rec.displayName || name;
      rec.controls = defaultControls("4");
      await putRecord(env.NINJA_KV, name, rec);
    }
    return json({
      ok:true,
      created:false,
      accountType:type,
      data:rec.data || null,
      controls:type === "student" ? rec.controls || defaultControls("4") : null,
      children:type === "parent" ? rec.children || [] : undefined,
      linkedParent:type === "student" ? rec.parentKey || null : undefined,
    });
  }

  // -------- original student report/save --------
  if (action === "report" || action === "save") {
    if (!name) return json({ ok:false, error:"name_required" }, 400);
    if (!validPin(pin)) return json({ ok:false, error:"pin_must_be_4_digits" }, 400);
    const auth = await authenticate(env.NINJA_KV, name, pin, "student");
    if (auth.error) return auth.error;
    const rec = auth.rec;

    if (action === "report") {
      return json({ ok:true, data:rec.data || null, controls:rec.controls || defaultControls("4"), updated:rec.updated });
    }

    let dataStr;
    try { dataStr = JSON.stringify(body.data || {}); }
    catch (_) { return json({ ok:false, error:"bad_data" }, 400); }
    if (dataStr.length > MAX_DATA) return json({ ok:false, error:"data_too_big" }, 413);
    rec.data = body.data || {};
    await putRecord(env.NINJA_KV, name, rec);
    return json({ ok:true });
  }

  // -------- parent-authenticated operations --------
  const parentName = cleanName(body.parentName || name);
  const parentPin = String(body.parentPin || pin || "");
  if (["create_child","link_child","unlink_child","reset_child_pin","rename_child","list_children","parent_report","update_child_controls"].includes(action)) {
    if (!parentName) return json({ ok:false, error:"parent_name_required" }, 400);
    if (!validPin(parentPin)) return json({ ok:false, error:"pin_must_be_4_digits" }, 400);
    const pa = await authenticate(env.NINJA_KV, parentName, parentPin, "parent");
    if (pa.error) return pa.error;
    const parentRec = pa.rec;

    if (action === "list_children") {
      const out = [];
      for (const childCanon of (parentRec.children || [])) {
        const childRec = await getRecord(env.NINJA_KV, childCanon);
        if (childRec && childRec.parentKey === canon(parentName)) out.push(childSummary(childCanon, childRec));
      }
      return json({ ok:true, children:out });
    }

    const childName = cleanName(body.childName);
    if (!childName) return json({ ok:false, error:"child_name_required" }, 400);

    if (action === "create_child") {
      const childPin = String(body.childPin || "");
      if (!validPin(childPin)) return json({ ok:false, error:"child_pin_must_be_4_digits" }, 400);
      if (await getRecord(env.NINJA_KV, childName)) return json({ ok:false, error:"name_taken" }, 409);
      const now = Date.now();
      const childRec = {
        schema:SCHEMA,
        accountType:"student",
        displayName:childName,
        pinHash:await hashPin(childName, childPin),
        parentKey:canon(parentName),
        controls:defaultControls(body.grade),
        data:null,
        created:now,
        updated:now,
      };
      await env.NINJA_KV.put(keyFor(childName), JSON.stringify(childRec));
      await addChildToParent(env.NINJA_KV, parentName, parentRec, childName);
      return json({ ok:true, child:childSummary(childName, childRec) });
    }

    const childRec = await getRecord(env.NINJA_KV, childName);
    if (!childRec || accountType(childRec) !== "student") return json({ ok:false, error:"no_such_student" }, 404);

    if (action === "link_child") {
      if (childRec.parentKey) return json({ ok:false, error:"student_already_linked" }, 409);
      const childPin = String(body.childPin || "");
      if (!validPin(childPin)) return json({ ok:false, error:"child_pin_must_be_4_digits" }, 400);
      const h = await hashPin(childName, childPin);
      if (!sameHash(childRec.pinHash, h)) return json({ ok:false, error:"wrong_child_pin" }, 403);
      childRec.parentKey = canon(parentName);
      childRec.controls = childRec.controls || defaultControls("4");
      await putRecord(env.NINJA_KV, childName, childRec);
      await addChildToParent(env.NINJA_KV, parentName, parentRec, childName);
      return json({ ok:true, child:childSummary(childName, childRec) });
    }

    if (childRec.parentKey !== canon(parentName)) return json({ ok:false, error:"student_not_linked_to_parent" }, 403);

    if (action === "unlink_child") {
      delete childRec.parentKey;
      await putRecord(env.NINJA_KV, childName, childRec);
      await removeChildFromParent(env.NINJA_KV, parentName, parentRec, childName);
      return json({ ok:true, child:childSummary(childName, childRec) });
    }

    if (action === "reset_child_pin") {
      const newPin = String(body.newPin || "");
      if (!validPin(newPin)) return json({ ok:false, error:"new_pin_must_be_4_digits" }, 400);
      childRec.pinHash = await hashPin(childName, newPin);
      await putRecord(env.NINJA_KV, childName, childRec);
      return json({ ok:true });
    }

    if (action === "rename_child") {
      const newName = cleanName(body.newName);
      const newPin = String(body.newPin || "");
      if (!newName) return json({ ok:false, error:"new_name_required" }, 400);
      if (!validPin(newPin)) return json({ ok:false, error:"new_pin_must_be_4_digits" }, 400);
      if (canon(newName) !== canon(childName) && await getRecord(env.NINJA_KV, newName)) return json({ ok:false, error:"name_taken" }, 409);
      const oldCanon = canon(childName);
      childRec.displayName = newName;
      childRec.pinHash = await hashPin(newName, newPin);
      await env.NINJA_KV.put(keyFor(newName), JSON.stringify({ ...childRec, schema:SCHEMA, updated:Date.now() }));
      if (canon(newName) !== oldCanon && typeof env.NINJA_KV.delete === "function") await env.NINJA_KV.delete(keyFor(childName));
      parentRec.children = (parentRec.children || []).map(x => x === oldCanon ? canon(newName) : x);
      await putRecord(env.NINJA_KV, parentName, parentRec);
      return json({ ok:true, child:childSummary(newName, childRec) });
    }

    if (action === "parent_report") {
      return json({ ok:true, child:childSummary(childName, childRec), data:childRec.data || null, controls:childRec.controls || defaultControls("4"), updated:childRec.updated });
    }

    if (action === "update_child_controls") {
      const patch = body.controls && typeof body.controls === "object" ? body.controls : {};
      const current = childRec.controls || defaultControls("4");
      const allowed = ["homeGrade","allowAboveGrade","audioInstructions","skillOverrides","dailyGoals","vacationRanges","assignments","parentNotes","placement"];
      for (const k of allowed) if (Object.prototype.hasOwnProperty.call(patch,k)) current[k] = patch[k];
      if (!["K","1","2","3","4","5"].includes(String(current.homeGrade))) return json({ ok:false, error:"invalid_grade" }, 400);
      childRec.controls = current;
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at:Date.now(), action:"controls_updated", keys:Object.keys(patch).filter(k=>allowed.includes(k)) });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(env.NINJA_KV, childName, childRec);
      return json({ ok:true, controls:current });
    }
  }

  return json({ ok:false, error:"unknown_action" }, 400);
}

export async function onRequestGet() {
  return json({ ok:true, service:"number-ninja", schema:SCHEMA, hint:"POST here with an action." });
}
