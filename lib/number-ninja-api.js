const { StorageConfigurationError, createStore } = require("./storage");
const Placement = require("../js/placement.js");
const Mastery = require("../js/mastery.js");
const Daily = require("../js/daily.js");
const Recommendations = require("../js/recommendations.js");
const Assignments = require("../js/assignments.js");
const LearningPlan = require("../js/learning-plan.js");
const Achievements = require("../js/achievements.js");
const Cosmetics = require("../js/cosmetics.js");
const { generatePlacementQuestion } = require("./placement-question-generator");

const MAX_NAME = 20;
const MAX_DATA = 24000;
const MAX_COIN_EVENTS = 120;
const MAX_DAILY_EARNED_COINS = 300;
const MAX_CURRENCY_LEDGER = 120;
const SCHEMA = 2;
const PLAYER_PREFIX = "player:";
const POWERUP_BUNDLES = {
  freehint: { cost: 40, per: 5 },
  fiftyfifty: { cost: 60, per: 5 },
  coinsx2: { cost: 80, per: 3 },
  freeplay: { cost: 100, per: 1 },
};

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
    dailyGoals: Daily.defaultDailyGoals(),
    vacationRanges: [],
    assignments: [],
    parentNotes: [],
    placement: Placement.newPlacementState(g, 0),
    skillMastery: Mastery.newState(),
    dailyActivity: Daily.newState(),
    learningPlan: LearningPlan.normalizePlan(),
    achievements: Achievements.newState(),
    cosmetics: Cosmetics.newState(),
    currency: { version: 1, recentEventIds: [], dailyEarned: {} },
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

function issueMasteryQuestion(pending) {
  const question = Mastery.issueQuestion(pending, generatePlacementQuestion);
  return { pending, question: Mastery.publicQuestion(question) };
}

function publicSkillMastery(state) {
  const s = Mastery.normalizeState(state);
  if (s.pendingChallenge) s.pendingChallenge = Mastery.publicPending(s.pendingChallenge);
  if (s.pendingReview) s.pendingReview = Mastery.publicPending(s.pendingReview);
  return s;
}

function publicControls(controls) {
  const c = JSON.parse(JSON.stringify(controls || defaultControls("4")));
  if (c.placement) c.placement = publicPlacement(c.placement);
  c.skillMastery = publicSkillMastery(c.skillMastery);
  Daily.ensureControls(c);
  c.learningPlan = LearningPlan.publicPlan(c.learningPlan);
  c.achievements = Achievements.publicSummary(c.achievements, null, c);
  c.cosmetics = Cosmetics.publicSummary(c.cosmetics, null);
  c.assignments = Assignments.activeSummaries(c.assignments, { includeNotes: false });
  delete c.currency;
  return c;
}

function validClientDate(localDate) {
  if (!Daily.validDate(localDate)) return false;
  const today = Daily.todayLocal(new Date());
  return Daily.cmpDate(localDate, Daily.addDays(today, 2)) <= 0 && Daily.cmpDate(localDate, "2020-01-01") >= 0;
}

function effectiveClientDate(localDate) {
  if (localDate == null || localDate === "") return { date: Daily.todayLocal(new Date()) };
  const date = String(localDate);
  if (!validClientDate(date)) return { error: "invalid_date" };
  return { date };
}

function dailyPayload(rec, localDate, options) {
  const effective = effectiveClientDate(localDate);
  if (effective.error) return { error: effective.error };
  const date = effective.date;
  rec.controls = rec.controls || defaultControls("4");
  Daily.ensureControls(rec.controls);
  Mastery.ensureControls(rec.controls);
  Achievements.ensureControls(rec.controls);
  const dailyStatus = Daily.evaluateToday(rec.controls, date);
  const masterySummary = Mastery.summary(rec.data || null, rec.controls);
  const learningPlan = LearningPlan.evaluate(rec.data || null, rec.controls);
  const achievements = achievementPayload(rec, options);
  const cosmetics = cosmeticPayload(rec, options);
  const recommendations = Recommendations.primaryAndAlternates(rec.data || null, rec.controls, { localDate: date });
  const assignments = Assignments.activeSummaries(rec.controls.assignments, { localDate: date, includeNotes: false });
  rec.controls.assignments = Assignments.normalizeList(rec.controls.assignments, date);
  return { dailyStatus, recommendations, masterySummary, assignments, learningPlan: LearningPlan.publicPlan(learningPlan), achievements, cosmetics };
}

function assignmentIndex(rec, assignmentId, localDate) {
  rec.controls = rec.controls || defaultControls("4");
  rec.controls.assignments = Assignments.normalizeList(rec.controls.assignments, localDate);
  const idx = rec.controls.assignments.findIndex((a) => a.id === String(assignmentId || ""));
  return { idx, assignment: idx >= 0 ? rec.controls.assignments[idx] : null };
}

function assignmentStatusPayload(rec, localDate) {
  const extras = dailyPayload(rec, localDate, { acknowledgeAchievements: true });
  if (extras.error) return extras;
  return { assignments: extras.assignments, recommendations: Recommendations.primaryAndAlternates(rec.data || null, rec.controls, { localDate }), learningPlan: extras.learningPlan, dailyStatus: extras.dailyStatus, achievements: extras.achievements, cosmetics: extras.cosmetics, controls: publicControls(rec.controls) };
}

function recordAssignmentPractice(rec, skillId, correct) {
  rec.data = rec.data || {};
  rec.data.progress = rec.data.progress || {};
  rec.data.progress.topics = rec.data.progress.topics || {};
  rec.data.progress.mastery = rec.data.progress.mastery || {};
  const topic = rec.data.progress.topics[skillId] = rec.data.progress.topics[skillId] || { solved:0, first:0, wrongs:0, tutors:0 };
  if (correct) {
    topic.solved = Number(topic.solved || 0) + 1;
    topic.first = Number(topic.first || 0) + 1;
    rec.data.progress.mastery[skillId] = Math.max(0, Math.min(100, Math.round((Number(rec.data.progress.mastery[skillId] || 0) + 4) * 10) / 10));
    rec.data.stats = rec.data.stats || {};
    rec.data.stats.totalCorrect = Number(rec.data.stats.totalCorrect || 0) + 1;
  } else {
    topic.wrongs = Number(topic.wrongs || 0) + 1;
  }
}

function refreshLearningPlan(rec) {
  rec.controls = rec.controls || defaultControls("4");
  Mastery.ensureControls(rec.controls);
  return LearningPlan.publicPlan(LearningPlan.evaluate(rec.data || null, rec.controls));
}

function achievementPayload(rec, options) {
  rec.controls = rec.controls || defaultControls("4");
  Achievements.evaluate(rec.data || null, rec.controls);
  const summary = Achievements.publicSummary(rec.controls.achievements, rec.data || null, rec.controls);
  if (options && options.acknowledgeAchievements) rec.controls.achievements = Achievements.markRecentSeen(rec.controls.achievements);
  return summary;
}

function cosmeticPayload(rec, options) {
  rec.controls = rec.controls || defaultControls("4");
  rec.data = rec.data || {};
  Cosmetics.syncUnlocks(rec.controls, rec.data);
  const summary = Cosmetics.publicSummary(rec.controls.cosmetics, rec.data);
  if (options && options.acknowledgeCosmetics) rec.controls.cosmetics = Cosmetics.markRecentSeen(rec.controls.cosmetics);
  return summary;
}

function ownedIdsForSlot(controls, slot) {
  Cosmetics.ensureControls(controls || {}, null);
  const catalog = Cosmetics.catalogById();
  return Object.keys((controls.cosmetics && controls.cosmetics.owned) || {}).filter((id) => catalog[id] && catalog[id].slot === slot);
}

function normalizeCurrency(controls) {
  controls = controls || {};
  const c = controls.currency && typeof controls.currency === "object" ? JSON.parse(JSON.stringify(controls.currency)) : {};
  c.version = 1;
  c.recentEventIds = Array.isArray(c.recentEventIds) ? c.recentEventIds.map((id) => String(id || "").replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 100)).filter(Boolean).slice(-MAX_COIN_EVENTS) : [];
  c.rewardedMilestones = c.rewardedMilestones && typeof c.rewardedMilestones === "object" ? c.rewardedMilestones : {};
  Object.keys(c.rewardedMilestones).forEach((k) => { if (!c.rewardedMilestones[k]) delete c.rewardedMilestones[k]; });
  Object.keys(c.rewardedMilestones).sort((a,b) => Number(c.rewardedMilestones[a].at || 0) - Number(c.rewardedMilestones[b].at || 0)).slice(0, Math.max(0, Object.keys(c.rewardedMilestones).length - 200)).forEach((k) => delete c.rewardedMilestones[k]);
  c.dailyEarned = c.dailyEarned && typeof c.dailyEarned === "object" ? c.dailyEarned : {};
  const dates = Object.keys(c.dailyEarned).filter((d) => Daily.validDate(d)).sort();
  while (dates.length > 60) delete c.dailyEarned[dates.shift()];
  dates.forEach((d) => { c.dailyEarned[d] = Math.max(0, Math.floor(Number(c.dailyEarned[d] || 0))); });
  c.practice = c.practice && typeof c.practice === "object" ? c.practice : {};
  c.practice.lastRewardedAttempts = Math.max(0, Math.floor(Number(c.practice.lastRewardedAttempts || 0)));
  c.practice.lastRewardedCorrect = Math.max(0, Math.floor(Number(c.practice.lastRewardedCorrect || 0)));
  c.ledger = Array.isArray(c.ledger) ? c.ledger.filter((e) => e && Number.isFinite(Number(e.at))).slice(-MAX_CURRENCY_LEDGER).map((e) => ({
    at: Number(e.at || 0),
    type: e.type === "spend" ? "spend" : "earn",
    reason: String(e.reason || "").replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 80),
    amount: Math.max(0, Math.floor(Number(e.amount || 0))),
    balanceAfter: Math.max(0, Math.floor(Number(e.balanceAfter || 0))),
    eventKey: String(e.eventKey || "").replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 120),
  })) : [];
  controls.currency = c;
  return c;
}

function practiceMetrics(data) {
  const progress = data && data.progress || {};
  const topics = progress.topics || {};
  let attempted = 0;
  let correct = 0;
  Object.keys(topics).forEach((id) => {
    const t = topics[id] || {};
    correct += Math.max(0, Math.floor(Number(t.solved || 0)));
    attempted += Math.max(0, Math.floor(Number(t.solved || 0))) + Math.max(0, Math.floor(Number(t.wrongs || 0)));
  });
  const statsCorrect = Math.max(0, Math.floor(Number(data && data.stats && data.stats.totalCorrect || 0)));
  correct = Math.max(correct, statsCorrect);
  attempted = Math.max(attempted, correct);
  return { attempted, correct };
}

function addCurrencyLedger(currency, entry) {
  currency.ledger = Array.isArray(currency.ledger) ? currency.ledger : [];
  currency.ledger.push({
    at: Date.now(),
    type: entry.type,
    reason: entry.reason,
    amount: Math.max(0, Math.floor(Number(entry.amount || 0))),
    balanceAfter: Math.max(0, Math.floor(Number(entry.balanceAfter || 0))),
    eventKey: entry.eventKey || "",
  });
  currency.ledger = currency.ledger.slice(-MAX_CURRENCY_LEDGER);
}

function markPracticeEvidenceRewarded(rec) {
  rec.controls = rec.controls || defaultControls("4");
  const currency = normalizeCurrency(rec.controls);
  const metrics = practiceMetrics(rec.data || null);
  currency.practice.lastRewardedAttempts = Math.max(Number(currency.practice.lastRewardedAttempts || 0), metrics.attempted);
  currency.practice.lastRewardedCorrect = Math.max(Number(currency.practice.lastRewardedCorrect || 0), metrics.correct);
}

function coinRewardAmount(body, rec, localDate, currency) {
  const reason = String(body.reason || "");
  const metrics = practiceMetrics(rec && rec.data || null);
  if (reason === "practice_correct" || reason === "practice_hint" || reason === "practice_retry" || reason === "practice_variant") {
    if (metrics.attempted <= Number(currency.practice.lastRewardedAttempts || 0)) return { error: "practice_evidence_required" };
    if (reason === "practice_correct" && metrics.correct <= Number(currency.practice.lastRewardedCorrect || 0)) return { error: "practice_evidence_required" };
    return { reason, coins: reason === "practice_correct" ? 3 : 1, key: null, practiceMetrics: metrics };
  }
  if (reason === "daily_bonus") {
    if (metrics.attempted <= 0) return { error: "practice_evidence_required" };
    return { reason, coins: 10, key: "daily_bonus:" + localDate };
  }
  if (reason === "story_level_complete" || reason === "boss_clear" || reason === "level_up") return { error: "progression_evidence_required" };
  return { error: "unknown_coin_reason" };
}

function awardCoins(rec, body, localDate) {
  rec.controls = rec.controls || defaultControls("4");
  rec.data = rec.data || {};
  const currency = normalizeCurrency(rec.controls);
  const eventId = String(body.eventId || "").replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 100);
  if (!eventId) return { error: "event_required" };
  if (currency.recentEventIds.includes(eventId)) return { duplicate: true, reason: String(body.reason || ""), coins: Number(rec.data.coins || 0), awarded: 0 };
  const reward = coinRewardAmount(body, rec, localDate, currency);
  if (reward.error) return reward;
  const rewardKey = reward.key || eventId;
  if (currency.rewardedMilestones[rewardKey]) return { duplicate: true, reason: reward.reason, coins: Number(rec.data.coins || 0), awarded: 0 };
  const coins = Math.max(0, Math.min(80, Math.floor(Number(reward.coins || 0))));
  if (!coins) return { error: "invalid_coin_reward" };
  const date = localDate || Daily.todayLocal(new Date());
  const earnedToday = Math.max(0, Math.floor(Number(currency.dailyEarned[date] || 0)));
  if (earnedToday + coins > MAX_DAILY_EARNED_COINS) return { error: "daily_coin_cap_reached" };
  if (!reward.key) {
    currency.recentEventIds.push(eventId);
    currency.recentEventIds = currency.recentEventIds.slice(-MAX_COIN_EVENTS);
    if (reward.practiceMetrics) {
      currency.practice.lastRewardedAttempts = reward.practiceMetrics.attempted;
      currency.practice.lastRewardedCorrect = reward.practiceMetrics.correct;
    }
  } else {
    currency.rewardedMilestones[rewardKey] = { at: Date.now(), coins };
  }
  currency.dailyEarned[date] = earnedToday + coins;
  rec.data.coins = Math.max(0, Math.floor(Number(rec.data.coins || 0))) + coins;
  addCurrencyLedger(currency, { type: "earn", reason: reward.reason, amount: coins, balanceAfter: rec.data.coins, eventKey: rewardKey });
  return { duplicate: false, reason: reward.reason, awarded: coins, coins: rec.data.coins };
}

function sanitizeLegacyInventory(previousInv, nextInv, spentCoins) {
  const out = {};
  const requestedIncreases = [];
  Object.keys(POWERUP_BUNDLES).forEach((id) => {
    const prev = Math.max(0, Math.floor(Number(previousInv && previousInv[id] || 0)));
    const next = Math.max(0, Math.floor(Number(nextInv && nextInv[id] || 0)));
    if (next > prev) requestedIncreases.push({ id, prev, next, inc: next - prev });
    else out[id] = next;
  });
  const increaseCost = requestedIncreases.reduce((sum, x) => {
    const bundle = POWERUP_BUNDLES[x.id];
    return sum + Math.ceil(x.inc / bundle.per) * bundle.cost;
  }, 0);
  requestedIncreases.forEach((x) => {
    out[x.id] = increaseCost <= spentCoins ? Math.min(999, x.next) : x.prev;
  });
  return out;
}

function sanitizeSaveData(rec, incoming) {
  const previous = rec.data || {};
  const next = incoming && typeof incoming === "object" ? JSON.parse(JSON.stringify(incoming)) : {};
  rec.controls = rec.controls || defaultControls("4");
  Cosmetics.ensureControls(rec.controls, previous);

  const previousCoins = Math.max(0, Math.floor(Number(previous.coins || 0)));
  let requestedCoins = Number(next.coins);
  if (!Number.isFinite(requestedCoins)) requestedCoins = previousCoins;
  requestedCoins = Math.max(0, Math.floor(requestedCoins));
  next.coins = Math.min(requestedCoins, previousCoins);
  const spentCoins = Math.max(0, previousCoins - next.coins);

  const legacyImageOwned = new Set();
  [previous.owned, next.owned].forEach((list) => (Array.isArray(list) ? list : []).forEach((id) => {
    id = String(id || "");
    if (id.startsWith("img:")) legacyImageOwned.add(id);
  }));
  const equipped = (rec.controls.cosmetics && rec.controls.cosmetics.equipped) || {};
  if (String(next.skin || "").startsWith("img:") && legacyImageOwned.has(String(next.skin))) next.skin = String(next.skin);
  else next.skin = equipped.avatar || previous.skin || "e:Ninja";
  next.effect = equipped.aura || previous.effect || "none";
  next.owned = Array.from(new Set(ownedIdsForSlot(rec.controls, "avatar").concat(Array.from(legacyImageOwned))));
  next.ownedEffects = ownedIdsForSlot(rec.controls, "aura");
  next.inventory = sanitizeLegacyInventory(previous.inventory || {}, next.inventory || {}, spentCoins);
  return next;
}

function payAssignmentReward(rec, result) {
  const coins = Math.max(0, Number(result && result.rewardCoins || 0));
  if (!coins) return 0;
  rec.data = rec.data || {};
  rec.data.coins = Number(rec.data.coins || 0) + coins;
  rec.controls = rec.controls || defaultControls("4");
  const currency = normalizeCurrency(rec.controls);
  addCurrencyLedger(currency, { type: "earn", reason: "assignment_reward", amount: coins, balanceAfter: rec.data.coins, eventKey: "assignment:" + (result.occurrenceDate || "") });
  return coins;
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
    let studentExtras = {};
    if (type === "student") {
      rec.controls = rec.controls || defaultControls("4");
      studentExtras = dailyPayload(rec, body.localDate, { acknowledgeAchievements: true });
      if (studentExtras.error) return json({ ok: false, error: studentExtras.error }, 400);
      await putRecord(store, name, rec);
    }
    return json({
      ok: true,
      created: false,
      accountType: type,
      data: rec.data || null,
      controls: type === "student" ? publicControls(rec.controls || defaultControls("4")) : null,
      dailyStatus: type === "student" ? studentExtras.dailyStatus : undefined,
      recommendations: type === "student" ? studentExtras.recommendations : undefined,
      masterySummary: type === "student" ? studentExtras.masterySummary : undefined,
      learningPlan: type === "student" ? studentExtras.learningPlan : undefined,
      assignments: type === "student" ? studentExtras.assignments : undefined,
      achievements: type === "student" ? studentExtras.achievements : undefined,
      cosmetics: type === "student" ? studentExtras.cosmetics : undefined,
      children: type === "parent" ? rec.children || [] : undefined,
      linkedParent: type === "student" ? rec.parentKey || null : undefined,
    });
  }

  if (action === "report" || action === "save" || action === "placement_start" || action === "placement_progress" || action === "placement_complete" || action === "placement_skip" ||
      action === "mastery_challenge_start" || action === "mastery_challenge_answer" || action === "mastery_challenge_complete" ||
      action === "mastery_review_start" || action === "mastery_review_answer" || action === "mastery_review_complete" ||
      action === "daily_status" || action === "daily_problem_complete" || action === "daily_active_time" ||
      action === "assignment_status" || action === "assignment_start" || action === "assignment_answer" || action === "assignment_active_time" ||
      action === "learning_plan_status" || action === "achievement_status" ||
      action === "cosmetic_status" || action === "cosmetic_purchase" || action === "cosmetic_equip" || action === "cosmetic_reset" ||
      action === "coin_earn") {
    if (!name) return json({ ok: false, error: "name_required" }, 400);
    if (!validPin(pin)) return json({ ok: false, error: "pin_must_be_4_digits" }, 400);
    const auth = await authenticate(store, name, pin, "student");
    if (auth.error) return auth.error;
    const rec = auth.rec;

    if (action === "report") {
      rec.controls = rec.controls || defaultControls("4");
      Mastery.ensureControls(rec.controls);
      const extras = dailyPayload(rec, body.localDate, { acknowledgeAchievements: true });
      if (extras.error) return json({ ok: false, error: extras.error }, 400);
      await putRecord(store, name, rec);
      return json({ ok: true, data: rec.data || null, controls: publicControls(rec.controls || defaultControls("4")), masterySummary: extras.masterySummary, dailyStatus: extras.dailyStatus, recommendations: extras.recommendations, learningPlan: extras.learningPlan, assignments: extras.assignments, achievements: extras.achievements, cosmetics: extras.cosmetics, updated: rec.updated });
    }

    rec.controls = rec.controls || defaultControls("4");
    Mastery.ensureControls(rec.controls);
    Daily.ensureControls(rec.controls);

    if (action === "daily_status") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const extras = dailyPayload(rec, effective.date, { acknowledgeAchievements: true });
      await putRecord(store, name, rec);
      return json({ ok: true, dailyStatus: extras.dailyStatus, recommendations: extras.recommendations, masterySummary: extras.masterySummary, learningPlan: extras.learningPlan, assignments: extras.assignments, achievements: extras.achievements, cosmetics: extras.cosmetics, controls: publicControls(rec.controls) });
    }

    if (action === "learning_plan_status") {
      const extras = dailyPayload(rec, body.localDate, { acknowledgeAchievements: true });
      if (extras.error) return json({ ok: false, error: extras.error }, 400);
      await putRecord(store, name, rec);
      return json({ ok: true, learningPlan: extras.learningPlan, recommendations: extras.recommendations, achievements: extras.achievements, cosmetics: extras.cosmetics, controls: publicControls(rec.controls) });
    }

    if (action === "achievement_status") {
      const extras = dailyPayload(rec, body.localDate, { acknowledgeAchievements: true });
      if (extras.error) return json({ ok: false, error: extras.error }, 400);
      await putRecord(store, name, rec);
      return json({ ok: true, achievements: extras.achievements, cosmetics: extras.cosmetics, controls: publicControls(rec.controls) });
    }

    if (action === "cosmetic_status") {
      const extras = dailyPayload(rec, body.localDate, { acknowledgeCosmetics: true });
      if (extras.error) return json({ ok: false, error: extras.error }, 400);
      await putRecord(store, name, rec);
      return json({ ok: true, cosmetics: extras.cosmetics, achievements: extras.achievements, controls: publicControls(rec.controls), data: rec.data || null });
    }

    if (action === "cosmetic_purchase") {
      if (Object.prototype.hasOwnProperty.call(body, "priceCoins") || Object.prototype.hasOwnProperty.call(body, "coins") || Object.prototype.hasOwnProperty.call(body, "owned")) {
        return json({ ok: false, error: "client_catalog_not_allowed" }, 400);
      }
      rec.data = rec.data || {};
      achievementPayload(rec);
      cosmeticPayload(rec);
      const result = Cosmetics.purchase(rec.controls, rec.data, String(body.cosmeticId || ""), String(body.requestId || ""));
      if (result.error) {
        const status = result.error === "insufficient_coins" || result.error === "cosmetic_not_purchasable" ? 409 : result.error === "cosmetic_not_found" ? 404 : 400;
        await putRecord(store, name, rec);
        return json({ ok: false, error: result.error, cosmetics: Cosmetics.publicSummary(rec.controls.cosmetics, rec.data), data: rec.data || null }, status);
      }
      if (result.coinsSpent) {
        const currency = normalizeCurrency(rec.controls);
        addCurrencyLedger(currency, { type: "spend", reason: "cosmetic_purchase", amount: result.coinsSpent, balanceAfter: rec.data.coins || 0, eventKey: String(body.requestId || "") });
      }
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, duplicate: !!result.duplicate, alreadyOwned: !!result.alreadyOwned, coins: rec.data.coins || 0, coinsSpent: result.coinsSpent || 0, cosmeticId: result.item && result.item.id, cosmetics, data: rec.data || null, controls: publicControls(rec.controls) });
    }

    if (action === "cosmetic_equip") {
      if (body.owned || body.priceCoins || body.coins) return json({ ok: false, error: "client_inventory_not_allowed" }, 400);
      rec.data = rec.data || {};
      cosmeticPayload(rec);
      const result = Cosmetics.equip(rec.controls, rec.data, String(body.cosmeticId || ""), body.slot == null ? undefined : String(body.slot));
      if (result.error) {
        const status = result.error === "cosmetic_not_found" ? 404 : result.error === "cosmetic_not_owned" ? 409 : 400;
        return json({ ok: false, error: result.error }, status);
      }
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, cosmeticId: result.item.id, slot: result.item.slot, cosmetics, data: rec.data || null, controls: publicControls(rec.controls) });
    }

    if (action === "cosmetic_reset") {
      rec.data = rec.data || {};
      cosmeticPayload(rec);
      Cosmetics.resetEquipped(rec.controls, rec.data);
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, cosmetics, data: rec.data || null, controls: publicControls(rec.controls) });
    }

    if (action === "coin_earn") {
      if (Object.prototype.hasOwnProperty.call(body, "coins") || Object.prototype.hasOwnProperty.call(body, "amount") || Object.prototype.hasOwnProperty.call(body, "rewardCoins")) {
        return json({ ok: false, error: "client_coin_amount_not_allowed" }, 400);
      }
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const result = awardCoins(rec, body, effective.date);
      if (result.error) return json({ ok: false, error: result.error }, result.error === "daily_coin_cap_reached" ? 429 : 400);
      refreshLearningPlan(rec);
      const achievements = achievementPayload(rec, { acknowledgeAchievements: true });
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, duplicate: !!result.duplicate, reason: result.reason, awarded: result.awarded || 0, coins: result.coins, data: rec.data || null, achievements, cosmetics, controls: publicControls(rec.controls) });
    }

    if (action === "daily_problem_complete") {
      const effective = effectiveClientDate(body.localDate);
      const eventId = String(body.eventId || "");
      const source = String(body.source || "practice");
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const result = Daily.addProblem(rec.controls, effective.date, eventId, source);
      if (result.error) return json({ ok: false, error: result.error }, 400);
      const learningPlan = refreshLearningPlan(rec);
      const achievements = achievementPayload(rec, { acknowledgeAchievements: true });
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, duplicate: !!result.duplicate, dailyStatus: result.status, recommendations: Recommendations.primaryAndAlternates(rec.data || null, rec.controls, { localDate: effective.date }), learningPlan, assignments: Assignments.activeSummaries(rec.controls.assignments, { localDate: effective.date, includeNotes: false }), achievements, cosmetics, controls: publicControls(rec.controls) });
    }

    if (action === "daily_active_time") {
      const effective = effectiveClientDate(body.localDate);
      const eventId = String(body.eventId || "");
      const source = String(body.source || "practice");
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const result = Daily.addActiveTime(rec.controls, effective.date, eventId, Number(body.seconds || 0), source);
      if (result.error) return json({ ok: false, error: result.error }, result.error === "seconds_too_large" ? 413 : 400);
      const learningPlan = refreshLearningPlan(rec);
      const achievements = achievementPayload(rec, { acknowledgeAchievements: true });
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, duplicate: !!result.duplicate, dailyStatus: result.status, recommendations: Recommendations.primaryAndAlternates(rec.data || null, rec.controls, { localDate: effective.date }), learningPlan, assignments: Assignments.activeSummaries(rec.controls.assignments, { localDate: effective.date, includeNotes: false }), achievements, cosmetics, controls: publicControls(rec.controls) });
    }

    if (action === "assignment_status") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const payload = assignmentStatusPayload(rec, effective.date);
      if (payload.error) return json({ ok: false, error: payload.error }, 400);
      await putRecord(store, name, rec);
      return json(Object.assign({ ok: true }, payload));
    }

    if (action === "assignment_start") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const found = assignmentIndex(rec, body.assignmentId, effective.date);
      if (found.idx < 0) return json({ ok: false, error: "assignment_not_found" }, 404);
      const issued = Assignments.issueQuestion(found.assignment, generatePlacementQuestion, effective.date);
      rec.controls.assignments[found.idx] = issued.assignment || found.assignment;
      if (issued.error) {
        await putRecord(store, name, rec);
        return json({ ok: false, error: issued.error }, issued.error === "assignment_archived" || issued.error === "assignment_expired" ? 409 : 400);
      }
      rec.parentHistory = Array.isArray(rec.parentHistory) ? rec.parentHistory : [];
      const occurrenceDate = issued.question && issued.question.occurrenceDate;
      if (occurrenceDate && !rec.parentHistory.some((e) => e.action === "assignment_occurrence_started" && e.assignmentId === found.assignment.id && e.occurrenceDate === occurrenceDate)) {
        rec.parentHistory.push({ at: Date.now(), action: "assignment_occurrence_started", assignmentId: found.assignment.id, occurrenceDate });
        if (rec.parentHistory.length > 200) rec.parentHistory = rec.parentHistory.slice(-200);
      }
      await putRecord(store, name, rec);
      return json({ ok: true, assignment: Assignments.summarizeAssignment(rec.controls.assignments[found.idx], { localDate: effective.date, includeNotes: false }), question: issued.question, resumed: !!issued.resumed });
    }

    if (action === "assignment_answer") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const found = assignmentIndex(rec, body.assignmentId, effective.date);
      if (found.idx < 0) return json({ ok: false, error: "assignment_not_found" }, 404);
      if (body.completed || body.rewardCoins || body.reward) return json({ ok: false, error: "client_completion_not_allowed" }, 400);
      const result = Assignments.answerQuestion(found.assignment, body.questionId, body.choiceId, effective.date);
      rec.controls.assignments[found.idx] = result.assignment || found.assignment;
      if (result.error) {
        const status = result.error === "stale_question" || result.error === "assignment_archived" || result.error === "assignment_expired" ? 409 : 400;
        await putRecord(store, name, rec);
        return json({ ok: false, error: result.error }, status);
      }
      recordAssignmentPractice(rec, result.skillId, result.correct);
      markPracticeEvidenceRewarded(rec);
      Daily.addProblem(rec.controls, effective.date, "assignment:" + found.assignment.id + ":" + body.questionId, "assignment");
      const paid = payAssignmentReward(rec, result);
      rec.parentHistory = Array.isArray(rec.parentHistory) ? rec.parentHistory : [];
      if (result.completed) {
        rec.parentHistory.push({ at: Date.now(), action: "assignment_occurrence_completed", assignmentId: found.assignment.id, occurrenceDate: result.occurrenceDate });
        if (paid) rec.parentHistory.push({ at: Date.now(), action: "assignment_reward_paid", assignmentId: found.assignment.id, occurrenceDate: result.occurrenceDate, coins: paid });
        if (rec.parentHistory.length > 200) rec.parentHistory = rec.parentHistory.slice(-200);
      }
      let nextQuestion = null;
      if (!result.completed) {
        const issued = Assignments.issueQuestion(rec.controls.assignments[found.idx], generatePlacementQuestion, effective.date);
        rec.controls.assignments[found.idx] = issued.assignment || rec.controls.assignments[found.idx];
        nextQuestion = issued.question || null;
      }
      const payload = assignmentStatusPayload(rec, effective.date);
      await putRecord(store, name, rec);
      return json({ ok: true, correct: result.correct, completed: !!result.completed, rewardCoins: paid, progress: result.progress, assignment: Assignments.summarizeAssignment(rec.controls.assignments[found.idx], { localDate: effective.date, includeNotes: false }), question: nextQuestion, assignments: payload.assignments, recommendations: payload.recommendations, learningPlan: payload.learningPlan, dailyStatus: payload.dailyStatus, achievements: payload.achievements, cosmetics: payload.cosmetics, data: rec.data || null, controls: publicControls(rec.controls) });
    }

    if (action === "assignment_active_time") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const found = assignmentIndex(rec, body.assignmentId, effective.date);
      if (found.idx < 0) return json({ ok: false, error: "assignment_not_found" }, 404);
      if (body.completed || body.rewardCoins || body.reward) return json({ ok: false, error: "client_completion_not_allowed" }, 400);
      const result = Assignments.addActiveTime(found.assignment, body.eventId, Number(body.seconds || 0), effective.date);
      rec.controls.assignments[found.idx] = result.assignment || found.assignment;
      if (result.error) {
        const status = result.error === "seconds_too_large" ? 413 : result.error === "assignment_archived" || result.error === "assignment_expired" ? 409 : 400;
        await putRecord(store, name, rec);
        return json({ ok: false, error: result.error }, status);
      }
      let paid = 0;
      if (!result.duplicate) {
        Daily.addActiveTime(rec.controls, effective.date, "assignment-time:" + found.assignment.id + ":" + body.eventId, Number(body.seconds || 0), "assignment");
        paid = payAssignmentReward(rec, result);
      }
      rec.parentHistory = Array.isArray(rec.parentHistory) ? rec.parentHistory : [];
      if (result.completed) {
        rec.parentHistory.push({ at: Date.now(), action: "assignment_occurrence_completed", assignmentId: found.assignment.id, occurrenceDate: result.progress && result.progress.occurrenceDate });
        if (paid) rec.parentHistory.push({ at: Date.now(), action: "assignment_reward_paid", assignmentId: found.assignment.id, occurrenceDate: result.progress && result.progress.occurrenceDate, coins: paid });
        if (rec.parentHistory.length > 200) rec.parentHistory = rec.parentHistory.slice(-200);
      }
      const payload = assignmentStatusPayload(rec, effective.date);
      await putRecord(store, name, rec);
      return json({ ok: true, duplicate: !!result.duplicate, completed: !!result.completed, rewardCoins: paid, progress: result.progress, assignment: Assignments.summarizeAssignment(rec.controls.assignments[found.idx], { localDate: effective.date, includeNotes: false }), assignments: payload.assignments, recommendations: payload.recommendations, learningPlan: payload.learningPlan, dailyStatus: payload.dailyStatus, achievements: payload.achievements, cosmetics: payload.cosmetics, data: rec.data || null, controls: publicControls(rec.controls) });
    }

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
      refreshLearningPlan(rec);
      const achievements = achievementPayload(rec, { acknowledgeAchievements: true });
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, placement: publicPlacement(rec.controls.placement), achievements, cosmetics });
    }

    if (action === "placement_skip") {
      rec.controls.placement = Placement.skipPlacement(rec.controls.placement, rec.controls.homeGrade || "4");
      refreshLearningPlan(rec);
      const achievements = achievementPayload(rec, { acknowledgeAchievements: true });
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, placement: publicPlacement(rec.controls.placement), achievements, cosmetics });
    }

    if (action === "mastery_challenge_start") {
      const skillId = String(body.skillId || "");
      if (!skillId) return json({ ok: false, error: "skill_required" }, 400);
      const start = Mastery.startChallenge(rec.controls, rec.data || null, skillId);
      if (start.error) return json({ ok: false, error: start.error }, 409);
      const issued = issueMasteryQuestion(start.pending);
      if (!issued.question) return json({ ok: false, error: "question_unavailable" }, 500);
      await putRecord(store, name, rec);
      return json({ ok: true, challenge: Mastery.publicPending(rec.controls.skillMastery.pendingChallenge), question: issued.question, resumed: !!start.resumed });
    }

    if (action === "mastery_challenge_answer") {
      const questionId = String(body.questionId || "");
      const choiceId = String(body.choiceId || "");
      if (!questionId) return json({ ok: false, error: "question_required" }, 400);
      if (!choiceId) return json({ ok: false, error: "choice_required" }, 400);
      if (body.skillId) {
        const pending = rec.controls.skillMastery && rec.controls.skillMastery.pendingChallenge && rec.controls.skillMastery.pendingChallenge.pendingQuestion;
        if (!pending || String(body.skillId) !== pending.skillId) return json({ ok: false, error: "different_skill" }, 409);
      }
      const result = Mastery.answerPending(rec.controls.skillMastery.pendingChallenge, questionId, choiceId);
      if (result.error) {
        const status = result.error === "stale_question" || result.error === "question_already_answered" ? 409 : 400;
        return json({ ok: false, error: result.error }, status);
      }
      let question = null;
      const complete = Mastery.canComplete(rec.controls.skillMastery.pendingChallenge);
      if (!complete) question = issueMasteryQuestion(rec.controls.skillMastery.pendingChallenge).question;
      await putRecord(store, name, rec);
      return json({ ok: true, correct: result.correct, complete, challenge: Mastery.publicPending(rec.controls.skillMastery.pendingChallenge), question });
    }

    if (action === "mastery_challenge_complete") {
      const result = Mastery.completeChallenge(rec.controls, rec.data || null);
      if (result.error) return json({ ok: false, error: result.error }, 409);
      const learningPlan = refreshLearningPlan(rec);
      const achievements = achievementPayload(rec, { acknowledgeAchievements: true });
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, result: result.result, skillMastery: publicSkillMastery(rec.controls.skillMastery), masterySummary: Mastery.summary(rec.data || null, rec.controls), learningPlan, recommendations: Recommendations.primaryAndAlternates(rec.data || null, rec.controls), achievements, cosmetics });
    }

    if (action === "mastery_review_start") {
      const skillId = String(body.skillId || "");
      if (!skillId) return json({ ok: false, error: "skill_required" }, 400);
      const start = Mastery.startReview(rec.controls, rec.data || null, skillId);
      if (start.error) return json({ ok: false, error: start.error }, 409);
      const issued = issueMasteryQuestion(start.pending);
      if (!issued.question) return json({ ok: false, error: "question_unavailable" }, 500);
      await putRecord(store, name, rec);
      return json({ ok: true, review: Mastery.publicPending(rec.controls.skillMastery.pendingReview), question: issued.question, resumed: !!start.resumed });
    }

    if (action === "mastery_review_answer") {
      const questionId = String(body.questionId || "");
      const choiceId = String(body.choiceId || "");
      if (!questionId) return json({ ok: false, error: "question_required" }, 400);
      if (!choiceId) return json({ ok: false, error: "choice_required" }, 400);
      if (body.skillId) {
        const pending = rec.controls.skillMastery && rec.controls.skillMastery.pendingReview && rec.controls.skillMastery.pendingReview.pendingQuestion;
        if (!pending || String(body.skillId) !== pending.skillId) return json({ ok: false, error: "different_skill" }, 409);
      }
      const result = Mastery.answerPending(rec.controls.skillMastery.pendingReview, questionId, choiceId);
      if (result.error) {
        const status = result.error === "stale_question" || result.error === "question_already_answered" ? 409 : 400;
        return json({ ok: false, error: result.error }, status);
      }
      let question = null;
      const complete = Mastery.canComplete(rec.controls.skillMastery.pendingReview);
      if (!complete) question = issueMasteryQuestion(rec.controls.skillMastery.pendingReview).question;
      await putRecord(store, name, rec);
      return json({ ok: true, correct: result.correct, complete, review: Mastery.publicPending(rec.controls.skillMastery.pendingReview), question });
    }

    if (action === "mastery_review_complete") {
      const result = Mastery.completeReview(rec.controls);
      if (result.error) return json({ ok: false, error: result.error }, 409);
      const learningPlan = refreshLearningPlan(rec);
      const achievements = achievementPayload(rec, { acknowledgeAchievements: true });
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      await putRecord(store, name, rec);
      return json({ ok: true, result: result.result, skillMastery: publicSkillMastery(rec.controls.skillMastery), masterySummary: Mastery.summary(rec.data || null, rec.controls), learningPlan, recommendations: Recommendations.primaryAndAlternates(rec.data || null, rec.controls), achievements, cosmetics });
    }

    let dataStr;
    try {
      dataStr = JSON.stringify(body.data || {});
    } catch (_) {
      return json({ ok: false, error: "bad_data" }, 400);
    }
    if (dataStr.length > MAX_DATA) return json({ ok: false, error: "data_too_big" }, 413);
    rec.data = sanitizeSaveData(rec, body.data || {});
    refreshLearningPlan(rec);
    const achievements = achievementPayload(rec);
    const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
    await putRecord(store, name, rec);
    return json({ ok: true, achievements, cosmetics, data: rec.data || null });
  }

  const parentName = cleanName(body.parentName || name);
  const parentPin = String(body.parentPin || pin || "");
  if (["create_child", "link_child", "unlink_child", "reset_child_pin", "rename_child", "list_children", "parent_report", "update_child_controls", "apply_placement_recommendations", "undo_placement_recommendations", "reset_placement", "parent_update_daily_goals", "parent_update_vacations", "parent_grant_grace", "parent_list_assignments", "parent_create_assignment", "parent_update_assignment", "parent_archive_assignment"].includes(action)) {
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
      childRec.controls = childRec.controls || defaultControls("4");
      Mastery.ensureControls(childRec.controls);
      const extras = dailyPayload(childRec, body.localDate);
      if (extras.error) return json({ ok: false, error: extras.error }, 400);
      await putRecord(store, childName, childRec);
      return json({ ok: true, child: childSummary(childName, childRec), data: childRec.data || null, controls: publicControls(childRec.controls || defaultControls("4")), masterySummary: extras.masterySummary, dailyStatus: extras.dailyStatus, recommendations: extras.recommendations, learningPlan: extras.learningPlan, assignments: extras.assignments, achievements: extras.achievements, cosmetics: extras.cosmetics, updated: childRec.updated });
    }

    if (action === "parent_list_assignments") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      childRec.controls = childRec.controls || defaultControls("4");
      childRec.controls.assignments = Assignments.normalizeList(childRec.controls.assignments, effective.date);
      await putRecord(store, childName, childRec);
      return json({ ok: true, assignments: Assignments.summarizeList(childRec.controls.assignments, { localDate: effective.date, includeNotes: true }), controls: publicControls(childRec.controls) });
    }

    if (action === "parent_create_assignment") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      childRec.controls = childRec.controls || defaultControls("4");
      const result = Assignments.createAssignment(childRec.controls.assignments, body.assignment || {}, { effectiveDate: effective.date });
      if (result.error) return json({ ok: false, error: result.error }, 400);
      childRec.controls.assignments = result.assignments;
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "assignment_created", assignmentId: result.assignment.id, targetType: result.assignment.targetType, target: result.assignment.target, skills: result.assignment.skillIds.length });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, assignment: Assignments.summarizeAssignment(result.assignment, { localDate: effective.date, includeNotes: true }), assignments: Assignments.summarizeList(childRec.controls.assignments, { localDate: effective.date, includeNotes: true }), controls: publicControls(childRec.controls) });
    }

    if (action === "parent_update_assignment") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      childRec.controls = childRec.controls || defaultControls("4");
      const result = Assignments.updateAssignment(childRec.controls.assignments, body.assignmentId, body.assignment || {}, { effectiveDate: effective.date });
      if (result.error) return json({ ok: false, error: result.error }, result.error === "assignment_not_found" ? 404 : 400);
      childRec.controls.assignments = result.assignments;
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "assignment_updated", assignmentId: result.assignment.id, targetType: result.assignment.targetType, target: result.assignment.target, skills: result.assignment.skillIds.length });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, assignment: Assignments.summarizeAssignment(result.assignment, { localDate: effective.date, includeNotes: true }), assignments: Assignments.summarizeList(childRec.controls.assignments, { localDate: effective.date, includeNotes: true }), controls: publicControls(childRec.controls) });
    }

    if (action === "parent_archive_assignment") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      childRec.controls = childRec.controls || defaultControls("4");
      const result = Assignments.archiveAssignment(childRec.controls.assignments, body.assignmentId, { effectiveDate: effective.date });
      if (result.error) return json({ ok: false, error: result.error }, result.error === "assignment_not_found" ? 404 : 400);
      childRec.controls.assignments = result.assignments;
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "assignment_archived", assignmentId: result.assignment.id });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, assignment: Assignments.summarizeAssignment(result.assignment, { localDate: effective.date, includeNotes: true }), assignments: Assignments.summarizeList(childRec.controls.assignments, { localDate: effective.date, includeNotes: true }), controls: publicControls(childRec.controls) });
    }

    if (action === "parent_update_daily_goals") {
      childRec.controls = childRec.controls || defaultControls("4");
      Daily.ensureControls(childRec.controls);
      childRec.controls.dailyGoals = Daily.validateGoals(body.dailyGoals);
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "daily_goals_updated" });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      const extras = dailyPayload(childRec, body.localDate);
      if (extras.error) return json({ ok: false, error: extras.error }, 400);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(childRec.controls), dailyStatus: extras.dailyStatus });
    }

    if (action === "parent_update_vacations") {
      childRec.controls = childRec.controls || defaultControls("4");
      Daily.ensureControls(childRec.controls);
      childRec.controls.vacationRanges = Daily.validateVacations(body.vacationRanges);
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "vacations_updated", count: childRec.controls.vacationRanges.length });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      const extras = dailyPayload(childRec, body.localDate);
      if (extras.error) return json({ ok: false, error: extras.error }, 400);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(childRec.controls), dailyStatus: extras.dailyStatus });
    }

    if (action === "parent_grant_grace") {
      childRec.controls = childRec.controls || defaultControls("4");
      Daily.ensureControls(childRec.controls);
      const result = Daily.grantGrace(childRec.controls, body.quantity, "parent");
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "grace_granted", quantity: result.quantity });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      const extras = dailyPayload(childRec, body.localDate);
      if (extras.error) return json({ ok: false, error: extras.error }, 400);
      await putRecord(store, childName, childRec);
      return json({ ok: true, quantity: result.quantity, controls: publicControls(childRec.controls), dailyStatus: extras.dailyStatus });
    }

    if (action === "apply_placement_recommendations") {
      const result = Placement.applyRecommendations(childRec.controls || defaultControls("4"), Array.isArray(body.recommendationIds) ? body.recommendationIds : []);
      childRec.controls = result.controls;
      refreshLearningPlan(childRec);
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "placement_recommendations_applied", count: result.applied.length });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(childRec.controls), applied: result.applied });
    }

    if (action === "undo_placement_recommendations") {
      const result = Placement.undoLastApply(childRec.controls || defaultControls("4"));
      childRec.controls = result.controls;
      refreshLearningPlan(childRec);
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "placement_recommendations_undone", count: result.restored.length });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(childRec.controls), restored: result.restored });
    }

    if (action === "reset_placement") {
      childRec.controls = childRec.controls || defaultControls("4");
      childRec.controls.placement = Placement.resetForRetake(childRec.controls.placement, childRec.controls.homeGrade || "4");
      refreshLearningPlan(childRec);
      childRec.parentHistory = Array.isArray(childRec.parentHistory) ? childRec.parentHistory : [];
      childRec.parentHistory.push({ at: Date.now(), action: "placement_retake_requested" });
      if (childRec.parentHistory.length > 200) childRec.parentHistory = childRec.parentHistory.slice(-200);
      await putRecord(store, childName, childRec);
      return json({ ok: true, controls: publicControls(childRec.controls) });
    }

    if (action === "update_child_controls") {
      const patch = body.controls && typeof body.controls === "object" ? body.controls : {};
      const current = childRec.controls || defaultControls("4");
      const allowed = ["homeGrade", "allowAboveGrade", "audioInstructions", "skillOverrides", "parentNotes", "placement"];
      for (const k of allowed) if (Object.prototype.hasOwnProperty.call(patch, k)) current[k] = patch[k];
      if (!["K", "1", "2", "3", "4", "5"].includes(String(current.homeGrade))) return json({ ok: false, error: "invalid_grade" }, 400);
      childRec.controls = current;
      refreshLearningPlan(childRec);
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
