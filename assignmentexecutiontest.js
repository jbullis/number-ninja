const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const A = require("./js/assignments.js");
const R = require("./js/recommendations.js");
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }
function pending(name, id){ return recFor(name).controls.assignments.find(a => a.id === id).occurrences.pendingQuestion; }
function right(name, id){ return pending(name, id).correctChoiceId; }
function wrong(name, id){ const q = pending(name, id); return q.choices.find(c => c.id !== q.correctChoiceId).id; }
async function setup(name){
  await call({action:"register_parent", name:name+"Parent", pin:"2222"});
  await call({action:"register_student", name:name+"Kid", pin:"1234", grade:"4"});
  await call({action:"link_child", parentName:name+"Parent", parentPin:"2222", childName:name+"Kid", childPin:"1234"});
  return {parent:name+"Parent", kid:name+"Kid"};
}
async function create(parent, kid, assignment, date){
  return call({action:"parent_create_assignment", parentName:parent, parentPin:"2222", childName:kid, localDate:date || "2026-08-07", assignment});
}
async function answer(kid, id, choice){
  const q = pending(kid, id);
  return call({action:"assignment_answer", name:kid, pin:"1234", assignmentId:id, questionId:q.id, choiceId:choice, localDate:"2026-08-07"});
}

(async()=>{
  const date = "2026-08-07";
  const s = await setup("Exec");
  let r = await create(s.parent, s.kid, {title:"Parent fractions", skillIds:["4.multiMultiply"], targetType:"problems", target:2, notes:"private"});
  const id = r.body.assignment.id;
  r = await call({action:"report", name:s.kid, pin:"1234", localDate:date});
  ck(r.body.assignments.length === 1 && !("notes" in r.body.assignments[0]), "active assignment appears to student and notes are hidden");
  const controls = recFor(s.kid).controls;
  controls.skillMastery.bySkill["4.longDivision"] = {certified:true, needsReview:true, reviewDueAt:1};
  writeRec(s.kid, Object.assign(recFor(s.kid), {controls}));
  r = await call({action:"report", name:s.kid, pin:"1234", localDate:date});
  ck(r.body.recommendations.primary.type === "parent_assignment", "parent assignment outranks Needs Review");
  ck(r.body.recommendations.alternates.some(x => x.type === "needs_review"), "system alternate remains available");

  r = await call({action:"assignment_start", name:s.kid, pin:"1234", assignmentId:id, localDate:date});
  ck(r.status === 200 && r.body.question && !JSON.stringify(r.body).includes("correctChoiceId"), "assignment start returns sanitized server question");
  const firstQ = r.body.question;
  r = await call({action:"assignment_start", name:s.kid, pin:"1234", assignmentId:id, localDate:date});
  ck(r.body.question.id === firstQ.id && r.body.resumed, "assignment refresh resumes pending question");
  r = await answer(s.kid, id, right(s.kid, id));
  ck(r.status === 200 && r.body.correct && r.body.progress.attempted === 1 && r.body.progress.correct === 1, "correct answer increments attempted and correct");
  r = await call({action:"assignment_answer", name:s.kid, pin:"1234", assignmentId:id, questionId:firstQ.id, choiceId:firstQ.choices[0].id, localDate:date});
  ck(r.status === 409 && r.body.error === "stale_question", "stale question rejected");
  r = await answer(s.kid, id, wrong(s.kid, id));
  ck(r.status === 200 && r.body.completed && r.body.rewardCoins > 0, "target met with no accuracy completes even with wrong answer");
  const coinsAfter = recFor(s.kid).data.coins;
  r = await call({action:"assignment_start", name:s.kid, pin:"1234", assignmentId:id, localDate:date});
  ck(r.status === 400 || r.status === 409, "completed one-time assignment cannot restart");
  ck(recFor(s.kid).data.coins === coinsAfter, "reward is not paid again after completion");
  ck(recFor(s.kid).data.progress.topics["4.multiMultiply"].solved >= 1 && recFor(s.kid).data.progress.topics["4.multiMultiply"].wrongs >= 1, "assignment practice updates ordinary skill evidence");
  ck(!(recFor(s.kid).controls.skillMastery.bySkill["4.multiMultiply"] || {}).certified, "assignment practice does not auto-certify");
  ck(r.status !== 200, "repeated complete path does not repay");

  const acc = await setup("Accuracy");
  r = await create(acc.parent, acc.kid, {skillIds:["4.multiMultiply"], targetType:"problems", target:2, minimumAccuracy:50});
  const accId = r.body.assignment.id;
  await call({action:"assignment_start", name:acc.kid, pin:"1234", assignmentId:accId, localDate:date});
  r = await answer(acc.kid, accId, wrong(acc.kid, accId));
  r = await answer(acc.kid, accId, wrong(acc.kid, accId));
  ck(!r.body.completed && r.body.progress.targetReached && !r.body.progress.accuracyMet, "target met below accuracy does not complete");
  r = await answer(acc.kid, accId, right(acc.kid, accId));
  r = await answer(acc.kid, accId, right(acc.kid, accId));
  ck(r.body.completed && r.body.progress.accuracy >= 50, "extra correct work can recover accuracy and complete");

  const time = await setup("Time");
  r = await create(time.parent, time.kid, {skillIds:["4.multiMultiply"], targetType:"minutes", target:1});
  const timeId = r.body.assignment.id;
  r = await call({action:"daily_active_time", name:time.kid, pin:"1234", localDate:date, eventId:"free-time", seconds:30, source:"practice"});
  ck(r.status === 200, "free-play heartbeat accepted separately");
  r = await call({action:"assignment_status", name:time.kid, pin:"1234", localDate:date});
  ck(r.body.assignments[0].progress.activeSeconds === 0, "free-play heartbeat does not count toward assignment time");
  r = await call({action:"assignment_active_time", name:time.kid, pin:"1234", assignmentId:timeId, localDate:date, eventId:"t1", seconds:61});
  ck(r.status === 413 && r.body.error === "seconds_too_large", "oversized assignment heartbeat rejected");
  r = await call({action:"assignment_active_time", name:time.kid, pin:"1234", assignmentId:timeId, localDate:date, eventId:"t1", seconds:30});
  ck(r.status === 200 && !r.body.completed && r.body.progress.activeSeconds === 30, "assignment heartbeat increments assignment seconds");
  r = await call({action:"assignment_active_time", name:time.kid, pin:"1234", assignmentId:timeId, localDate:date, eventId:"t1", seconds:30});
  ck(r.status === 200 && r.body.duplicate && r.body.progress.activeSeconds === 30, "duplicate assignment heartbeat deduped");
  r = await call({action:"assignment_active_time", name:time.kid, pin:"1234", assignmentId:timeId, localDate:date, eventId:"t2", seconds:30});
  ck(r.status === 200 && r.body.completed && r.body.rewardCoins > 0, "target time completes assignment");
  ck(r.body.dailyStatus.progress.activeSeconds >= 60, "assignment time counts toward daily time");

  const recur = await setup("Recur");
  r = await create(recur.parent, recur.kid, {skillIds:["4.multiMultiply"], targetType:"problems", target:1, schedule:"weekdays", weekdays:["fri","mon"], endDate:"2026-08-31"}, date);
  const recurId = r.body.assignment.id;
  await call({action:"assignment_start", name:recur.kid, pin:"1234", assignmentId:recurId, localDate:date});
  r = await answer(recur.kid, recurId, right(recur.kid, recurId));
  ck(r.body.completed && r.body.progress.occurrenceDate === "2026-08-07", "scheduled occurrence completes");
  const recurringCoins = recFor(recur.kid).data.coins;
  r = await call({action:"assignment_start", name:recur.kid, pin:"1234", assignmentId:recurId, localDate:"2026-08-07"});
  ck(r.status === 400 && r.body.error === "assignment_upcoming", "same occurrence does not regenerate after completion");
  const rolled = A.issueQuestion(recFor(recur.kid).controls.assignments.find(a=>a.id===recurId), null, "2026-08-11");
  ck(rolled.error === "assignment_upcoming" && rolled.assignment.occurrences.currentOccurrenceDate === "2026-08-14", "missed occurrence rolls forward to next valid weekday");
  ck((rolled.assignment.occurrences.recentOccurrences||[]).some(x=>x.missed), "missed occurrence history is compactly recorded");
  ck(recFor(recur.kid).data.coins === recurringCoins, "missed occurrence does not award");

  const expired = await setup("Expired");
  r = await create(expired.parent, expired.kid, {skillIds:["4.multiMultiply"], targetType:"problems", target:1, schedule:"weekdays", weekdays:["mon"], endDate:"2026-08-07"}, "2026-08-07");
  const expiredId = r.body.assignment.id;
  r = await call({action:"assignment_start", name:expired.kid, pin:"1234", assignmentId:expiredId, localDate:"2026-08-07"});
  ck(r.status === 409 && r.body.error === "assignment_expired", "endDate prevents future occurrence");

  const overdue = await setup("Overdue");
  r = await create(overdue.parent, overdue.kid, {skillIds:["4.multiMultiply"], targetType:"problems", target:1}, date);
  const overdueRec = recFor(overdue.kid);
  const oid = r.body.assignment.id;
  overdueRec.controls.assignments.find(a=>a.id===oid).dueDate = "2026-08-01";
  writeRec(overdue.kid, overdueRec);
  r = await call({action:"assignment_start", name:overdue.kid, pin:"1234", assignmentId:oid, localDate:date});
  ck(r.status === 200 && r.body.assignment.displayStatus === "overdue", "overdue one-time assignment remains actionable");

  r = await call({action:"assignment_start", name:s.kid, pin:"1234", assignmentId:"not-real", localDate:date});
  ck(r.status === 404 && r.body.error === "assignment_not_found", "arbitrary assignment rejected");
  r = await call({action:"assignment_answer", name:acc.kid, pin:"1234", assignmentId:accId, questionId:"x", choiceId:"y", completed:true, rewardCoins:999, localDate:date});
  ck(r.status === 400 && r.body.error === "client_completion_not_allowed", "client completed/reward forgery rejected");
  const sr = recFor(s.kid);
  sr.controls.assignments.find(a=>a.id===id).status = "archived";
  writeRec(s.kid, sr);
  r = await call({action:"assignment_start", name:s.kid, pin:"1234", assignmentId:id, localDate:date});
  ck(r.status === 409 && r.body.error === "assignment_archived", "archived assignment cannot run");
  r = await call({action:"assignment_start", name:time.kid, pin:"1234", assignmentId:timeId, localDate:"2099-01-01"});
  ck(r.status === 400 && r.body.error === "invalid_date", "future occurrence injection rejected");

  const legacy = A.summarizeList([{id:"legacy",skillIds:["4.multiMultiply"],targetType:"problems",target:1,status:"active"}], {localDate:date});
  ck(legacy.length === 1 && legacy[0].progress, "old assignments normalize with progress safely");

  console.log(fails ? fails + " ASSIGNMENT EXECUTION TEST FAILURES" : "ALL ASSIGNMENT EXECUTION TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
