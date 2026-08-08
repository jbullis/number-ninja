const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const D = require("./js/daily.js");
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
let seq = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }
function completeProblems(controls, date, n){
  let r;
  for(let i=0;i<n;i++) r = D.addProblem(controls, date, "date-p-" + (seq++), "practice");
  return r;
}

(async()=>{
  ck(!D.validDate("2026-02-30"), "February 30 is rejected");
  ck(!D.validDate("2026-02-31"), "February 31 is rejected");
  ck(!D.validDate("2026-04-31"), "April 31 is rejected");
  ck(!D.validDate("2026-13-01"), "month 13 is rejected");
  ck(!D.validDate("2026-00-10"), "month 00 is rejected");
  ck(!D.validDate("2026-2-10") && !D.validDate("not-a-date"), "malformed dates are rejected");
  ck(D.validDate("2024-02-29"), "leap day is valid in a leap year");
  ck(!D.validDate("2025-02-29"), "leap day is invalid in a non-leap year");
  ck(D.addDays("2024-02-28", 1) === "2024-02-29" && D.addDays("2024-02-29", 1) === "2024-03-01", "UTC-safe addDays still handles leap day");

  const today = D.todayLocal(new Date());
  const nearFuture = D.addDays(today, 1);
  const farFuture = D.addDays(today, 30);

  let r = await call({ action:"register_student", name:"DateKid", pin:"1234", grade:"4" });
  ck(r.status === 200, "date test student created");
  r = await call({ action:"daily_status", name:"DateKid", pin:"1234", localDate:today });
  ck(r.status === 200 && r.body.dailyStatus.date === today, "today is accepted");
  r = await call({ action:"daily_status", name:"DateKid", pin:"1234", localDate:nearFuture });
  ck(r.status === 200 && r.body.dailyStatus.date === nearFuture, "reasonable timezone offset date is accepted");
  r = await call({ action:"daily_status", name:"DateKid", pin:"1234", localDate:farFuture });
  ck(r.status === 400 && r.body.error === "invalid_date", "daily_status rejects far-future date");
  r = await call({ action:"daily_status", name:"DateKid", pin:"1234", localDate:"2026-02-30" });
  ck(r.status === 400 && r.body.error === "invalid_date", "daily_status rejects impossible calendar date");
  r = await call({ action:"login", name:"DateKid", pin:"1234", localDate:farFuture });
  ck(r.status === 400 && r.body.error === "invalid_date", "login rejects far-future localDate");
  r = await call({ action:"report", name:"DateKid", pin:"1234", localDate:farFuture });
  ck(r.status === 400 && r.body.error === "invalid_date", "report rejects far-future localDate");

  await call({ action:"register_student", name:"FutureAttackKid", pin:"1234", grade:"4" });
  let rec = recFor("FutureAttackKid");
  completeProblems(rec.controls, today, 12);
  writeRec("FutureAttackKid", rec);
  const beforeAttack = recFor("FutureAttackKid").controls.dailyActivity;
  r = await call({ action:"login", name:"FutureAttackKid", pin:"1234", localDate:farFuture });
  ck(r.status === 400, "malicious future login is rejected");
  const afterLoginAttack = recFor("FutureAttackKid").controls.dailyActivity;
  ck(afterLoginAttack.lastProcessedDate === beforeAttack.lastProcessedDate && afterLoginAttack.currentStreak === beforeAttack.currentStreak, "malicious future login cannot process future missed days");

  await call({ action:"register_student", name:"GraceAttackKid", pin:"1234", grade:"4" });
  rec = recFor("GraceAttackKid");
  D.grantGrace(rec.controls, 2, "parent");
  writeRec("GraceAttackKid", rec);
  const graceBefore = recFor("GraceAttackKid").controls.dailyActivity.graceBalance;
  r = await call({ action:"report", name:"GraceAttackKid", pin:"1234", localDate:farFuture });
  ck(r.status === 400, "malicious future report is rejected");
  ck(recFor("GraceAttackKid").controls.dailyActivity.graceBalance === graceBefore, "malicious future report cannot consume grace days");

  const rollover = api.defaultControls("4");
  const monday = "2026-08-03";
  const tuesday = "2026-08-04";
  completeProblems(rollover, monday, 12);
  r = D.evaluateToday(rollover, tuesday);
  ck(r.streak.currentStreak === 1 && r.streak.longestStreak === 1, "normal streak rollover remains unchanged");

  const vacation = api.defaultControls("4");
  vacation.vacationRanges = [{start:tuesday, end:tuesday}];
  completeProblems(vacation, monday, 12);
  r = D.evaluateToday(vacation, "2026-08-05");
  ck(r.streak.currentStreak === 1 && r.streak.totalGraceUsed === 0, "vacation behavior remains unchanged");

  const grace = api.defaultControls("4");
  completeProblems(grace, monday, 12);
  D.grantGrace(grace, 1, "parent");
  r = D.evaluateToday(grace, "2026-08-06");
  ck(r.streak.totalGraceUsed === 1 && grace.dailyActivity.protectedDates[tuesday], "grace behavior remains unchanged");

  console.log(fails ? fails + " DATE INTEGRITY TEST FAILURES" : "ALL DATE INTEGRITY TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
