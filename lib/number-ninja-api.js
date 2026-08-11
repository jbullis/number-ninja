const { StorageConfigurationError, createStore } = require("./storage");
const Placement = require("../js/placement.js");
const Mastery = require("../js/mastery.js");
const Daily = require("../js/daily.js");
const Recommendations = require("../js/recommendations.js");
const Assignments = require("../js/assignments.js");
const LearningPlan = require("../js/learning-plan.js");
const Achievements = require("../js/achievements.js");
const Cosmetics = require("../js/cosmetics.js");
const Curriculum = require("../js/curriculum.js");
const { generatePlacementQuestion } = require("./placement-question-generator");

const MAX_NAME = 20;
const MAX_DATA = 24000;
const MAX_COIN_EVENTS = 120;
const MAX_DAILY_EARNED_COINS = 300;
const MAX_CURRENCY_LEDGER = 120;
const ACTIVITY_RETENTION_DAYS = 90;
const ACTIVITY_BUCKET_EMERGENCY_CAP = 12000;
const MAX_RECENT_ACTIVITY_IDS = 5000;
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
function activityKeyFor(n) {
  return keyFor(n) + ":activity";
}
function activityBucketKeyFor(n, month) {
  return activityKeyFor(n) + ":" + month;
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
    practice: { version: 1, pendingQuestion: null },
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

function publicPracticeQuestion(q) {
  if (!q || q.answered) return null;
  return {
    id: q.id,
    mode: q.mode || "practice",
    skillId: q.skillId,
    skillLabel: q.skillLabel,
    skillGrade: q.skillGrade,
    qHTML: q.qHTML,
    tip: q.tip || "",
    issuedAt: q.issuedAt || null,
    choices: (q.choices || []).map((c) => ({ id: c.id, h: c.h })),
  };
}

function activityCutoffMs(now) {
  return Number(now || Date.now()) - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

function monthKeyFromTime(ms) {
  const d = new Date(Number(ms || Date.now()));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

function monthKeyFromDate(date) {
  return Daily.validDate(date) ? date.slice(0, 7) : monthKeyFromTime(Date.now());
}

function addMonthsKey(key, delta) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

function monthKeysBetween(startMonth, endMonth) {
  const keys = [];
  let cur = startMonth;
  for (let i = 0; i < 8 && cur <= endMonth; i++) {
    keys.push(cur);
    cur = addMonthsKey(cur, 1);
  }
  return keys;
}

function retainedMonthKeys(query) {
  query = query || {};
  const today = Daily.todayLocal(new Date());
  const minDate = Daily.addDays(today, -ACTIVITY_RETENTION_DAYS);
  const maxDate = Daily.addDays(today, 1);
  let from = Daily.validDate(query.dateFrom) ? query.dateFrom : minDate;
  let to = Daily.validDate(query.dateTo) ? query.dateTo : maxDate;
  if (Daily.cmpDate(from, minDate) < 0) from = minDate;
  if (Daily.cmpDate(to, maxDate) > 0) to = maxDate;
  if (Daily.cmpDate(from, to) > 0) return [];
  return monthKeysBetween(monthKeyFromDate(from), monthKeyFromDate(to));
}

function normalizeActivitySummary(activity) {
  activity = activity && typeof activity === "object" ? JSON.parse(JSON.stringify(activity)) : {};
  const out = {
    version: 2,
    bucketGranularity: "month",
    retentionDays: ACTIVITY_RETENTION_DAYS,
    daily: activity.daily && typeof activity.daily === "object" ? activity.daily : {},
    skills: activity.skills && typeof activity.skills === "object" ? activity.skills : {},
    aggregates: activity.aggregates && typeof activity.aggregates === "object" ? activity.aggregates : {},
    bucketMonths: Array.isArray(activity.bucketMonths) ? activity.bucketMonths.map(String).filter((m) => /^\d{4}-\d{2}$/.test(m)) : [],
    recentAttemptIds: Array.isArray(activity.recentAttemptIds) ? activity.recentAttemptIds.map(String).slice(-MAX_RECENT_ACTIVITY_IDS) : [],
  };
  if (Array.isArray(activity.attempts) && activity.attempts.length) out._legacyAttempts = activity.attempts;
  out.aggregates.totalAttempts = Math.max(0, Math.floor(Number(out.aggregates.totalAttempts || 0)));
  out.aggregates.totalCorrect = Math.max(0, Math.floor(Number(out.aggregates.totalCorrect || 0)));
  out.aggregates.totalHelp = Math.max(0, Math.floor(Number(out.aggregates.totalHelp || 0)));
  Object.keys(out.daily).forEach((d) => {
    if (!Daily.validDate(d)) delete out.daily[d];
    else {
      const x = out.daily[d] || {};
      out.daily[d] = {
        attempts: Math.max(0, Math.floor(Number(x.attempts || 0))),
        correct: Math.max(0, Math.floor(Number(x.correct || 0))),
        help: Math.max(0, Math.floor(Number(x.help || 0))),
        activeSeconds: Math.max(0, Math.floor(Number(x.activeSeconds || 0))),
        skills: Array.isArray(x.skills) ? x.skills.map(String).slice(-80) : [],
        assignmentsCompleted: Math.max(0, Math.floor(Number(x.assignmentsCompleted || 0))),
        masteryEvents: Math.max(0, Math.floor(Number(x.masteryEvents || 0))),
      };
    }
  });
  Object.keys(out.skills).forEach((id) => {
    const x = out.skills[id] || {};
    out.skills[id] = {
      attempts: Math.max(0, Math.floor(Number(x.attempts || 0))),
      correct: Math.max(0, Math.floor(Number(x.correct || 0))),
      help: Math.max(0, Math.floor(Number(x.help || 0))),
      lastAt: Math.max(0, Number(x.lastAt || 0)),
    };
  });
  out.bucketMonths = Array.from(new Set(out.bucketMonths)).sort().slice(-8);
  return out;
}

function sanitizeAttempt(attempt) {
  const skill = Curriculum.BY_ID[attempt && attempt.skillId] || {};
  const at = Number(attempt && attempt.at || Date.now());
  return {
    attemptId: String(attempt && (attempt.attemptId || attempt.questionId) || "").slice(0, 120),
    at,
    localDate: Daily.validDate(attempt && attempt.localDate) ? attempt.localDate : Daily.todayLocal(new Date(at)),
    source: String(attempt && attempt.source || "practice").slice(0, 40),
    mode: String(attempt && (attempt.mode || attempt.source) || "practice").slice(0, 40),
    skillId: String(attempt && attempt.skillId || "").slice(0, 80),
    skillGrade: String(skill.grade || attempt && attempt.skillGrade || "").slice(0, 2),
    skillGroup: String(skill.group || attempt && attempt.skillGroup || "").slice(0, 60),
    questionId: String(attempt && attempt.questionId || "").slice(0, 140),
    choiceId: String(attempt && attempt.choiceId || "").slice(0, 140),
    correct: !!(attempt && attempt.correct),
    helpUsed: !!(attempt && attempt.helpUsed),
    helpType: attempt && attempt.helpType ? String(attempt.helpType).slice(0, 30) : null,
    assignmentId: attempt && attempt.assignmentId ? String(attempt.assignmentId).slice(0, 80) : null,
    occurrenceDate: Daily.validDate(attempt && attempt.occurrenceDate) ? attempt.occurrenceDate : null,
    responseMs: Math.max(0, Math.min(10 * 60 * 1000, Math.floor(Number(attempt && attempt.responseMs || 0)))) || null,
  };
}

function normalizeActivityBucket(bucket, cutoff) {
  bucket = bucket && typeof bucket === "object" ? bucket : {};
  const attempts = Array.isArray(bucket.attempts) ? bucket.attempts.map(sanitizeAttempt).filter((a) => a.attemptId && Number(a.at || 0) >= cutoff) : [];
  const seen = new Set();
  return {
    version: 1,
    attempts: attempts.filter((a) => {
      if (seen.has(a.attemptId)) return false;
      seen.add(a.attemptId);
      return true;
    }).sort((a, b) => Number(a.at || 0) - Number(b.at || 0)).slice(-ACTIVITY_BUCKET_EMERGENCY_CAP),
  };
}

async function getActivity(store, name, query) {
  const raw = await store.get(activityKeyFor(name));
  let summary;
  try { summary = normalizeActivitySummary(raw ? JSON.parse(raw) : null); } catch (_) { summary = normalizeActivitySummary(); }
  const cutoff = activityCutoffMs();
  const months = new Set(retainedMonthKeys(query));
  (summary.bucketMonths || []).forEach((m) => {
    if (m >= monthKeyFromTime(cutoff)) months.add(m);
  });
  const activity = {
    version: 2,
    bucketGranularity: "month",
    retentionDays: ACTIVITY_RETENTION_DAYS,
    daily: summary.daily,
    skills: summary.skills,
    aggregates: summary.aggregates,
    bucketMonths: summary.bucketMonths || [],
    recentAttemptIds: summary.recentAttemptIds || [],
    buckets: {},
    dirtyBuckets: {},
    deleteBuckets: [],
    attempts: [],
  };
  for (const month of Array.from(months).sort()) {
    if (month < monthKeyFromTime(cutoff)) {
      activity.deleteBuckets.push(month);
      continue;
    }
    const bRaw = await store.get(activityBucketKeyFor(name, month));
    let bucket;
    try { bucket = normalizeActivityBucket(bRaw ? JSON.parse(bRaw) : null, cutoff); } catch (_) { bucket = normalizeActivityBucket(null, cutoff); }
    activity.buckets[month] = bucket;
  }
  if (Array.isArray(summary._legacyAttempts) && summary._legacyAttempts.length) {
    summary._legacyAttempts.map(sanitizeAttempt).filter((a) => a.attemptId && Number(a.at || 0) >= cutoff).forEach((a) => addAttemptDetail(activity, a));
    activity.clearLegacyAttempts = true;
  }
  Object.keys(activity.buckets).forEach((m) => { activity.attempts = activity.attempts.concat(activity.buckets[m].attempts || []); });
  activity.attempts = activity.attempts.filter((a) => Number(a.at || 0) >= cutoff);
  return activity;
}

async function putActivity(store, name, activity) {
  activity = activity || {};
  const cutoffMonth = monthKeyFromTime(activityCutoffMs());
  const months = Array.from(new Set((activity.bucketMonths || []).concat(Object.keys(activity.buckets || {})))).filter((m) => /^\d{4}-\d{2}$/.test(m));
  const keptMonths = months.filter((m) => m >= cutoffMonth).sort().slice(-8);
  const summary = normalizeActivitySummary({
    version: 2,
    daily: activity.daily || {},
    skills: activity.skills || {},
    aggregates: activity.aggregates || {},
    bucketMonths: keptMonths,
    recentAttemptIds: activity.recentAttemptIds || [],
  });
  await store.set(activityKeyFor(name), JSON.stringify(summary));
  for (const month of Object.keys(activity.dirtyBuckets || {})) {
    if (month >= cutoffMonth) await store.set(activityBucketKeyFor(name, month), JSON.stringify(normalizeActivityBucket(activity.buckets[month], activityCutoffMs())));
  }
  for (const month of (activity.deleteBuckets || []).concat(months.filter((m) => m < cutoffMonth))) {
    await store.delete(activityBucketKeyFor(name, month));
  }
}

async function moveActivityKeys(store, oldName, newName) {
  if (canon(oldName) === canon(newName)) return;
  const oldBase = activityKeyFor(oldName);
  const raw = await store.get(oldBase);
  if (!raw) return;
  let summary = null;
  try { summary = normalizeActivitySummary(JSON.parse(raw)); } catch (_) { summary = normalizeActivitySummary(); }
  const months = Array.from(new Set(summary.bucketMonths || [])).filter((m) => /^\d{4}-\d{2}$/.test(m));
  await store.set(activityKeyFor(newName), raw);
  const copied = [];
  for (const month of months) {
    const oldBucket = activityBucketKeyFor(oldName, month);
    const bRaw = await store.get(oldBucket);
    if (bRaw) {
      await store.set(activityBucketKeyFor(newName, month), bRaw);
      copied.push(oldBucket);
    }
  }
  await store.delete(oldBase);
  for (const key of copied) await store.delete(key);
}

function addAttemptDetail(activity, rec) {
  const month = monthKeyFromTime(rec.at);
  activity.buckets[month] = activity.buckets[month] || { version: 1, attempts: [] };
  if ((activity.buckets[month].attempts || []).some((a) => a.attemptId === rec.attemptId)) return false;
  activity.buckets[month].attempts.push(rec);
  activity.buckets[month] = normalizeActivityBucket(activity.buckets[month], activityCutoffMs());
  activity.dirtyBuckets[month] = true;
  if (!activity.bucketMonths.includes(month)) activity.bucketMonths.push(month);
  return true;
}

function recordActivityAttempt(activity, attempt) {
  const rec = sanitizeAttempt(attempt);
  if (!rec.attemptId) return activity;
  activity = activity || normalizeActivitySummary();
  activity.buckets = activity.buckets || {};
  activity.dirtyBuckets = activity.dirtyBuckets || {};
  activity.bucketMonths = Array.isArray(activity.bucketMonths) ? activity.bucketMonths : [];
  activity.recentAttemptIds = Array.isArray(activity.recentAttemptIds) ? activity.recentAttemptIds : [];
  if (activity.recentAttemptIds.includes(rec.attemptId)) return activity;
  if (Object.values(activity.buckets).some((b) => (b.attempts || []).some((a) => a.attemptId === rec.attemptId))) return activity;
  if (!addAttemptDetail(activity, rec)) return activity;
  activity.recentAttemptIds.push(rec.attemptId);
  activity.recentAttemptIds = activity.recentAttemptIds.slice(-MAX_RECENT_ACTIVITY_IDS);
  activity.aggregates = activity.aggregates || {};
  activity.aggregates.totalAttempts = Number(activity.aggregates.totalAttempts || 0) + 1;
  if (rec.correct) activity.aggregates.totalCorrect = Number(activity.aggregates.totalCorrect || 0) + 1;
  if (rec.helpUsed) activity.aggregates.totalHelp = Number(activity.aggregates.totalHelp || 0) + 1;
  activity.daily = activity.daily || {};
  const d = activity.daily[rec.localDate] = activity.daily[rec.localDate] || { attempts: 0, correct: 0, help: 0, activeSeconds: 0, skills: [] };
  d.attempts++;
  if (rec.correct) d.correct++;
  if (rec.helpUsed) d.help++;
  if (rec.skillId && !d.skills.includes(rec.skillId)) d.skills.push(rec.skillId);
  d.skills = d.skills.slice(-80);
  activity.skills = activity.skills || {};
  const s = activity.skills[rec.skillId] = activity.skills[rec.skillId] || { attempts: 0, correct: 0, help: 0, lastAt: 0 };
  s.attempts++;
  if (rec.correct) s.correct++;
  if (rec.helpUsed) s.help++;
  s.lastAt = rec.at;
  activity.attempts = Object.keys(activity.buckets).reduce((all, m) => all.concat(activity.buckets[m].attempts || []), []);
  return activity;
}

function filterActivity(activity, query) {
  query = query || {};
  const cutoff = activityCutoffMs();
  const from = Daily.validDate(query.dateFrom) ? query.dateFrom : null;
  const to = Daily.validDate(query.dateTo) ? query.dateTo : null;
  const skillId = String(query.skillId || "");
  const source = String(query.source || query.mode || "");
  const assignmentId = String(query.assignmentId || "");
  const limit = Math.max(1, Math.min(1000, Math.floor(Number(query.limit || 200))));
  const offset = Math.max(0, Math.floor(Number(query.offset || 0)));
  let attempts = (activity.attempts || []).filter((a) => Number(a.at || 0) >= cutoff && (!from || Daily.cmpDate(a.localDate, from) >= 0) && (!to || Daily.cmpDate(a.localDate, to) <= 0));
  if (skillId) attempts = attempts.filter((a) => a.skillId === skillId);
  if (source) attempts = attempts.filter((a) => a.source === source || a.mode === source);
  if (assignmentId) attempts = attempts.filter((a) => a.assignmentId === assignmentId);
  if (query.correct !== undefined && query.correct !== null && query.correct !== "") attempts = attempts.filter((a) => a.correct === (query.correct === true || query.correct === "true"));
  if (query.helpUsed !== undefined && query.helpUsed !== null && query.helpUsed !== "") attempts = attempts.filter((a) => a.helpUsed === (query.helpUsed === true || query.helpUsed === "true"));
  attempts = attempts.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  const totalRetained = attempts.length;
  attempts = attempts.slice(offset, offset + limit);
  const daily = {};
  Object.keys(activity.daily || {}).sort().forEach((d) => {
    if ((!from || Daily.cmpDate(d, from) >= 0) && (!to || Daily.cmpDate(d, to) <= 0)) daily[d] = activity.daily[d];
  });
  return { version: 2, retentionDays: ACTIVITY_RETENTION_DAYS, bucketGranularity: "month", attempts, totalRetained, limit, offset, daily, aggregates: activity.aggregates || {}, skills: activity.skills || {} };
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
  delete c.reporting;
  if (c.practice) c.practice = { version: 1, pendingQuestion: publicPracticeQuestion(c.practice.pendingQuestion) };
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

function reportRange(body) {
  const today = Daily.todayLocal(new Date());
  const preset = String(body.range || "");
  let from = body.dateFrom ? String(body.dateFrom) : "";
  let to = body.dateTo ? String(body.dateTo) : "";
  if (preset === "today") from = to = today;
  else if (preset === "last7") { from = Daily.addDays(today, -6); to = today; }
  else if (preset === "last30") { from = Daily.addDays(today, -29); to = today; }
  else if (preset === "thisWeek") {
    let start = today;
    while (Daily.weekdayKey(start) !== "mon") start = Daily.addDays(start, -1);
    from = start; to = today;
  } else if (preset === "thisMonth") {
    from = today.slice(0, 8) + "01"; to = today;
  }
  if (!Daily.validDate(from) || !Daily.validDate(to) || Daily.cmpDate(from, to) > 0) return { error: "invalid_date_range" };
  if (Daily.cmpDate(to, Daily.addDays(today, 2)) > 0 || Daily.cmpDate(from, "2020-01-01") < 0) return { error: "invalid_date_range" };
  return { dateFrom: from, dateTo: to, preset: preset || "custom" };
}

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

function msToDate(ms) {
  return Daily.todayLocal(new Date(Number(ms || Date.now())));
}

function attemptsInRange(activity, range, filters) {
  filters = filters || {};
  let attempts = (activity.attempts || []).filter((a) => Daily.cmpDate(a.localDate, range.dateFrom) >= 0 && Daily.cmpDate(a.localDate, range.dateTo) <= 0);
  if (filters.skillId) attempts = attempts.filter((a) => a.skillId === String(filters.skillId));
  const source = String(filters.source || filters.mode || "");
  if (source) attempts = attempts.filter((a) => a.source === source || a.mode === source);
  if (filters.correct !== undefined && filters.correct !== null && filters.correct !== "") attempts = attempts.filter((a) => a.correct === (filters.correct === true || filters.correct === "true"));
  if (filters.helpUsed !== undefined && filters.helpUsed !== null && filters.helpUsed !== "") attempts = attempts.filter((a) => a.helpUsed === (filters.helpUsed === true || filters.helpUsed === "true"));
  if (filters.assignmentId) attempts = attempts.filter((a) => a.assignmentId === String(filters.assignmentId));
  return attempts.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
}

function hasReportFilters(filters) {
  return !!(filters && (filters.skillId || filters.source || filters.correct !== undefined && filters.correct !== null && filters.correct !== "" || filters.helpUsed !== undefined && filters.helpUsed !== null && filters.helpUsed !== "" || filters.assignmentId));
}

function rangeDates(range) {
  const dates = [];
  if (!Daily.validDate(range.dateFrom) || !Daily.validDate(range.dateTo)) return dates;
  let d = range.dateFrom;
  for (let guard = 0; guard < 3700 && Daily.cmpDate(d, range.dateTo) <= 0; guard++, d = Daily.addDays(d, 1)) dates.push(d);
  return dates;
}

function summarizeDaily(activity, range, attempts, usePermanentSummaries) {
  const byDate = {};
  if (usePermanentSummaries) {
    Object.keys(activity.daily || {}).forEach((date) => {
      if (Daily.cmpDate(date, range.dateFrom) < 0 || Daily.cmpDate(date, range.dateTo) > 0) return;
      const src = activity.daily[date] || {};
      byDate[date] = {
        date,
        attempts: Math.max(0, Math.floor(Number(src.attempts || 0))),
        correct: Math.max(0, Math.floor(Number(src.correct || 0))),
        incorrect: Math.max(0, Math.floor(Number(src.attempts || 0))) - Math.max(0, Math.floor(Number(src.correct || 0))),
        help: Math.max(0, Math.floor(Number(src.help || 0))),
        activeSeconds: Math.max(0, Math.floor(Number(src.activeSeconds || 0))),
        skills: Array.isArray(src.skills) ? src.skills.map(String) : [],
      };
    });
  }
  attempts.forEach((a) => {
    if (usePermanentSummaries && byDate[a.localDate]) return;
    const d = byDate[a.localDate] = byDate[a.localDate] || { date: a.localDate, attempts: 0, correct: 0, incorrect: 0, help: 0, activeSeconds: 0, skills: [] };
    d.attempts++;
    if (a.correct) d.correct++; else d.incorrect++;
    if (a.helpUsed) d.help++;
    if (a.skillId && !d.skills.includes(a.skillId)) d.skills.push(a.skillId);
  });
  return Object.keys(byDate).sort().map((date) => {
    const d = byDate[date];
    d.accuracy = pct(d.correct, d.attempts);
    d.skills = d.skills.map((id) => ({ skillId: id, label: skillLabelForReport(id) })).slice(0, 12);
    return d;
  });
}

function skillLabelForReport(skillId) {
  return (Curriculum.BY_ID[skillId] && Curriculum.BY_ID[skillId].label) || skillId || "";
}

function skillSummariesForReport(rec, attempts) {
  const by = {};
  attempts.forEach((a) => {
    const s = by[a.skillId] = by[a.skillId] || { skillId: a.skillId, label: skillLabelForReport(a.skillId), grade: "", group: "", attempts: 0, correct: 0, incorrect: 0, help: 0 };
    const skill = Curriculum.BY_ID[a.skillId] || {};
    s.grade = String(skill.grade || a.skillGrade || "");
    s.group = String(skill.group || a.skillGroup || "");
    s.attempts++;
    if (a.correct) s.correct++; else s.incorrect++;
    if (a.helpUsed) s.help++;
  });
  const mastery = rec.data && rec.data.progress && rec.data.progress.mastery || {};
  const sm = rec.controls && rec.controls.skillMastery && rec.controls.skillMastery.bySkill || {};
  const planItems = LearningPlan.activeItems(rec.controls && rec.controls.learningPlan, null);
  return Object.keys(by).map((id) => {
    const row = by[id];
    const state = sm[id] || {};
    row.accuracy = pct(row.correct, row.attempts);
    row.helpRate = pct(row.help, row.attempts);
    row.currentMastery = Math.max(0, Math.min(100, Math.round(Number(mastery[id] || 0))));
    row.certified = !!state.certified;
    row.needsReview = !!state.needsReview;
    row.learningPlan = planItems.find((i) => i.skillId === id && i.status === "active") || null;
    row.status = row.needsReview ? "Needs Review" : row.certified ? "Black Belt" : row.learningPlan ? (row.learningPlan.type === "enrichment" ? "Advanced training" : "Practice focus") : row.accuracy != null && row.attempts >= 5 && row.accuracy < 60 ? "Needs practice" : row.accuracy != null && row.attempts >= 5 && row.accuracy >= 85 ? "Strong" : "Active";
    return row;
  }).sort((a, b) => {
    const pri = (x) => x.needsReview ? 0 : x.status === "Needs practice" ? 1 : x.learningPlan && x.learningPlan.type === "remediation" ? 2 : 5;
    return pri(a) - pri(b) || Number(a.accuracy || 101) - Number(b.accuracy || 101) || b.attempts - a.attempts;
  });
}

function assignmentReportSummaries(controls, localDate) {
  return Assignments.summarizeList(controls.assignments, { localDate, includeNotes: false }).map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    displayStatus: a.displayStatus,
    targetType: a.targetType,
    target: a.target,
    minimumAccuracy: a.minimumAccuracy,
    dueDate: a.dueDate || null,
    schedule: a.schedule,
    progress: a.progress || {},
    rewardCoins: Number(a.reward && a.reward.coins || 0),
  }));
}

function dailyGoalsCompletedInRange(controls, range) {
  const state = controls && controls.dailyActivity || {};
  const days = state.days && typeof state.days === "object" ? state.days : {};
  return rangeDates(range).filter((date) => days[date] && days[date].goalCompleted).length;
}

function assignmentCompletionsInRange(rec, range) {
  const seen = new Set();
  const mark = (assignmentId, date, at) => {
    if (!assignmentId) return;
    const d = Daily.validDate(date) ? date : at ? msToDate(at) : null;
    if (!Daily.validDate(d) || Daily.cmpDate(d, range.dateFrom) < 0 || Daily.cmpDate(d, range.dateTo) > 0) return;
    seen.add(String(assignmentId) + ":" + d);
  };
  (rec.controls.assignments || []).forEach((a) => {
    const id = a && a.id;
    const occ = a && a.occurrences || {};
    if (occ.current && occ.current.completed) mark(id, occ.current.date || occ.currentOccurrenceDate, occ.current.completedAt);
    (occ.recentOccurrences || []).forEach((o) => {
      if (o && o.completed) mark(id, o.date, o.completedAt);
    });
  });
  (rec.parentHistory || []).forEach((e) => {
    if (e && e.action === "assignment_occurrence_completed") mark(e.assignmentId, e.occurrenceDate, e.at);
  });
  return seen.size;
}

function currentReportStatus(rec, assignments, mastery, learningPlan, goals) {
  const bySkill = mastery.bySkill || {};
  const activePlan = (learningPlan.items || []).filter((i) => i.status === "active");
  return {
    homeGrade: rec.controls.homeGrade || "4",
    allowAboveGrade: rec.controls.allowAboveGrade !== false,
    currentStreak: Number(goals.currentStreak || 0),
    longestStreak: Number(goals.longestStreak || 0),
    graceBalance: Number(goals.graceBalance || 0),
    activeAssignments: assignments.filter((a) => a.status === "active" || a.displayStatus === "active" || a.displayStatus === "overdue").length,
    currentBlackBelts: Object.keys(bySkill).filter((id) => bySkill[id] && bySkill[id].certified).length,
    currentNeedsReview: Object.keys(bySkill).filter((id) => bySkill[id] && bySkill[id].needsReview).length,
    activeRemediation: activePlan.filter((i) => i.type === "remediation").length,
    activeEnrichment: activePlan.filter((i) => i.type === "enrichment").length,
  };
}

function reportAlertState(controls, activeAlerts, now) {
  controls.reporting = controls.reporting && typeof controls.reporting === "object" ? controls.reporting : { version: 1, alerts: {} };
  controls.reporting.alerts = controls.reporting.alerts && typeof controls.reporting.alerts === "object" ? controls.reporting.alerts : {};
  const activeIds = new Set(activeAlerts.map((a) => a.id));
  activeAlerts.forEach((a) => {
    const prev = controls.reporting.alerts[a.id] || {};
    controls.reporting.alerts[a.id] = { firstSeenAt: prev.firstSeenAt || now, lastSeenAt: now, status: "active" };
    a.firstSeenAt = controls.reporting.alerts[a.id].firstSeenAt;
  });
  Object.keys(controls.reporting.alerts).forEach((id) => {
    if (!activeIds.has(id) && controls.reporting.alerts[id].status === "active") {
      controls.reporting.alerts[id].status = "resolved";
      controls.reporting.alerts[id].resolvedAt = now;
    }
  });
  const keys = Object.keys(controls.reporting.alerts).slice(-120);
  controls.reporting.alerts = keys.reduce((o, k) => (o[k] = controls.reporting.alerts[k], o), {});
  return activeAlerts;
}

function reportAlerts(rec, report, range, now) {
  const alerts = [], milestones = [];
  const push = (a) => alerts.push(Object.assign({ severity: "info", createdAt: now, status: "active" }, a));
  report.skills.forEach((s) => {
    if (s.attempts >= 5 && Number(s.accuracy || 0) < 60) push({ id: "weak:" + s.skillId, type: "weak_skill", severity: "watch", skillId: s.skillId, title: "Needs practice: " + s.label, description: "Recent work shows this skill could use more practice." });
    if (s.attempts >= 5 && Number(s.helpRate || 0) >= 40) push({ id: "help:" + s.skillId, type: "help_usage", severity: "watch", skillId: s.skillId, title: "Watch help use: " + s.label, description: "This skill has frequent hint/help use." });
    if (s.attempts >= 5 && Number(s.accuracy || 0) >= 85) milestones.push({ id: "strong:" + s.skillId, type: "strength", skillId: s.skillId, title: "Strong skill: " + s.label, description: "Accuracy is strong over a meaningful sample." });
  });
  const mastery = Mastery.summary(rec.data || null, rec.controls);
  (mastery.dueReviews || []).forEach((x) => push({ id: "review:" + x.skillId, type: "needs_review", severity: "watch", skillId: x.skillId, title: "Review due: " + skillLabelForReport(x.skillId), description: "This Black Belt skill is due for review." }));
  (mastery.eligibleChallenges || []).slice(0, 4).forEach((x) => push({ id: "challenge:" + x.skillId, type: "challenge_ready", severity: "info", skillId: x.skillId, title: "Black Belt Challenge ready", description: skillLabelForReport(x.skillId) + " is ready for a mastery challenge." }));
  (rec.controls.assignments || []).forEach((a) => {
    const s = Assignments.summarizeAssignment(a, { localDate: range.dateTo, includeNotes: false });
    if (s.displayStatus === "overdue") push({ id: "assignment_overdue:" + s.id, type: "assignment_overdue", severity: "watch", assignmentId: s.id, title: "Assignment waiting", description: s.title + " is past its due date but still finishable." });
    if (s.progress && s.progress.targetReached && !s.progress.accuracyMet) push({ id: "assignment_accuracy:" + s.id, type: "assignment_accuracy", severity: "info", assignmentId: s.id, title: "Accuracy target in progress", description: s.title + " reached the work target and needs a little more accuracy." });
    if (s.progress && s.progress.completed) milestones.push({ id: "assignment_done:" + s.id + ":" + (s.progress.occurrenceDate || ""), type: "assignment_completed", assignmentId: s.id, title: "Assignment completed", description: s.title });
  });
  const plan = LearningPlan.publicPlan(rec.controls.learningPlan);
  (plan.items || []).filter((i) => i.status === "active" && i.type === "enrichment").slice(0, 2).forEach((i) => push({ id: "enrichment:" + i.skillId, type: "above_grade_readiness", severity: "info", skillId: i.skillId, title: "Ready for a challenge", description: i.reasonText || "Evidence supports advanced practice." }));
  const achievements = Achievements.publicSummary(rec.controls.achievements, null, rec.controls);
  (achievements.achievements || []).filter((a) => a.earned && a.earnedAt && msToDate(a.earnedAt) >= range.dateFrom && msToDate(a.earnedAt) <= range.dateTo).slice(0, 5).forEach((a) => milestones.push({ id: "achievement:" + a.id, type: "achievement", title: a.title, description: a.shortDescription || a.description || "" }));
  return { alerts: reportAlertState(rec.controls, alerts, now), milestones };
}

function reportTrend(attempts) {
  if (attempts.length < 10) return { label: "Not enough data", direction: "steady" };
  const asc = attempts.slice().sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
  const mid = Math.floor(asc.length / 2);
  const first = asc.slice(0, mid), second = asc.slice(mid);
  const p1 = pct(first.filter((a) => a.correct).length, first.length) || 0;
  const p2 = pct(second.filter((a) => a.correct).length, second.length) || 0;
  if (p2 - p1 >= 10) return { label: "Improving", direction: "up", firstAccuracy: p1, secondAccuracy: p2 };
  if (p1 - p2 >= 10) return { label: "Needs more practice", direction: "down", firstAccuracy: p1, secondAccuracy: p2 };
  return { label: "Steady", direction: "steady", firstAccuracy: p1, secondAccuracy: p2 };
}

function csvCell(v) {
  let s = String(v == null ? "" : v);
  if (/^[=+\-@*]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function reportCsv(report, type) {
  const rows = [];
  if (type === "skills") {
    rows.push(["skillId","skill","grade","group","attempts","correct","accuracy","help","helpRate","currentMastery","certified","needsReview"].join(","));
    report.skills.forEach((s) => rows.push([s.skillId,s.label,s.grade,s.group,s.attempts,s.correct,s.accuracy,s.help,s.helpRate,s.currentMastery,s.certified,s.needsReview].map(csvCell).join(",")));
  } else {
    rows.push(["timestamp","localDate","source","mode","skillId","skill","grade","group","correct","helpUsed","helpType","assignmentId","occurrenceDate"].join(","));
    report.attempts.forEach((a) => rows.push([new Date(Number(a.at || 0)).toISOString(),a.localDate,a.source,a.mode,a.skillId,a.skillLabel,a.skillGrade,a.skillGroup,a.correct,a.helpUsed,a.helpType,a.assignmentId,a.occurrenceDate].map(csvCell).join(",")));
  }
  return rows.join("\r\n");
}

function buildProgressReport(rec, activity, body) {
  const range = reportRange(body);
  if (range.error) return range;
  rec.controls = rec.controls || defaultControls("4");
  Daily.ensureControls(rec.controls);
  Mastery.ensureControls(rec.controls);
  Achievements.ensureControls(rec.controls);
  const filters = { skillId: body.skillId, source: body.source || body.mode, correct: body.correct, helpUsed: body.helpUsed, assignmentId: body.assignmentId };
  const filtered = hasReportFilters(filters);
  const allAttempts = attemptsInRange(activity, range, filters);
  const limit = Math.max(1, Math.min(100, Math.floor(Number(body.limit || 50))));
  const offset = Math.max(0, Math.floor(Number(body.offset || 0)));
  const pageAttempts = allAttempts.slice(offset, offset + limit).map((a) => Object.assign({}, a, {
    skillLabel: skillLabelForReport(a.skillId),
    correctChoiceId: undefined,
  }));
  const correct = allAttempts.filter((a) => a.correct).length;
  const help = allAttempts.filter((a) => a.helpUsed).length;
  const daily = summarizeDaily(activity, range, allAttempts, !filtered);
  const skills = skillSummariesForReport(rec, allAttempts);
  const activeSeconds = daily.reduce((n, d) => n + Number(d.activeSeconds || 0), 0);
  const activityDays = daily.filter((d) => d.attempts > 0 || d.activeSeconds > 0).length;
  const rangeAttempts = daily.reduce((n, d) => n + Number(d.attempts || 0), 0);
  const rangeCorrect = daily.reduce((n, d) => n + Number(d.correct || 0), 0);
  const rangeHelp = daily.reduce((n, d) => n + Number(d.help || 0), 0);
  const rangeSkills = new Set();
  daily.forEach((d) => (d.skills || []).forEach((s) => { if (s && s.skillId) rangeSkills.add(s.skillId); }));
  const goals = rec.controls.dailyActivity || {};
  const assignments = assignmentReportSummaries(rec.controls, range.dateTo);
  const mastery = Mastery.summary(rec.data || null, rec.controls);
  const achievements = Achievements.publicSummary(rec.controls.achievements, null, rec.controls);
  const learningPlan = LearningPlan.publicPlan(rec.controls.learningPlan);
  const cutoffDate = Daily.todayLocal(new Date(activityCutoffMs()));
  const report = {
    version: 1,
    generatedAt: Date.now(),
    range,
    child: { username: rec.displayName, homeGrade: rec.controls.homeGrade || "4", allowAboveGrade: rec.controls.allowAboveGrade !== false },
    summary: {
      attempts: rangeAttempts,
      correct: rangeCorrect,
      incorrect: rangeAttempts - rangeCorrect,
      accuracy: pct(rangeCorrect, rangeAttempts),
      help: rangeHelp,
      helpRate: pct(rangeHelp, rangeAttempts),
      activeDays: activityDays,
      activeSeconds,
      activeMinutes: Math.round(activeSeconds / 60),
      distinctSkills: rangeSkills.size,
      assignmentsCompleted: assignmentCompletionsInRange(rec, range),
      masteryAttempts: filtered ? allAttempts.filter((a) => a.source === "mastery_challenge" || a.source === "mastery_review").length : daily.reduce((n, d) => n + Number((activity.daily && activity.daily[d.date] && activity.daily[d.date].masteryEvents) || 0), 0) || allAttempts.filter((a) => a.source === "mastery_challenge" || a.source === "mastery_review").length,
      dailyGoalsCompleted: dailyGoalsCompletedInRange(rec.controls, range),
    },
    currentStatus: currentReportStatus(rec, assignments, mastery, learningPlan, goals),
    daily,
    skills,
    attempts: pageAttempts,
    attemptPage: { total: allAttempts.length, limit, offset, hasMore: offset + limit < allAttempts.length },
    recentActivity: attemptsInRange(activity, { dateFrom: Daily.addDays(Daily.todayLocal(new Date()), -90), dateTo: Daily.todayLocal(new Date()) }, {}).slice(0, 20).map((a) => Object.assign({}, a, { skillLabel: skillLabelForReport(a.skillId) })),
    assignments,
    mastery: { blackBelts: Object.keys(mastery.bySkill || {}).filter((id) => mastery.bySkill[id] && mastery.bySkill[id].certified).map((id) => Object.assign({ skillId: id, label: skillLabelForReport(id) }, mastery.bySkill[id])), eligibleChallenges: mastery.eligibleChallenges || [], dueReviews: mastery.dueReviews || [] },
    learningPlan,
    achievements,
    recommendations: Recommendations.primaryAndAlternates(rec.data || null, rec.controls, { localDate: range.dateTo }),
    trend: reportTrend(allAttempts),
    notes: {
      detailedHistoryAvailableDays: ACTIVITY_RETENTION_DAYS,
      legacyDetailNote: "Detailed attempt rows are available for retained Phase 5A activity only; older dates use permanent summaries when available.",
      filteredHistoricalDetailUnavailable: filtered && Daily.cmpDate(range.dateFrom, cutoffDate) < 0,
    },
  };
  const a = reportAlerts(rec, report, range, Date.now());
  report.alerts = a.alerts;
  report.milestones = a.milestones;
  if (body.exportType === "csv_attempts") {
    report.csv = reportCsv(Object.assign({}, report, {
      attempts: allAttempts.map((a) => Object.assign({}, a, { skillLabel: skillLabelForReport(a.skillId), correctChoiceId: undefined })),
    }), "attempts");
  }
  if (body.exportType === "csv_skills") report.csv = reportCsv(report, "skills");
  return report;
}

function practiceState(rec) {
  rec.controls = rec.controls || defaultControls("4");
  rec.controls.practice = rec.controls.practice && typeof rec.controls.practice === "object" ? rec.controls.practice : { version: 1, pendingQuestion: null };
  rec.controls.practice.version = 1;
  return rec.controls.practice;
}

function choiceId(questionId, index) {
  return questionId + ":c" + index;
}

function cleanQuestionIdPart(s) {
  return String(s || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 80);
}

function skillMasteryScore(rec, skillId) {
  return Number(rec && rec.data && rec.data.progress && rec.data.progress.mastery && rec.data.progress.mastery[skillId] || 0);
}

function activePlanSkill(controls, skillId) {
  const plan = LearningPlan.normalizePlan(controls && controls.learningPlan);
  return (plan.items || []).some((i) => i && i.status === "active" && i.skillId === skillId);
}

function authorizePracticeSkill(rec, skillId, mode) {
  const skill = Curriculum.BY_ID[skillId];
  if (!skill) return { error: "unknown_skill" };
  rec.controls = rec.controls || defaultControls("4");
  const mastery = rec.data && rec.data.progress && rec.data.progress.mastery || {};
  const state = Curriculum.skillState(skillId, mastery, rec.controls.skillOverrides || {}, {
    homeGrade: rec.controls.homeGrade || "4",
    allowAboveGrade: rec.controls.allowAboveGrade !== false,
    skillMastery: rec.controls.skillMastery || {},
  });
  if (state.state === "unlocked" || activePlanSkill(rec.controls, skillId)) return { skill };
  const homeGrade = rec.controls.homeGrade || "4";
  if (Curriculum.GRADE_INDEX[skill.grade] <= Curriculum.GRADE_INDEX[homeGrade]) return { skill };
  if (mode === "workbook" && String(skill.grade) === "4") return { skill };
  return { error: "skill_locked", reason: state.reason || "locked" };
}

function choosePracticeSkill(rec, body) {
  const requested = String(body.skillId || body.requestedSkillId || "");
  if (requested) return requested;
  const recs = Recommendations.primaryAndAlternates(rec.data || null, rec.controls || defaultControls("4"));
  const all = [recs.primary].concat(recs.alternates || []).filter(Boolean);
  const system = all.find((r) => r.skillId && Curriculum.BY_ID[r.skillId]);
  if (system) return system.skillId;
  const mastery = rec.data && rec.data.progress && rec.data.progress.mastery || {};
  const unlocked = Curriculum.unlockedSkills(mastery, rec.controls && rec.controls.skillOverrides || {}, {
    homeGrade: rec.controls && rec.controls.homeGrade || "4",
    allowAboveGrade: !(rec.controls && rec.controls.allowAboveGrade === false),
    skillMastery: rec.controls && rec.controls.skillMastery || {},
  });
  return (unlocked[0] && unlocked[0].id) || "4.multiMultiply";
}

function issuePracticeQuestion(rec, body) {
  const state = practiceState(rec);
  if (state.pendingQuestion && !state.pendingQuestion.answered) return { question: publicPracticeQuestion(state.pendingQuestion), resumed: true };
  const mode = ["practice", "arena", "workbook", "learning_plan"].includes(String(body.mode || "")) ? String(body.mode || "") : "practice";
  const skillId = choosePracticeSkill(rec, body);
  const auth = authorizePracticeSkill(rec, skillId, mode);
  if (auth.error) return auth;
  const now = Date.now();
  const seed = canon(rec.displayName || body.name || "student") + ":" + mode + ":" + skillId + ":" + now;
  const generated = generatePlacementQuestion(skillId, seed);
  if (!generated || !Array.isArray(generated.choices)) return { error: "question_unavailable" };
  const okIndex = generated.choices.findIndex((c) => c && c.ok);
  if (okIndex < 0) return { error: "question_unavailable" };
  const skill = auth.skill;
  const questionId = "prac-" + cleanQuestionIdPart(skillId) + "-" + now.toString(36);
  state.pendingQuestion = {
    id: questionId,
    mode,
    skillId,
    skillLabel: skill.label,
    skillGrade: skill.grade,
    qHTML: generated.qHTML,
    tip: generated.tip || "",
    choices: generated.choices.map((c, i) => ({ id: choiceId(questionId, i), h: c.h })),
    correctChoiceId: choiceId(questionId, okIndex),
    issuedAt: now,
    answered: false,
    helpUsed: false,
    helpType: null,
  };
  return { question: publicPracticeQuestion(state.pendingQuestion), resumed: false };
}

function markPracticeHelp(rec, helpType) {
  const state = practiceState(rec);
  const q = state.pendingQuestion;
  if (!q || q.answered) return { error: "question_required" };
  q.helpUsed = true;
  q.helpType = String(helpType || "hint").slice(0, 30);
  return { question: publicPracticeQuestion(q) };
}

function recordOrdinaryPractice(rec, skillId, correct, options) {
  options = options || {};
  rec.data = rec.data || {};
  rec.data.progress = rec.data.progress || {};
  rec.data.progress.topics = rec.data.progress.topics || {};
  rec.data.progress.mastery = rec.data.progress.mastery || {};
  const topic = rec.data.progress.topics[skillId] = rec.data.progress.topics[skillId] || { solved: 0, first: 0, wrongs: 0, tutors: 0 };
  if (correct) {
    topic.solved = Number(topic.solved || 0) + 1;
    if (!options.helpUsed) topic.first = Number(topic.first || 0) + 1;
    const delta = options.helpUsed ? 2 : 4;
    rec.data.progress.mastery[skillId] = Math.max(0, Math.min(100, Math.round((Number(rec.data.progress.mastery[skillId] || 0) + delta) * 10) / 10));
    rec.data.stats = rec.data.stats || {};
    rec.data.stats.totalCorrect = Number(rec.data.stats.totalCorrect || 0) + 1;
  } else {
    topic.wrongs = Number(topic.wrongs || 0) + 1;
    rec.data.progress.mastery[skillId] = Math.max(0, Math.min(100, Math.round((Number(rec.data.progress.mastery[skillId] || 0) - 1) * 10) / 10));
  }
  if (options.helpUsed) topic.tutors = Number(topic.tutors || 0) + 1;
}

function awardPracticeAnswerCoins(rec, correct, localDate, questionId) {
  if (!correct) return { awarded: 0, dailyBonus: 0, coins: Number(rec.data && rec.data.coins || 0) };
  rec.controls = rec.controls || defaultControls("4");
  rec.data = rec.data || {};
  const currency = normalizeCurrency(rec.controls);
  const base = 3;
  const date = localDate || Daily.todayLocal(new Date());
  let total = 0;
  const earnedToday = Math.max(0, Math.floor(Number(currency.dailyEarned[date] || 0)));
  if (earnedToday + base <= MAX_DAILY_EARNED_COINS) {
    rec.data.coins = Math.max(0, Math.floor(Number(rec.data.coins || 0))) + base;
    currency.dailyEarned[date] = earnedToday + base;
    addCurrencyLedger(currency, { type: "earn", reason: "practice_correct", amount: base, balanceAfter: rec.data.coins, eventKey: questionId });
    total += base;
  }
  const dailyKey = "daily_bonus:" + date;
  let dailyBonus = 0;
  const afterBase = Math.max(0, Math.floor(Number(currency.dailyEarned[date] || 0)));
  if (!currency.rewardedMilestones[dailyKey] && afterBase + 10 <= MAX_DAILY_EARNED_COINS) {
    dailyBonus = 10;
    rec.data.coins += dailyBonus;
    currency.dailyEarned[date] = afterBase + dailyBonus;
    currency.rewardedMilestones[dailyKey] = { at: Date.now(), coins: dailyBonus };
    addCurrencyLedger(currency, { type: "earn", reason: "daily_bonus", amount: dailyBonus, balanceAfter: rec.data.coins, eventKey: dailyKey });
    total += dailyBonus;
  }
  markPracticeEvidenceRewarded(rec);
  return { awarded: total, practiceCoins: total - dailyBonus, dailyBonus, coins: rec.data.coins };
}

function answerPracticeQuestion(rec, body, localDate) {
  const state = practiceState(rec);
  const q = state.pendingQuestion;
  if (!q) {
    if (body.questionId && state.lastAnsweredQuestionId === String(body.questionId || "")) return { error: "question_already_answered" };
    return { error: "question_required" };
  }
  if (q.answered) return { error: "question_already_answered" };
  if (q.id !== String(body.questionId || "")) return { error: "stale_question" };
  const choice = (q.choices || []).find((c) => c.id === String(body.choiceId || ""));
  if (!choice) return { error: "invalid_choice" };
  if (body.correct != null || body.skillId || body.coins || body.masteryDelta) return { error: "client_scoring_not_allowed" };
  const correct = choice.id === q.correctChoiceId;
  q.answered = true;
  q.answeredAt = Date.now();
  recordOrdinaryPractice(rec, q.skillId, correct, { helpUsed: !!q.helpUsed });
  Daily.addProblem(rec.controls, localDate, "practice:" + q.id, "practice");
  const coins = awardPracticeAnswerCoins(rec, correct, localDate, q.id);
  const attempt = {
    attemptId: "practice:" + q.id,
    at: q.answeredAt,
    localDate,
    source: "practice",
    mode: q.mode || "practice",
    skillId: q.skillId,
    questionId: q.id,
    choiceId: choice.id,
    correct,
    helpUsed: !!q.helpUsed,
    helpType: q.helpType || null,
    responseMs: Number(body.responseMs || 0),
  };
  state.lastAnsweredQuestionId = q.id;
  state.pendingQuestion = null;
  return { correct, skillId: q.skillId, coins, attempt };
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
  if (reason === "practice_correct" || reason === "practice_hint" || reason === "practice_retry" || reason === "practice_variant") {
    return { error: "practice_coin_earn_deprecated" };
  }
  if (reason === "daily_bonus") {
    return { error: "daily_bonus_automatic" };
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
  const incomingProgress = next.progress && typeof next.progress === "object" ? next.progress : {};
  const previousProgress = previous.progress && typeof previous.progress === "object" ? previous.progress : {};
  next.progress = {
    topics: previousProgress.topics || {},
    mastery: previousProgress.mastery || {},
    solved: incomingProgress.solved && typeof incomingProgress.solved === "object" ? incomingProgress.solved : (previousProgress.solved || {}),
    story: incomingProgress.story && typeof incomingProgress.story === "object" ? incomingProgress.story : (previousProgress.story || {}),
    sessions: Array.isArray(incomingProgress.sessions) ? incomingProgress.sessions.slice(-60) : (Array.isArray(previousProgress.sessions) ? previousProgress.sessions.slice(-60) : []),
    arenaRun: incomingProgress.arenaRun || null,
    needHelp: Array.isArray(incomingProgress.needHelp) ? incomingProgress.needHelp.slice(-60) : (Array.isArray(previousProgress.needHelp) ? previousProgress.needHelp.slice(-60) : []),
    seedsApplied: incomingProgress.seedsApplied && typeof incomingProgress.seedsApplied === "object" ? incomingProgress.seedsApplied : (previousProgress.seedsApplied || {}),
  };
  const prevStats = previous.stats && typeof previous.stats === "object" ? previous.stats : {};
  const nextStats = next.stats && typeof next.stats === "object" ? next.stats : {};
  next.stats = {
    played: Math.max(0, Math.floor(Number(nextStats.played || prevStats.played || 0))),
    bestScore: Math.max(0, Math.floor(Number(nextStats.bestScore || prevStats.bestScore || 0))),
    totalCorrect: Math.max(0, Math.floor(Number(prevStats.totalCorrect || 0))),
  };
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
      action === "practice_status" || action === "practice_start" || action === "practice_hint" || action === "practice_answer" || action === "activity_history" ||
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

    if (action === "practice_status") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const payload = dailyPayload(rec, effective.date, { acknowledgeAchievements: true });
      if (payload.error) return json({ ok: false, error: payload.error }, 400);
      await putRecord(store, name, rec);
      return json({ ok: true, question: publicPracticeQuestion(practiceState(rec).pendingQuestion), dailyStatus: payload.dailyStatus, recommendations: payload.recommendations, learningPlan: payload.learningPlan, achievements: payload.achievements, cosmetics: payload.cosmetics, controls: publicControls(rec.controls), data: rec.data || null });
    }

    if (action === "practice_start") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const issued = issuePracticeQuestion(rec, body);
      if (issued.error) return json({ ok: false, error: issued.error, reason: issued.reason }, issued.error === "skill_locked" ? 403 : 400);
      await putRecord(store, name, rec);
      return json({ ok: true, question: issued.question, resumed: !!issued.resumed, controls: publicControls(rec.controls) });
    }

    if (action === "practice_hint") {
      const result = markPracticeHelp(rec, body.helpType || "hint");
      if (result.error) return json({ ok: false, error: result.error }, 400);
      await putRecord(store, name, rec);
      return json({ ok: true, question: result.question });
    }

    if (action === "practice_answer") {
      const effective = effectiveClientDate(body.localDate);
      if (effective.error) return json({ ok: false, error: effective.error }, 400);
      const result = answerPracticeQuestion(rec, body, effective.date);
      if (result.error) {
        const status = result.error === "stale_question" || result.error === "question_already_answered" ? 409 : 400;
        await putRecord(store, name, rec);
        return json({ ok: false, error: result.error }, status);
      }
      let activity = await getActivity(store, name);
      activity = recordActivityAttempt(activity, result.attempt);
      await putActivity(store, name, activity);
      const learningPlan = refreshLearningPlan(rec);
      const achievements = achievementPayload(rec, { acknowledgeAchievements: true });
      const cosmetics = cosmeticPayload(rec, { acknowledgeCosmetics: true });
      const dailyStatus = Daily.evaluateToday(rec.controls, effective.date);
      const recommendations = Recommendations.primaryAndAlternates(rec.data || null, rec.controls, { localDate: effective.date });
      await putRecord(store, name, rec);
      return json({ ok: true, correct: result.correct, skillId: result.skillId, coins: result.coins, data: rec.data || null, dailyStatus, recommendations, learningPlan, achievements, cosmetics, masterySummary: Mastery.summary(rec.data || null, rec.controls), controls: publicControls(rec.controls) });
    }

    if (action === "activity_history") {
      const fromOk = !body.dateFrom || Daily.validDate(body.dateFrom);
      const toOk = !body.dateTo || Daily.validDate(body.dateTo);
      if (!fromOk || !toOk) return json({ ok: false, error: "invalid_date" }, 400);
      const activity = await getActivity(store, name, body);
      await putActivity(store, name, activity);
      return json({ ok: true, activity: filterActivity(activity, body) });
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
      let activity = await getActivity(store, name);
      activity = recordActivityAttempt(activity, {
        attemptId: "assignment:" + found.assignment.id + ":" + body.questionId,
        at: Date.now(),
        localDate: effective.date,
        source: "assignment",
        mode: "assignment",
        skillId: result.skillId,
        questionId: String(body.questionId || ""),
        choiceId: String(body.choiceId || ""),
        correct: !!result.correct,
        assignmentId: found.assignment.id,
        occurrenceDate: result.occurrenceDate,
      });
      await putActivity(store, name, activity);
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
      const pendingForHistory = rec.controls.placement && rec.controls.placement.pendingQuestion ? JSON.parse(JSON.stringify(rec.controls.placement.pendingQuestion)) : null;
      const result = Placement.answerPendingQuestion(rec.controls.placement, questionId, choiceId);
      if (result.error) {
        const status = result.error === "stale_question" || result.error === "question_already_answered" ? 409 : 400;
        return json({ ok: false, error: result.error }, status);
      }
      rec.controls.placement = result.placement;
      if (pendingForHistory) {
        let activity = await getActivity(store, name);
        activity = recordActivityAttempt(activity, {
          attemptId: "placement:" + pendingForHistory.id,
          at: Date.now(),
          localDate: Daily.todayLocal(new Date()),
          source: "placement",
          mode: "placement",
          skillId: pendingForHistory.skillId,
          questionId,
          choiceId,
          correct: !!result.correct,
        });
        await putActivity(store, name, activity);
      }
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
      const pendingForHistory = rec.controls.skillMastery && rec.controls.skillMastery.pendingChallenge && rec.controls.skillMastery.pendingChallenge.pendingQuestion ? JSON.parse(JSON.stringify(rec.controls.skillMastery.pendingChallenge.pendingQuestion)) : null;
      const result = Mastery.answerPending(rec.controls.skillMastery.pendingChallenge, questionId, choiceId);
      if (result.error) {
        const status = result.error === "stale_question" || result.error === "question_already_answered" ? 409 : 400;
        return json({ ok: false, error: result.error }, status);
      }
      if (pendingForHistory) {
        let activity = await getActivity(store, name);
        activity = recordActivityAttempt(activity, {
          attemptId: "mastery_challenge:" + pendingForHistory.id,
          at: Date.now(),
          localDate: Daily.todayLocal(new Date()),
          source: "mastery_challenge",
          mode: "mastery_challenge",
          skillId: pendingForHistory.skillId,
          questionId,
          choiceId,
          correct: !!result.correct,
        });
        await putActivity(store, name, activity);
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
      const pendingForHistory = rec.controls.skillMastery && rec.controls.skillMastery.pendingReview && rec.controls.skillMastery.pendingReview.pendingQuestion ? JSON.parse(JSON.stringify(rec.controls.skillMastery.pendingReview.pendingQuestion)) : null;
      const result = Mastery.answerPending(rec.controls.skillMastery.pendingReview, questionId, choiceId);
      if (result.error) {
        const status = result.error === "stale_question" || result.error === "question_already_answered" ? 409 : 400;
        return json({ ok: false, error: result.error }, status);
      }
      if (pendingForHistory) {
        let activity = await getActivity(store, name);
        activity = recordActivityAttempt(activity, {
          attemptId: "mastery_review:" + pendingForHistory.id,
          at: Date.now(),
          localDate: Daily.todayLocal(new Date()),
          source: "mastery_review",
          mode: "mastery_review",
          skillId: pendingForHistory.skillId,
          questionId,
          choiceId,
          correct: !!result.correct,
        });
        await putActivity(store, name, activity);
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
  if (["create_child", "link_child", "unlink_child", "reset_child_pin", "rename_child", "list_children", "parent_report", "parent_activity_history", "parent_progress_report", "update_child_controls", "apply_placement_recommendations", "undo_placement_recommendations", "reset_placement", "parent_update_daily_goals", "parent_update_vacations", "parent_grant_grace", "parent_list_assignments", "parent_create_assignment", "parent_update_assignment", "parent_archive_assignment"].includes(action)) {
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
      await moveActivityKeys(store, childName, newName);
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

    if (action === "parent_activity_history") {
      if ((body.dateFrom && !Daily.validDate(body.dateFrom)) || (body.dateTo && !Daily.validDate(body.dateTo))) return json({ ok: false, error: "invalid_date" }, 400);
      const activity = await getActivity(store, childName, body);
      await putActivity(store, childName, activity);
      return json({ ok: true, child: childSummary(childName, childRec), activity: filterActivity(activity, body) });
    }

    if (action === "parent_progress_report") {
      const range = reportRange(body);
      if (range.error) return json({ ok: false, error: range.error }, 400);
      childRec.controls = childRec.controls || defaultControls("4");
      childRec.data = childRec.data || {};
      const activity = await getActivity(store, childName, range);
      const report = buildProgressReport(childRec, activity, Object.assign({}, body, range));
      if (report.error) return json({ ok: false, error: report.error }, 400);
      await putActivity(store, childName, activity);
      await putRecord(store, childName, childRec);
      return json({ ok: true, child: childSummary(childName, childRec), report });
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
