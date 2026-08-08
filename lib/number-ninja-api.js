const { StorageConfigurationError, createStore } = require("./storage");
const Placement = require("../js/placement.js");
const { generatePlacementQuestion } = require("./placement-question-generator");

const MAX_NAME = 20;
const MAX_DATA = 24000;
const SCHEMA = 2;
const PLAYER_PREFIX = "player:";

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
  return PLAYER_PREFIX + canon(n);
}
function validPin(p) {
  return /^[0-9]{4}$/.test(String(p || ""));
}
function accountType(rec) {
  return rec && rec.accountType === "parent" ? "parent" : "student";
}

async function hashPin(name, pin) {
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

async function getRecord(store, name) {
  const raw = await store.get(keyFor(name));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function putRecord(store, name, rec) {
  rec.schema = SCHEMA;
  rec.updated = Date.now();
  await store.set(keyFor(name), JSON.stringify(rec));
}

async function authenticate(store, name, pin, expectedType) {
  const rec = await getRecord(store, name);
  if (!rec) return { error: json({ ok: false, error: "no_such_account" }, 404) };
  const pinHash = await hashPin(name, pin);
  if (!sameHash(rec.pinHash, pinHash)) return { error: json({ ok: false, error: "wrong_pin" }, 403) };
  const type = accountType(rec);
  if (expectedType && type !== expectedType) return { error: json({ ok: false, error: "wrong_account_type" }, 403) };
  return { rec, type };
}

function defaultControls(grade) {
  const g = ["K", "1", "2", "3", "4", "5"].includes(String(grade)) ? String(grade) : "4";
  return {
    homeGrade: g,
    allowAboveGrade: true,
    audioInstructions: g === "K" || g === "1",
    skillOverrides: {},
    dailyGoals: {},
    vacationRanges: [],
    assignments: [],
    parentNotes: [],
    placement: Placement.newPlacementState(g, 0),
  };
}

function issuePlacementQuestion(placement) {
  const issued = Placement.issueQuestion(placement, generatePlacementQuestion);
  return { placement: issued.placement, question: Placement.publicQuestion(issued.question) };
}

function publicPlacement(placement) {
  const p = JSON.parse(JSON.stringify(placement || {}));
  if (p.pendingQuestion) {
    p.pendingQuestion = Placement.publicQuestion(p.pendingQuestion);
  }
  return p;
}

function publicControls(controls) {
  const c = JSON.parse(JSON.stringify(controls || defaultControls("4")));
  if (c.placement) c.placement = publicPlacement(c.placement);
  return c;
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

async function addChildToParent(store, parentName, parentRec, childName) {
  const c = canon(childName);
  parentRec.children = Array.isArray(parentRec.children) ? parentRec.children : [];
  if (!parentRec.children.includes(c)) parentRec.children.push(c);
  await putRecord(store, parentName, parentRec);
}

async function removeChildFromParent(store, parentName, parentRec, childName) {
  const c = canon(childName);
  parentRec.children = (Array.isArray(parentRec.children) ? parentRec.children : []).filter((x) => x !== c);
  await putRecord(store, parentName, parentRec);
}

function getConfiguredStore(env) {
  try {
    return createStore(env);
  } catch (err) {
    if (err instanceof StorageConfigurationError) return null;
    throw err;
  }
}

async function playerPost(request, env) {
  const store = getConfiguredStore(env);
  if (!store) return json({ ok: false, error: "server_not_configured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const action = body.action;
  const name = cleanName(body.name);
  const pin = String(body.pin || "");

  if (action === "register_parent" || action === "register_student") {
    if (!name) return json({ ok: false, error: "name_required" }, 400);
    if (!validPin(pin)) return json({ ok: false, error: "pin_must_be_4_digits" }, 400);
    if (await getRecord(store, name)) return json({ ok: false, error: "name_taken" }, 409);
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
    await store.set(keyFor(name), JSON.stringify(rec));
    return json({ ok: true, created: true, accountType: type, data: null, controls: rec.controls ? publicControls(rec.controls) : null });
  }

  if (action === "login") {
    if (!name) return json({ ok: false, error: "name_required" }, 400);
    if (!validPin(pin)) return json({ ok: false, error: "pin_must_be_4_digits" }, 400);
    let rec = await getRecord(store, name);
    if (!rec) {
      const now = Date.now();
      rec = {
        schema: SCHEMA,
        accountType: "student",
        displayName: name,
        pinHash: await hashPin(name, pin),
        data: null,
        controls: defaultControls(body.grade),
        created: now,
        updated: now,
      };
      await store.set(keyFor(name), JSON.stringify(rec));
      return json({ ok: true, created: true, accountType: "student", data: null, controls: publicControls(rec.controls) });
    }
    const pinHash = await hashPin(name, pin);
    if (!sameHash(rec.pinHash, pinHash)) return json({ ok: false, error: "wrong_pin" }, 403);
    const type = accountType(rec);
    if (type === "student" && !rec.controls) {
      rec.accountType = "student";
      rec.displayName = rec.displayName || name;
      rec.controls = defaultControls("4");
      await putRecord(store, name, rec);
    }
    return json({
      ok: true,
      created: false,
      accountType: type,
      data: rec.data || null,
      controls: type === "student" ? publicControls(rec.controls || defaultControls("4")) : null,
      children: type === "parent" ? rec.children || [] : undefined,
      linkedParent: type === "student" ? rec.parentKey || null : undefined,
    });
  }

  if (action === "report" || action === "save" || action === "placement_start" || action === "placement_progress" || action === "placement_complete" || action === "placement_skip") {
    if (!name) return json({ ok: false, error: "name_required" }, 400);
    if (!validPin(pin)) return json({ ok: false, error: "pin_must_be_4_digits" }, 400);
    const auth = await authenticate(store, name, pin, "student");
    if (auth.error) return auth.error;
    const rec = auth.rec;

    if (action === "report") {
      return json({ ok: true, data: rec.data || null, controls: publicControls(rec.controls || defaultControls("4")), updated: rec.updated });
    }

    rec.controls = rec.controls || defaultControls("4");

    if (action === "placement_start") {
      const current = Placement.normalizePlacement(rec.controls.placement, rec.controls.homeGrade || "4");
      rec.controls.placement = current.status === "in_progress" ? current : Placement.startAttempt(rec.controls);
      const issued = issuePlacementQuestion(rec.controls.placement);
      rec.controls.placement = issued.placement;
      const question = issued.question;
      await putRecord(store, name, rec);
      return json({ ok: true, placement: publicPlacement(rec.controls.placement), question, nextSkill: question && question.skillId });
    }

    if (action === "placement_progress") {
      const questionId = String(body.questionId || "");
      const choiceId = String(body.choiceId || "");
      if (!questionId) return json({ ok: false, error: "question_required" }, 400);
      if (!choiceId) return json({ ok: false, error: "choice_required" }, 400);
      if (body.skillId) {
        const pending = rec.controls.placement && rec.controls.placement.pendingQuestion;
        if (!pending || !Placement.publicQuestion(pending) || !String(body.skillId)) return json({ ok: false, error: "invalid_skill" }, 400);
        if (String(body.skillId) !== pending.skillId) return json({ ok: false, error: "different_skill" }, 409);
      }
      const result = Placement.answerPendingQuestion(rec.controls.placement, questionId, choiceId);
      if (result.error) {
        const status = result.error === "stale_question" || result.error === "question_already_answered" ? 409 : 400;
        return json({ ok: false, error: result.error }, status);
      }
      rec.controls.placement = result.placement;
      const stop = Placement.shouldStop(rec.controls.placement);
      let question = null;
      if (!stop) {
        const issued = issuePlacementQuestion(rec.controls.placement);
        rec.controls.placement = issued.placement;
        question = issued.question;
      }
      await putRecord(store, name, rec);
      return json({ ok: true, placement: publicPlacement(rec.controls.placement), correct: result.correct, stop, question, nextSkill: question && question.skillId });
    }

    if (action === "placement_complete") {
      const current = Placement.normalizePlacement(rec.controls.placement, rec.controls.homeGrade || "4");
      if (current.status !== "in_progress") return json({ ok: false, error: "placement_not_in_progress" }, 409);
      if (current.pendingQuestion && !current.pendingQuestion.answered) return json({ ok: false, error: "pending_question_unanswered" }, 409);
      if (!Placement.shouldStop(current)) return json({ ok: false, error: "placement_not_enough_evidence" }, 409);
      rec.controls.placement = Placement.completeAttempt(rec.controls.placement, rec.controls, (rec.data && rec.data.progress && rec.data.progress.mastery) || {});
      await putRecord(store, name, rec);
      return json({ ok: true, placement: publicPlacement(rec.controls.placement) });
    }

    if (action === "placement_skip") {
      rec.controls.placement = Placement.skipPlacement(rec.controls.placement, rec.controls.homeGrade || "4");
      await putRecord(store, name, rec);
      return json({ ok: true, placement: publicPlacement(rec.controls.placement) });
    }

    let dataStr;
    try {
      dataStr = JSON.stringify(body.data || {});
    } catch (_) {
      return json({ ok: false, error: "bad_data" }, 400);
    }
    if (dataStr.length > MAX_DATA) return json({ ok: false, error: "data_too_big" }, 413);
    rec.data = body.data || {};
    await putRecord(store, name, rec);
    return json({ ok: true });
  }

  const parentName = cleanName(body.parentName || name);
  const parentPin = String(body.parentPin || pin || "");
  if (["create_child", "link_child", "unlink_child", "reset_child_pin", "rename_child", "list_children", "parent_report", "update_child_controls", "apply_placement_recommendations", "undo_placement_recommendations", "reset_placement"].includes(action)) {
    if (!parentName) return json({ ok: false, error: "parent_name_required" }, 400);
    if (!validPin(parentPin)) return json({ ok: false, error: "pin_must_be_4_digits" }, 400);
    const pa = await authenticate(store, parentName, parentPin, "parent");
    if (pa.error) return pa.error;
    const parentRec = pa.rec;

    if (action === "list_children") {
      const out = [];
      for (const childCanon of parentRec.children || []) {
        const childRec = await getRecord(store, childCanon);
        if (childRec && childRec.parentKey === canon(parentName)) out.push(childSummary(childCanon, childRec));
      }
      return json({ ok: true, children: out });
    }

    const childName = cleanName(body.childName);
    if (!childName) return json({ ok: false, error: "child_name_required" }, 400);

    if (action === "create_child") {
      const childPin = String(body.childPin || "");
      if (!validPin(childPin)) return json({ ok: false, error: "child_pin_must_be_4_digits" }, 400);
      if (await getRecord(store, childName)) return json({ ok: false, error: "name_taken" }, 409);
      const now = Date.now();
      const childRec = {
        schema: SCHEMA,
        accountType: "student",
        displayName: childName,
        pinHash: await hashPin(childName, childPin),
        parentKey: canon(parentName),
        controls: defaultControls(body.grade),
        data: null,
        created: now,
        updated: now,
      };
      await store.set(keyFor(childName), JSON.stringify(childRec));
      await addChildToParent(store, parentName, parentRec, childName);
      return json({ ok: true, child: childSummary(childName, childRec) });
    }

    const childRec = await getRecord(store, childName);
    if (!childRec || accountType(childRec) !== "student") return json({ ok: false, error: "no_such_student" }, 404);

    if (action === "link_child") {
      if (childRec.parentKey) return json({ ok: false, error: "student_already_linked" }, 409);
      const childPin = String(body.childPin || "");
      if (!validPin(childPin)) return json({ ok: false, error: "child_pin_must_be_4_digits" }, 400);
      const h = await hashPin(childName, childPin);
      if (!sameHash(childRec.pinHash, h)) return json({ ok: false, error: "wrong_child_pin" }, 403);
      childRec.parentKey = canon(parentName);
      childRec.controls = childRec.controls || defaultControls("4");
      await putRecord(store, childName, childRec);
      await addChildToParent(store, parentName, parentRec, childName);
      return json({ ok: true, child: childSummary(childName, childRec) });
    }

    if (childRec.parentKey !== canon(parentName)) return json({ ok: false, error: "student_not_linked_to_parent" }, 403);

    if (action === "unlink_child") {
      delete childRec.parentKey;
      await putRecord(store, childName, childRec);
      await removeChildFromParent(store, parentName, parentRec, childName);
      return json({ ok: true, child: childSummary(childName, childRec) });
    }

    if (action === "reset_child_pin") {
      const newPin = String(body.newPin || "");
      if (!validPin(newPin)) return json({ ok: false, error: "new_pin_must_be_4_digits" }, 400);
      childRec.pinHash = await hashPin(childName, newPin);
      await putRecord(store, childName, childRec);
      return json({ ok: true });
    }

    if (action === "rename_child") {
      const newName = cleanName(body.newName);
      const newPin = String(body.newPin || "");
      if (!newName) return json({ ok: false, error: "new_name_required" }, 400);
      if (!validPin(newPin)) return json({ ok: false, error: "new_pin_must_be_4_digits" }, 400);
      if (canon(newName) !== canon(childName) && (await getRecord(store, newName))) return json({ ok: false, error: "name_taken" }, 409);
      const oldCanon = canon(childName);
      childRec.displayName = newName;
      childRec.pinHash = await hashPin(newName, newPin);
      await store.set(keyFor(newName), JSON.stringify({ ...childRec, schema: SCHEMA, updated: Date.now() }));
      if (canon(newName) !== oldCanon) await store.delete(keyFor(childName));
      parentRec.children = (parentRec.children || []).map((x) => (x === oldCanon ? canon(newName) : x));
      await putRecord(store, parentName, parentRec);
      return json({ ok: true, child: childSummary(newName, childRec) });
    }

    if (action === "parent_report") {
      return json({ ok: true, child: childSummary(childName, childRec), data: childRec.data || null, controls: publicControls(childRec.controls || defaultControls("4")), updated: childRec.updated });
    }

    if (action === "apply_placement_recommendations") {
      const result = Placement.applyRecommendations(childRec.controls || defaultControls("4"), Array.isArray(body.recommendationIds) ? body.recommendationIds : []);
      childRec.controls = result.controls;
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "placement_recommendations_applied", count: result.applied.length });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(childRec.controls), applied: result.applied });
    }

    if (action === "undo_placement_recommendations") {
      const result = Placement.undoLastApply(childRec.controls || defaultControls("4"));
      childRec.controls = result.controls;
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "placement_recommendations_undone", count: result.restored.length });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(childRec.controls), restored: result.restored });
    }

    if (action === "reset_placement") {
      childRec.controls = childRec.controls || defaultControls("4");
      childRec.controls.placement = Placement.resetForRetake(childRec.controls.placement, childRec.controls.homeGrade || "4");
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "placement_retake_requested" });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(childRec.controls) });
    }

    if (action === "update_child_controls") {
      const patch = body.controls && typeof body.controls === "object" ? body.controls : {};
      const current = childRec.controls || defaultControls("4");
      const allowed = ["homeGrade", "allowAboveGrade", "audioInstructions", "skillOverrides", "dailyGoals", "vacationRanges", "assignments", "parentNotes", "placement"];
      for (const k of allowed) if (Object.prototype.hasOwnProperty.call(patch, k)) current[k] = patch[k];
      if (!["K", "1", "2", "3", "4", "5"].includes(String(current.homeGrade))) return json({ ok: false, error: "invalid_grade" }, 400);
      childRec.controls = current;
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "controls_updated", keys: Object.keys(patch).filter((k) => allowed.includes(k)) });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(current) });
    }
  }

  return json({ ok: false, error: "unknown_action" }, 400);
}

async function playerGet() {
  return json({ ok: true, service: "number-ninja", schema: SCHEMA, hint: "POST here with an action." });
}

async function parentLoginPost(request, env) {
  const store = getConfiguredStore(env);
  if (!store) return json({ ok: false, error: "server_not_configured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const name = cleanName(body.name);
  const pin = String(body.pin || "");
  if (!name) return json({ ok: false, error: "name_required" }, 400);
  if (!validPin(pin)) return json({ ok: false, error: "pin_must_be_4_digits" }, 400);

  const rec = await getRecord(store, name);
  if (!rec) return json({ ok: false, error: "no_such_account" }, 404);
  if (rec.accountType !== "parent") return json({ ok: false, error: "wrong_account_type" }, 403);
  const pinHash = await hashPin(name, pin);
  if (!sameHash(rec.pinHash, pinHash)) return json({ ok: false, error: "wrong_pin" }, 403);

  return json({
    ok: true,
    accountType: "parent",
    username: rec.displayName || name,
    children: Array.isArray(rec.children) ? rec.children : [],
  });
}

async function parentLoginGet() {
  return json({ ok: true, service: "number-ninja-parent-login" });
}

module.exports = {
  SCHEMA,
  PLAYER_PREFIX,
  json,
  cleanName,
  canon,
  keyFor,
  defaultControls,
  hashPin,
  playerPost,
  playerGet,
  parentLoginPost,
  parentLoginGet,
};
