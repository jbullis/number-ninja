const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }
function activityFor(name){ const raw = KV.store.get("player:" + name.toLowerCase() + ":activity"); return raw ? JSON.parse(raw) : null; }
async function setupStudent(name, grade){
  await call({action:"register_student", name, pin:"1234", grade:grade || "4"});
  return name;
}
async function startPractice(name, skillId, date){
  return call({action:"practice_start", name, pin:"1234", skillId, mode:"arena", localDate:date || "2026-08-09"});
}
function pendingPractice(name){ return recFor(name).controls.practice.pendingQuestion; }
function rightPractice(name){ return pendingPractice(name).correctChoiceId; }
function wrongPractice(name){ const q = pendingPractice(name); return q.choices.find(c => c.id !== q.correctChoiceId).id; }
async function answerPractice(name, choiceId, extra){
  const q = pendingPractice(name);
  return call(Object.assign({action:"practice_answer", name, pin:"1234", questionId:q.id, choiceId, localDate:"2026-08-09"}, extra || {}));
}
async function answerCorrect(name, skillId){
  await startPractice(name, skillId || "4.multiMultiply");
  return answerPractice(name, rightPractice(name));
}

(async()=>{
  let r;
  const kid = await setupStudent("Phase5Kid", "4");

  r = await startPractice(kid, "4.multiMultiply");
  ck(r.status === 200 && r.body.question && !JSON.stringify(r.body.question).includes("correctChoiceId"), "server issues sanitized public question");
  const first = r.body.question;
  ck(first.choices.every(c => c.id && c.h && !("ok" in c)), "public choices hide answer flags");
  r = await startPractice(kid, "4.multiMultiply");
  ck(r.body.resumed && r.body.question.id === first.id, "pending question resumes");

  r = await call({action:"practice_answer", name:kid, pin:"1234", questionId:first.id, choiceId:rightPractice(kid), localDate:"2026-08-09", correct:true});
  ck(r.status === 400 && r.body.error === "client_scoring_not_allowed", "client correct:true rejected");
  r = await answerPractice(kid, rightPractice(kid));
  ck(r.status === 200 && r.body.correct && r.body.coins.awarded === 13, "server scores correct answer and awards practice plus daily bonus");
  let rec = recFor(kid);
  ck(rec.data.progress.topics["4.multiMultiply"].solved === 1 && rec.data.stats.totalCorrect === 1, "correct answer updates canonical topic stats");
  ck((rec.controls.skillMastery.bySkill["4.multiMultiply"] || {}).certified !== true, "ordinary practice does not auto-certify Black Belt");
  r = await call({action:"practice_answer", name:kid, pin:"1234", questionId:first.id, choiceId:first.choices[0].id, localDate:"2026-08-09"});
  ck(r.status === 409 && r.body.error === "question_already_answered", "duplicate answer cannot create second attempt");

  await startPractice(kid, "4.multiMultiply");
  const stale = pendingPractice(kid).id;
  r = await call({action:"practice_answer", name:kid, pin:"1234", questionId:"not-" + stale, choiceId:wrongPractice(kid), localDate:"2026-08-09"});
  ck(r.status === 409 && r.body.error === "stale_question", "stale question rejected");
  r = await call({action:"practice_answer", name:kid, pin:"1234", questionId:stale, choiceId:"bad-choice", localDate:"2026-08-09"});
  ck(r.status === 400 && r.body.error === "invalid_choice", "invalid choice rejected");
  r = await answerPractice(kid, wrongPractice(kid));
  ck(r.status === 200 && !r.body.correct, "server scores incorrect answer");
  rec = recFor(kid);
  ck(rec.data.progress.topics["4.multiMultiply"].wrongs === 1, "wrong answer updates canonical wrong count");

  r = await call({action:"save", name:kid, pin:"1234", data:{coins:999, stats:{totalCorrect:999}, progress:{topics:{"4.multiMultiply":{solved:999, first:999, wrongs:0, tutors:0}}, mastery:{"4.multiMultiply":100}}}});
  ck(r.status === 200 && r.body.data.coins === rec.data.coins && r.body.data.stats.totalCorrect === 1, "general save cannot forge coins or totalCorrect");
  ck(r.body.data.progress.topics["4.multiMultiply"].solved === 1 && r.body.data.progress.mastery["4.multiMultiply"] < 100, "general save cannot forge topics or mastery");

  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-09", eventId:"old-practice", reason:"practice_correct"});
  ck(r.status === 400 && r.body.error === "practice_coin_earn_deprecated", "old practice coin_earn is deprecated");
  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-09", eventId:"daily", reason:"daily_bonus"});
  ck(r.status === 400 && r.body.error === "daily_bonus_automatic", "daily bonus is automatic after legitimate activity");

  r = await call({action:"daily_status", name:kid, pin:"1234", localDate:"2026-08-09"});
  ck(r.body.dailyStatus.progress.problemsCompleted === 2, "ordinary answers count daily goal once each");
  r = await call({action:"activity_history", name:kid, pin:"1234", dateFrom:"2026-08-09", dateTo:"2026-08-09"});
  ck(r.status === 200 && r.body.activity.attempts.length === 2, "history contains exactly two practice attempts");
  ck(r.body.activity.attempts.every(a => a.source === "practice" && a.questionId && typeof a.correct === "boolean"), "attempt fields include source question and correctness");

  r = await call({action:"practice_start", name:kid, pin:"1234", skillId:"4.wordProblems", mode:"workbook", localDate:"2026-08-09"});
  ck(r.status === 200 && r.body.question.mode === "workbook", "Workbook Quest mode can issue server-scored question");
  r = await answerPractice(kid, rightPractice(kid));
  ck(r.status === 200 && r.body.correct, "Workbook Quest mode answer is server-scored");
  r = await call({action:"activity_history", name:kid, pin:"1234", source:"workbook", dateFrom:"2026-08-09"});
  ck(r.body.activity.attempts.some(a => a.mode === "workbook"), "Workbook Quest attempt history records workbook mode");

  const kKid = await setupStudent("Phase5Kinder", "K");
  r = await startPractice(kKid, "5.decimalOps");
  ck(r.status === 403 && r.body.error === "skill_locked", "locked arbitrary above-grade skill request rejected");

  const achKid = await setupStudent("Phase5Ach", "4");
  for(let i=0;i<25;i++) await answerCorrect(achKid, "4.multiMultiply");
  r = await call({action:"achievement_status", name:achKid, pin:"1234", localDate:"2026-08-09"});
  ck(r.body.achievements.earnedCount >= 2, "legitimate practice milestones can award badges");
  const beforeEarned = r.body.achievements.earnedCount;
  await call({action:"save", name:achKid, pin:"1234", data:{stats:{totalCorrect:1000}, progress:{topics:{"4.multiMultiply":{solved:1000, first:1000, wrongs:0, tutors:0}}, mastery:{}}}});
  r = await call({action:"achievement_status", name:achKid, pin:"1234", localDate:"2026-08-09"});
  ck(r.body.achievements.earnedCount === beforeEarned, "forged save does not award practice badges");

  await call({action:"register_parent", name:"Phase5Parent", pin:"2222"});
  await call({action:"link_child", parentName:"Phase5Parent", parentPin:"2222", childName:kid, childPin:"1234"});
  r = await call({action:"parent_activity_history", parentName:"Phase5Parent", parentPin:"2222", childName:kid, dateFrom:"2026-08-09"});
  ck(r.status === 200 && r.body.activity.attempts.length >= 3, "linked parent can read child activity history");
  await call({action:"register_parent", name:"Phase5OtherParent", pin:"2222"});
  r = await call({action:"parent_activity_history", parentName:"Phase5OtherParent", parentPin:"2222", childName:kid});
  ck(r.status === 403 && r.body.error === "student_not_linked_to_parent", "unlinked parent cannot read child activity history");

  KV.store.set("player:" + kid.toLowerCase() + ":activity", JSON.stringify({
    version:1,
    attempts:[
      {attemptId:"old", at:Date.parse("2026-05-01T12:00:00Z"), localDate:"2026-05-01", source:"practice", skillId:"4.multiMultiply", questionId:"old", choiceId:"x", correct:true},
      {attemptId:"recent", at:Date.parse("2026-08-08T12:00:00Z"), localDate:"2026-08-08", source:"practice", skillId:"4.multiMultiply", questionId:"recent", choiceId:"x", correct:false}
    ],
    daily:{"2026-05-01":{attempts:1, correct:1, help:0, skills:["4.multiMultiply"]}},
    skills:{},
    aggregates:{totalAttempts:2,totalCorrect:1,totalHelp:0}
  }));
  r = await call({action:"activity_history", name:kid, pin:"1234", dateFrom:"2026-05-01", dateTo:"2026-08-09", limit:10});
  ck(!r.body.activity.attempts.some(a => a.attemptId === "old") && r.body.activity.attempts.some(a => a.attemptId === "recent"), "91-day entry pruned and recent retained");
  ck(r.body.activity.daily["2026-05-01"].attempts === 1, "permanent daily summary retained after raw prune");

  const asg = await call({action:"register_parent", name:"Phase5AssignParent", pin:"2222"});
  await call({action:"register_student", name:"Phase5AssignKid", pin:"1234", grade:"4"});
  await call({action:"link_child", parentName:"Phase5AssignParent", parentPin:"2222", childName:"Phase5AssignKid", childPin:"1234"});
  r = await call({action:"parent_create_assignment", parentName:"Phase5AssignParent", parentPin:"2222", childName:"Phase5AssignKid", localDate:"2026-08-09", assignment:{skillIds:["4.multiMultiply"], targetType:"problems", target:1}});
  const assignmentId = r.body.assignment.id;
  await call({action:"assignment_start", name:"Phase5AssignKid", pin:"1234", assignmentId, localDate:"2026-08-09"});
  const q = recFor("Phase5AssignKid").controls.assignments.find(a => a.id === assignmentId).occurrences.pendingQuestion;
  r = await call({action:"assignment_answer", name:"Phase5AssignKid", pin:"1234", assignmentId, questionId:q.id, choiceId:q.correctChoiceId, localDate:"2026-08-09"});
  const hist = activityFor("Phase5AssignKid");
  ck(hist && hist.attempts.some(a => a.source === "assignment" && a.assignmentId === assignmentId), "assignment answer writes detailed activity source");
  r = await call({action:"coin_earn", name:"Phase5AssignKid", pin:"1234", localDate:"2026-08-09", eventId:"assignment-stack", reason:"practice_correct"});
  ck(r.status === 400 && r.body.error === "practice_coin_earn_deprecated", "assignment answer cannot double-pay ordinary practice coins");

  const legacy = await setupStudent("Phase5Legacy", "4");
  r = await call({action:"activity_history", name:legacy, pin:"1234"});
  ck(r.status === 200 && r.body.activity.attempts.length === 0, "legacy users normalize with no fabricated history");

  console.log(fails ? fails + " PHASE 5A TEST FAILURES" : "ALL PHASE 5A TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
