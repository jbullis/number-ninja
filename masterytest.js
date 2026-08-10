const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const C = require("./js/curriculum.js");
const M = require("./js/mastery.js");
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }
function pending(name, kind){ const sm = recFor(name).controls.skillMastery; return kind === "review" ? sm.pendingReview : sm.pendingChallenge; }
function rightChoice(name, kind){ return pending(name, kind).pendingQuestion.correctChoiceId; }
function wrongChoice(name, kind){
  const p = pending(name, kind), q = p.pendingQuestion;
  return q.choices.find(c => c.id !== q.correctChoiceId).id;
}
function progress(skillId, mastery, solved, first, wrongs, extraMastery){
  const masteryMap = Object.assign({}, extraMastery || {});
  masteryMap[skillId] = mastery;
  return { progress:{ mastery:masteryMap, topics:{ [skillId]:{ solved, first:first == null ? solved : first, wrongs:wrongs || 0, tutors:0 } } } };
}
function addTopic(data, skillId, mastery, solved, first, wrongs){
  data.progress.mastery[skillId] = mastery;
  data.progress.topics[skillId] = { solved, first:first == null ? solved : first, wrongs:wrongs || 0, tutors:0 };
  return data;
}
async function makeStudent(name, data, grade){
  await call({ action:"register_student", name, pin:"1234", grade:grade || "4" });
  const rec = recFor(name);
  rec.data = data;
  writeRec(name, rec);
}
async function answerAll(name, kind, correctPattern){
  let p = pending(name, kind), last;
  for(let i=0;i<p.plan.length;i++){
    const q = p.pendingQuestion;
    const correct = typeof correctPattern === "function" ? correctPattern(i, q) : !!correctPattern;
    last = await call({ action:kind === "review" ? "mastery_review_answer" : "mastery_challenge_answer", name, pin:"1234", questionId:q.id, choiceId:correct ? rightChoice(name, kind) : wrongChoice(name, kind) });
    ck(last.status === 200, kind + " answer accepted", last.body);
    p = pending(name, kind);
  }
  return last;
}

(async()=>{
  const controls = api.defaultControls("4");
  let data = progress("4.multiMultiply", 79, 20, 18, 1, { "3.fluency":90, "4.placeValue":90 });
  ck(!M.evaluateSkill("4.multiMultiply", data, controls).eligible, "insufficient mastery does not unlock challenge");
  data = progress("4.multiMultiply", 90, 2, 2, 0, { "3.fluency":90, "4.placeValue":90 });
  ck(!M.evaluateSkill("4.multiMultiply", data, controls).eligible, "insufficient ordinary evidence does not unlock challenge");
  data = progress("4.multiMultiply", 90, 20, 18, 2, { "3.fluency":70, "4.placeValue":90 });
  ck(M.evaluateSkill("4.multiMultiply", data, controls).reason === "prerequisites_needed", "unmet prerequisite blocks challenge");
  data = progress("4.multiMultiply", 90, 20, 18, 2, { "3.fluency":90, "4.placeValue":90 });
  ck(M.evaluateSkill("4.multiMultiply", data, controls).eligible, "sufficient evidence unlocks challenge");
  const plan = M.challengePlan("4.multiMultiply");
  ck(plan.length === M.CHALLENGE_QUESTIONS && plan.some(x=>x.role==="target") && plan.some(x=>x.role==="prerequisite"), "challenge has target plus prerequisites");

  await makeStudent("MasterKid", data, "4");
  let r = await call({ action:"mastery_challenge_start", name:"MasterKid", pin:"1234", skillId:"4.multiMultiply" });
  ck(r.status === 200 && r.body.question && !JSON.stringify(r.body).includes("correctChoiceId"), "challenge start returns public server question");
  const firstQuestion = r.body.question;
  r = await call({ action:"mastery_challenge_start", name:"MasterKid", pin:"1234", skillId:"4.multiMultiply" });
  ck(r.body.question.id === firstQuestion.id && r.body.resumed, "challenge refresh resumes pending question");
  r = await call({ action:"mastery_challenge_answer", name:"MasterKid", pin:"1234", correct:true });
  ck(r.status === 400 && r.body.error === "question_required", "client cannot fake challenge with correct:true");
  r = await call({ action:"mastery_challenge_answer", name:"MasterKid", pin:"1234", questionId:firstQuestion.id, choiceId:firstQuestion.choices[0].id, skillId:"5.logic" });
  ck(r.status === 409 && r.body.error === "different_skill", "arbitrary challenge skill ID rejected");
  r = await call({ action:"mastery_challenge_answer", name:"MasterKid", pin:"1234", questionId:firstQuestion.id, choiceId:wrongChoice("MasterKid","challenge"), correct:true });
  ck(r.status === 200 && r.body.correct === false, "server scores selected wrong answer despite correct:true");
  r = await call({ action:"mastery_challenge_answer", name:"MasterKid", pin:"1234", questionId:firstQuestion.id, choiceId:firstQuestion.choices[0].id });
  ck(r.status === 409 && r.body.error === "stale_question", "stale challenge response rejected");
  r = await call({ action:"mastery_challenge_complete", name:"MasterKid", pin:"1234" });
  ck(r.status === 409 && r.body.error === "challenge_not_complete", "early challenge completion rejected");

  await makeStudent("PassKid", data, "4");
  r = await call({ action:"mastery_challenge_start", name:"PassKid", pin:"1234", skillId:"4.multiMultiply" });
  await answerAll("PassKid", "challenge", true);
  r = await call({ action:"mastery_challenge_complete", name:"PassKid", pin:"1234" });
  ck(r.status === 200 && r.body.result.passed, "normal challenge completion passes");
  ck(recFor("PassKid").controls.skillMastery.bySkill["4.multiMultiply"].certified, "pass certifies skill");
  ck(recFor("PassKid").data.progress.mastery["4.multiMultiply"] === 90, "pass preserves numeric mastery");

  await makeStudent("FailKid", data, "4");
  r = await call({ action:"mastery_challenge_start", name:"FailKid", pin:"1234", skillId:"4.multiMultiply" });
  await answerAll("FailKid", "challenge", false);
  r = await call({ action:"mastery_challenge_complete", name:"FailKid", pin:"1234" });
  ck(r.status === 200 && !r.body.result.passed, "challenge can fail");
  const failRec = recFor("FailKid");
  ck(!failRec.controls.skillMastery.bySkill["4.multiMultiply"].certified, "fail does not certify");
  ck(failRec.data.progress.mastery["4.multiMultiply"] === 90, "fail does not reduce mastery");
  r = await call({ action:"mastery_challenge_start", name:"FailKid", pin:"1234", skillId:"4.multiMultiply" });
  ck(r.status === 409 && r.body.error === "retry_practice_needed", "retry requires additional clean practice");

  let passRec = recFor("PassKid");
  passRec.controls.skillMastery.bySkill["4.multiMultiply"].reviewDueAt = 1000;
  writeRec("PassKid", passRec);
  r = await call({ action:"report", name:"PassKid", pin:"1234" });
  ck((r.body.masterySummary.dueReviews||[]).some(x=>x.skillId==="4.multiMultiply"), "review due calculation");
  r = await call({ action:"mastery_review_start", name:"PassKid", pin:"1234", skillId:"4.multiMultiply" });
  ck(r.status === 200 && r.body.question, "review starts when due");
  const reviewQ = r.body.question;
  r = await call({ action:"mastery_review_start", name:"PassKid", pin:"1234", skillId:"4.multiMultiply" });
  ck(r.body.question.id === reviewQ.id && r.body.resumed, "review refresh resumes");
  await answerAll("PassKid", "review", false);
  r = await call({ action:"mastery_review_complete", name:"PassKid", pin:"1234" });
  ck(r.status === 200 && r.body.result.needsReview, "weak review sets Needs Review");
  ck(recFor("PassKid").controls.skillMastery.bySkill["4.multiMultiply"].certified, "weak review does not remove certification");
  passRec = recFor("PassKid");
  passRec.controls.skillMastery.bySkill["4.multiMultiply"].reviewDueAt = 1000;
  writeRec("PassKid", passRec);
  await call({ action:"mastery_review_start", name:"PassKid", pin:"1234", skillId:"4.multiMultiply" });
  await answerAll("PassKid", "review", true);
  r = await call({ action:"mastery_review_complete", name:"PassKid", pin:"1234" });
  ck(r.status === 200 && !r.body.result.needsReview, "later good review clears Needs Review");
  ck(recFor("PassKid").controls.skillMastery.bySkill["4.multiMultiply"].certified, "good review keeps certification");

  const legacyControls = api.defaultControls("4");
  const legacyData = progress("4.multiMultiply", 98, 22, 20, 1, { "3.fluency":90, "4.placeValue":90 });
  const legacySummary = M.summary(legacyData, legacyControls);
  ck(!legacyControls.skillMastery.bySkill["4.multiMultiply"].certified, "legacy high mastery is not auto-certified");
  ck(legacySummary.eligibleChallenges.some(x=>x.skillId==="4.multiMultiply"), "legacy high mastery becomes challenge-ready");
  legacyControls.skillMastery.bySkill["4.multiMultiply"].certified = true;
  legacyControls.skillMastery.bySkill["4.multiMultiply"].needsReview = true;
  const recs = C.nextRecommendations(Object.assign({ "4.logic":10, "4.wordProblems":80 }, legacyData.progress.mastery), {}, legacyControls, 3);
  ck(recs[0] && recs[0].id === "4.multiMultiply", "Needs Review sorts above normal recommendations");

  r = await call({ action:"mastery_challenge_start", name:"PassKid", pin:"1234", skillId:"4.multiMultiply" });
  ck(r.status === 409 && r.body.error === "already_certified", "certified skill does not unlock another challenge");
  r = await call({ action:"mastery_challenge_start", name:"PassKid", pin:"1234", skillId:"does.not.exist" });
  ck(r.status === 409 && r.body.error === "unknown_skill", "unknown challenge skill rejected");
  r = await call({ action:"mastery_challenge_start", name:"PassKid", pin:"1234", skillId:"4.longDivision" });
  ck(r.status === 409, "insufficient evidence for another skill rejected");

  console.log(fails ? fails + " MASTERY TEST FAILURES" : "ALL MASTERY TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode=1; });
