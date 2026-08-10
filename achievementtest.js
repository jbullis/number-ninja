const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const Ach = require("./js/achievements.js");
const api = require("./lib/number-ninja-api.js");

let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
function topic(solved, wrongs){ return { solved, first:solved, wrongs:wrongs || 0, tutors:0 }; }
function dataWith(topics){ return { stats:{ totalCorrect:Object.values(topics || {}).reduce((n,t)=>n+Number(t.solved||0),0) }, progress:{ topics:topics || {}, mastery:{}, sessions:[] } }; }
function ids(summary){ return Object.keys((summary && summary.earned) || {}); }

const catalogIds = Ach.CATALOG.map(a => a.id);
ck(new Set(catalogIds).size === catalogIds.length, "catalog IDs unique");
ck(Ach.CATALOG.length >= 20 && Ach.CATALOG.length <= 30, "starter catalog has 20-30 achievements", Ach.CATALOG.length);
ck(Ach.CATALOG.some(a=>a.hidden), "catalog includes hidden achievements");

let controls = api.defaultControls("4");
let state = Ach.evaluate(dataWith({}), controls, {now:1000});
let pub = Ach.publicSummary(state, null, controls);
const hidden = pub.achievements.find(a => a.hidden && !a.earned);
ck(hidden && hidden.title === "???" && !hidden.progress, "hidden metadata sanitized before earning");
ck(pub.achievements.some(a => a.id === "practice.25" && a.progress && a.progress.value === 0), "visible progress returned");

state = Ach.evaluate(dataWith({"4.multiMultiply":topic(1,0)}), controls, {now:2000});
ck(ids(state).includes("practice.first_problem"), "first problem unlocks");
const historyLen = state.history.length;
state = Ach.evaluate(dataWith({"4.multiMultiply":topic(1,0)}), controls, {now:3000});
ck(state.history.length === historyLen, "non-repeatable achievement not awarded twice");

controls = api.defaultControls("4");
state = Ach.evaluate(dataWith({"4.multiMultiply":topic(100,0)}), controls, {now:4000});
ck(ids(state).includes("practice.100") && ids(state).includes("accuracy.strong_20"), "retroactive durable practice milestone works");

controls = api.defaultControls("4");
controls.skillMastery.bySkill["4.multiMultiply"] = {certified:true, certifiedAt:1000};
state = Ach.evaluate(dataWith({}), controls, {now:5000});
ck(ids(state).includes("mastery.first_black_belt"), "certification drives first Black Belt award");
controls.skillMastery.bySkill["4.multiMultiply"].needsReview = true;
state = Ach.evaluate(dataWith({}), controls, {now:6000});
ck(ids(state).includes("mastery.first_black_belt"), "Needs Review does not revoke Black Belt achievement");

controls = api.defaultControls("4");
["4.multiMultiply","4.longDivision","4.factorsMultiples","4.fractionEquiv","4.decimalIntro"].forEach(id => { controls.skillMastery.bySkill[id] = {certified:true}; });
state = Ach.evaluate(dataWith({}), controls, {now:7000});
ck(ids(state).includes("mastery.5_black_belts"), "multiple Black Belt threshold unlocks");

controls = api.defaultControls("4");
controls.dailyActivity.completedScheduledDays = 5;
controls.dailyActivity.longestStreak = 10;
controls.dailyActivity.totalGraceEarned = 1;
controls.dailyActivity.totalGraceUsed = 1;
state = Ach.evaluate(dataWith({}), controls, {now:8000});
ck(ids(state).includes("goals.first_daily_goal") && ids(state).includes("goals.5_scheduled"), "daily goal achievements use canonical completed days");
ck(ids(state).includes("streak.10") && ids(state).includes("streak.grace_protected"), "streak and grace achievements use canonical streak state");

controls = api.defaultControls("4");
controls.assignments = [{
  id:"asg1", status:"completed", schedule:"once", skillIds:["4.multiMultiply"], targetType:"problems", target:1, minimumAccuracy:100,
  occurrences:{ lastCompletedDate:"2026-08-08", recentOccurrences:[{date:"2026-08-08", completed:true, rewardCoins:5, completedAt:10}] }
}];
state = Ach.evaluate(dataWith({}), controls, {now:9000});
ck(state.counters.totalAssignmentsCompleted === 1 && ids(state).includes("assignments.first_complete"), "assignment completion increments aggregate once");
state = Ach.evaluate(dataWith({}), controls, {now:10000});
ck(state.counters.totalAssignmentsCompleted === 1, "repeated evaluation does not double count assignment completion");
ck(ids(state).includes("accuracy.clean_assignment"), "accuracy-gated assignment badge only when completed");

controls = api.defaultControls("4");
controls.learningPlan.history = [
  {at:1,type:"remediation_resolved",skillId:"4.multiMultiply",itemId:"r1"},
  {at:2,type:"enrichment_resolved",skillId:"5.operations",itemId:"e1"},
];
state = Ach.evaluate(dataWith({}), controls, {now:11000});
ck(state.counters.totalRemediationsResolved === 1 && ids(state).includes("plan.first_remediation_resolved"), "remediation resolution counts once");
ck(state.counters.totalEnrichmentsResolved === 1 && ids(state).includes("plan.first_enrichment_resolved"), "enrichment resolution counts once");
state = Ach.evaluate(dataWith({}), controls, {now:12000});
ck(state.counters.totalRemediationsResolved === 1 && state.counters.totalEnrichmentsResolved === 1, "learning-plan events are deduped");

controls = api.defaultControls("4");
controls.skillMastery.history = [{at:1,type:"challenge",skillId:"4.multiMultiply",passed:true,total:6,correct:6}];
state = Ach.evaluate(dataWith({}), controls, {now:13000});
pub = Ach.publicSummary(state, null, controls);
ck(pub.achievements.find(a=>a.id==="special.perfect_black_belt").earned, "hidden achievement revealed after earning");

controls = api.defaultControls("4");
controls.achievements = Ach.normalizeState({history:Array.from({length:150},(_,i)=>({achievementId:"practice.first_problem",earnedAt:i})), recentAwards:Array.from({length:20},(_,i)=>({achievementId:"practice.first_problem",earnedAt:i}))});
state = Ach.normalizeState(controls.achievements);
ck(state.history.length === Ach.HISTORY_MAX && state.recentAwards.length === Ach.RECENT_MAX, "history and recent awards are bounded");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }

(async()=>{
  await call({action:"register_student", name:"AchKid", pin:"1234", grade:"4"});
  const seeded = recFor("AchKid");
  seeded.data = dataWith({"4.multiMultiply":topic(25,0)});
  writeRec("AchKid", seeded);
  let r = await call({action:"save", name:"AchKid", pin:"1234", data:seeded.data});
  ck(r.status === 200 && r.body.achievements.earnedCount >= 2, "save returns server-evaluated achievements");
  r = await call({action:"achievement_status", name:"AchKid", pin:"1234", localDate:"2026-08-08"});
  ck(r.status === 200 && r.body.achievements.achievements.some(a=>a.id==="practice.25"&&a.earned), "read-only achievement_status returns badges");
  const before = Object.keys(recFor("AchKid").controls.achievements.earned).length;
  r = await call({action:"achievement_claim", name:"AchKid", pin:"1234", achievementId:"mastery.10_black_belts"});
  ck(r.status === 400 && r.body.error === "unknown_action", "student cannot manually claim achievement");
  const after = Object.keys(recFor("AchKid").controls.achievements.earned).length;
  ck(before === after, "fake claim does not mutate achievements");
  r = await call({action:"achievement_status", name:"AchKid", pin:"1234", localDate:"2026-08-08"});
  ck((r.body.achievements.recentAwards||[]).length === 0, "recent award celebration does not replay after acknowledgment");

  await call({action:"register_parent", name:"AchParent", pin:"2222"});
  await call({action:"link_child", parentName:"AchParent", parentPin:"2222", childName:"AchKid", childPin:"1234"});
  r = await call({action:"parent_report", parentName:"AchParent", parentPin:"2222", childName:"AchKid", localDate:"2026-08-08"});
  ck(r.status === 200 && r.body.achievements && r.body.achievements.earnedCount === after, "parent report includes achievement summary");

  console.log(fails ? fails + " ACHIEVEMENT TEST FAILURES" : "ALL ACHIEVEMENT TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
