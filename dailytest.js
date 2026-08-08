const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const D = require("./js/daily.js");
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
let eventSeq = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }

function completeProblems(controls, date, n){
  let r;
  for(let i=0;i<n;i++) r = D.addProblem(controls, date, "p-" + date + "-" + (eventSeq++), "practice", 1000 + i);
  return r;
}

(async()=>{
  const defaults = D.defaultDailyGoals();
  ck(defaults.mon.enabled && defaults.fri.enabled && !defaults.sun.enabled && !defaults.sat.enabled, "default schedule is Monday-Friday");
  ck(defaults.mon.type === "problems" && defaults.mon.target === 12, "default target is 12 problems");

  let controls = api.defaultControls("4");
  let r = completeProblems(controls, "2026-08-03", 7);
  ck(r.status.progress.problemsCompleted === 7 && !r.status.progress.completed, "problem goal tracks partial progress");
  r = completeProblems(controls, "2026-08-03", 5);
  ck(r.status.progress.completed && r.status.streak.currentStreak === 1, "scheduled day completion increments streak");
  const dup = D.addProblem(controls, "2026-08-03", "p-2026-08-03-0", "practice");
  ck(dup.duplicate && dup.status.progress.problemsCompleted === 12, "duplicate problem event is not counted twice");

  controls = api.defaultControls("4");
  controls.dailyGoals.tue.enabled = false;
  completeProblems(controls, "2026-08-03", 12);
  r = D.evaluateToday(controls, "2026-08-05");
  ck(r.streak.currentStreak === 1, "unscheduled weekday does not break streak");

  controls = api.defaultControls("4");
  completeProblems(controls, "2026-08-03", 12);
  r = D.evaluateToday(controls, "2026-08-05");
  ck(r.streak.currentStreak === 0, "missed scheduled day resets streak with no grace");

  controls = api.defaultControls("4");
  completeProblems(controls, "2026-08-03", 12);
  D.grantGrace(controls, 1, "parent", 2000);
  r = D.evaluateToday(controls, "2026-08-05");
  ck(r.streak.currentStreak === 1 && r.streak.graceBalance === 0 && controls.dailyActivity.protectedDates["2026-08-04"], "missed scheduled day consumes one grace and preserves streak");
  r = D.evaluateToday(controls, "2026-08-06");
  ck(r.streak.totalGraceUsed === 1, "grace is not consumed twice for the same missed date");

  controls = api.defaultControls("4");
  completeProblems(controls, "2026-08-03", 12);
  D.grantGrace(controls, 1, "parent");
  D.evaluateToday(controls, "2026-08-07");
  ck(controls.dailyActivity.totalGraceUsed === 1 && controls.dailyActivity.currentStreak === 0, "grace runs out across multiple missed days");

  controls = api.defaultControls("4");
  controls.vacationRanges = [{start:"2026-08-04", end:"2026-08-05"}];
  completeProblems(controls, "2026-08-03", 12);
  r = D.evaluateToday(controls, "2026-08-06");
  ck(r.streak.currentStreak === 1 && r.streak.totalGraceUsed === 0, "vacation protects streak without consuming grace");
  ck(r.streak.currentStreak === 1, "vacation preserves but does not increment streak");

  controls = api.defaultControls("4");
  ["2026-08-03","2026-08-04","2026-08-05","2026-08-06","2026-08-07"].forEach(date=>completeProblems(controls, date, 12));
  r = D.evaluateToday(controls, "2026-08-08");
  ck(r.streak.currentStreak === 5 && r.streak.longestStreak === 5 && r.streak.graceBalance === 1, "five completed scheduled days earn one grace day");

  controls = api.defaultControls("4");
  controls.dailyGoals.mon = {enabled:true,type:"minutes",target:1};
  r = D.addActiveTime(controls, "2026-08-03", "t1", 30, "practice");
  ck(!r.status.progress.completed, "small active heartbeat accepted before time goal completion");
  r = D.addActiveTime(controls, "2026-08-03", "t2", 30, "mastery_review");
  ck(r.status.progress.completed && r.status.progress.value === 1, "accumulated active minutes complete a time goal");
  ck(D.addActiveTime(controls, "2026-08-03", "t3", 61, "practice").error === "seconds_too_large", "oversized heartbeat rejected");
  ck(D.addProblem(controls, "2026-08-03", "placement-1", "placement").error === "placement_does_not_count", "placement does not count toward daily goals");

  let res = await call({ action:"register_student", name:"DailyKid", pin:"1234", grade:"4" });
  ck(res.status === 200, "daily API student created");
  res = await call({ action:"daily_status", name:"DailyKid", pin:"1234", localDate:"2099-01-01" });
  ck(res.status === 400 && res.body.error === "invalid_date", "invalid far-future local date rejected");
  res = await call({ action:"daily_problem_complete", name:"DailyKid", pin:"1234", localDate:"2026-08-03", eventId:"api-p1", source:"placement" });
  ck(res.status === 400 && res.body.error === "placement_does_not_count", "API placement source rejected");
  res = await call({ action:"daily_problem_complete", name:"DailyKid", pin:"1234", localDate:"2026-08-03", eventId:"api-p1", source:"practice" });
  ck(res.status === 200 && res.body.dailyStatus.progress.problemsCompleted === 1, "API practice problem counts");
  res = await call({ action:"daily_problem_complete", name:"DailyKid", pin:"1234", localDate:"2026-08-03", eventId:"api-p1", source:"practice" });
  ck(res.status === 200 && res.body.duplicate && res.body.dailyStatus.progress.problemsCompleted === 1, "API duplicate problem event deduped");
  res = await call({ action:"daily_active_time", name:"DailyKid", pin:"1234", localDate:"2026-08-03", eventId:"api-t1", seconds:90, source:"practice" });
  ck(res.status === 413 && res.body.error === "seconds_too_large", "API oversized time heartbeat rejected");
  res = await call({ action:"daily_active_time", name:"DailyKid", pin:"1234", localDate:"2026-08-03", eventId:"api-t2", seconds:30, source:"mastery_challenge" });
  ck(res.status === 200 && res.body.dailyStatus.progress.activeSeconds === 30, "API challenge time heartbeat counts");
  res = await call({ action:"parent_grant_grace", name:"DailyKid", pin:"1234", childName:"DailyKid", quantity:1 });
  ck(res.status === 403 && res.body.error === "wrong_account_type", "child cannot self-grant grace days");

  await call({ action:"register_parent", name:"DailyParent", pin:"2222" });
  res = await call({ action:"link_child", parentName:"DailyParent", parentPin:"2222", childName:"DailyKid", childPin:"1234" });
  ck(res.status === 200, "daily API child linked to parent");
  const goals = D.defaultDailyGoals();
  goals.sat.enabled = true;
  goals.sat.type = "minutes";
  goals.sat.target = 10;
  res = await call({ action:"parent_update_daily_goals", parentName:"DailyParent", parentPin:"2222", childName:"DailyKid", localDate:"2026-08-08", dailyGoals:goals });
  ck(res.status === 200 && res.body.controls.dailyGoals.sat.enabled && res.body.dailyStatus.goal.type === "minutes", "parent can customize weekday goals");
  res = await call({ action:"parent_update_vacations", parentName:"DailyParent", parentPin:"2222", childName:"DailyKid", localDate:"2026-08-08", vacationRanges:[{start:"2026-08-08",end:"2026-08-10"}] });
  ck(res.status === 200 && res.body.dailyStatus.vacation, "parent vacation pause applies to daily status");
  res = await call({ action:"parent_grant_grace", parentName:"DailyParent", parentPin:"2222", childName:"DailyKid", quantity:3 });
  ck(res.status === 200 && res.body.quantity === 3 && res.body.controls.dailyActivity.graceBalance >= 3, "parent grant grace works");

  const legacy = { homeGrade:"4", allowAboveGrade:true, skillOverrides:{} };
  D.ensureControls(legacy);
  ck(legacy.dailyActivity && legacy.dailyGoals.mon.enabled, "legacy controls normalize safely");

  console.log(fails ? fails + " DAILY TEST FAILURES" : "ALL DAILY TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
