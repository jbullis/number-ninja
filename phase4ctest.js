const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const Assignments = require("./js/assignments.js");
const Cosmetics = require("./js/cosmetics.js");
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }
async function setupStudent(name){ await call({action:"register_student", name, pin:"1234", grade:"4"}); return name; }
async function savePractice(name, solved, wrongs){
  const rec = recFor(name);
  await call({action:"save", name, pin:"1234", data:{
    coins:rec.data && rec.data.coins || 0,
    level:rec.data && rec.data.level || 1,
    stats:{totalCorrect:solved},
    progress:{topics:{"4.multiMultiply":{solved, first:solved, wrongs:wrongs || 0, tutors:0}}, mastery:{"4.multiMultiply":Math.min(100, solved * 4)}},
    inventory:(rec.data && rec.data.inventory) || {},
  }});
}
async function earn(name, eventId, reason, extra){
  return call(Object.assign({action:"coin_earn", name, pin:"1234", localDate:"2026-08-08", eventId, reason}, extra || {}));
}
async function earnPractice(name){
  await call({action:"practice_start", name, pin:"1234", localDate:"2026-08-08", mode:"arena", skillId:"4.multiMultiply"});
  const q = recFor(name).controls.practice.pendingQuestion;
  return call({action:"practice_answer", name, pin:"1234", localDate:"2026-08-08", questionId:q.id, choiceId:q.correctChoiceId});
}
async function setupAssignment(prefix, assignment){
  await call({action:"register_parent", name:prefix+"Parent", pin:"2222"});
  await call({action:"register_student", name:prefix+"Kid", pin:"1234", grade:"4"});
  await call({action:"link_child", parentName:prefix+"Parent", parentPin:"2222", childName:prefix+"Kid", childPin:"1234"});
  const r = await call({action:"parent_create_assignment", parentName:prefix+"Parent", parentPin:"2222", childName:prefix+"Kid", localDate:"2026-08-07", assignment});
  return { parent:prefix+"Parent", kid:prefix+"Kid", assignmentId:r.body.assignment.id };
}
function pending(name, id){ return recFor(name).controls.assignments.find(a => a.id === id).occurrences.pendingQuestion; }
function right(name, id){ return pending(name, id).correctChoiceId; }

(async()=>{
  let r;
  const kid = await setupStudent("Phase4CKid");

  r = await earn(kid, "no-evidence", "practice_correct");
  ck(r.status === 400 && r.body.error === "practice_coin_earn_deprecated", "old free-play reward endpoint is deprecated");
  r = await earnPractice(kid);
  ck(r.status === 200 && r.body.coins.awarded === 13 && recFor(kid).data.coins === 13, "server-scored practice reward pays fixed amount plus daily bonus");
  r = await call({action:"practice_answer", name:kid, pin:"1234", localDate:"2026-08-08", questionId:"replay", choiceId:"x"});
  ck(r.status === 400 && r.body.error === "question_required", "unique event IDs alone cannot farm practice rewards");
  r = await earnPractice(kid);
  ck(r.status === 200 && r.body.coins.awarded === 3 && recFor(kid).data.coins === 16, "next legitimate practice answer earns next reward");

  r = await earn(kid, "daily-1", "daily_bonus");
  ck(r.status === 400 && r.body.error === "daily_bonus_automatic", "daily bonus no longer pays through claim endpoint");
  r = await earn(kid, "daily-2", "daily_bonus");
  ck(r.status === 400 && r.body.error === "daily_bonus_automatic", "daily bonus cannot be repeated with another event");

  r = await call({action:"save", name:kid, pin:"1234", data:{coins:999, progress:{topics:{"4.multiMultiply":{solved:2,first:2,wrongs:0,tutors:0}}, story:{C9:{stars:3}}}}});
  ck(r.status === 200 && r.body.data.coins === 16, "general save still cannot mint coins");
  r = await earn(kid, "story-fake", "story_level_complete", {levelKey:"C9", stars:3});
  ck(r.status === 400 && r.body.error === "progression_evidence_required", "story reward cannot use forged save state");
  r = await earn(kid, "boss-fake", "boss_clear");
  ck(r.status === 400 && r.body.error === "progression_evidence_required", "boss reward remains rejected without evidence");
  r = await earn(kid, "level-fake", "level_up");
  ck(r.status === 400 && r.body.error === "progression_evidence_required", "level reward remains rejected without evidence");

  let before = recFor(kid);
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:before.data.coins, progress:before.data.progress, inventory:{freehint:5, fiftyfifty:5, coinsx2:3, freeplay:1}}});
  ck(r.body.data.inventory.freehint === 0 && r.body.data.inventory.coinsx2 === 0, "forged power inventory increase without spending is blocked");
  before = recFor(kid);
  before.data.coins = 50;
  writeRec(kid, before);
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:10, progress:before.data.progress, inventory:{freehint:5, fiftyfifty:0, coinsx2:0, freeplay:0}}});
  ck(r.body.data.inventory.freehint === 5 && r.body.data.coins === 10, "legacy power purchase works when enough coins are spent");

  const a = await setupAssignment("Phase4CAsg", {skillIds:["4.multiMultiply"], targetType:"problems", target:1});
  await call({action:"assignment_start", name:a.kid, pin:"1234", assignmentId:a.assignmentId, localDate:"2026-08-07"});
  r = await call({action:"assignment_answer", name:a.kid, pin:"1234", assignmentId:a.assignmentId, questionId:pending(a.kid, a.assignmentId).id, choiceId:right(a.kid, a.assignmentId), localDate:"2026-08-07"});
  const assignmentCoins = recFor(a.kid).data.coins;
  ck(r.status === 200 && r.body.completed && assignmentCoins === r.body.rewardCoins, "assignment completion pays once");
  r = await earn(a.kid, "assignment-stack", "practice_correct");
  ck(r.status === 400 && r.body.error === "practice_coin_earn_deprecated", "assignment answer does not double-pay normal practice coins");
  r = await call({action:"assignment_start", name:a.kid, pin:"1234", assignmentId:a.assignmentId, localDate:"2026-08-07"});
  ck(recFor(a.kid).data.coins === assignmentCoins, "completed assignment cannot replay reward");

  const rec = recFor(a.kid);
  rec.data.coins = 100;
  writeRec(a.kid, rec);
  r = await call({action:"cosmetic_purchase", name:a.kid, pin:"1234", cosmeticId:"glow", requestId:"buy1"});
  ck(r.status === 200 && r.body.coins === 60, "cosmetic purchase spends exact server price");
  r = await call({action:"cosmetic_purchase", name:a.kid, pin:"1234", cosmeticId:"sparkle", requestId:"buy1"});
  ck(r.status === 200 && r.body.duplicate && recFor(a.kid).data.coins === 60, "duplicate purchase request does not double-spend");
  r = await call({action:"cosmetic_purchase", name:a.kid, pin:"1234", cosmeticId:"title:blackbelt", requestId:"buy2"});
  ck(r.status === 409 && r.body.error === "cosmetic_not_purchasable", "achievement cosmetic cannot be bought");

  const prices = Cosmetics.CATALOG.filter(c => c.unlockType === "coins").map(c => c.priceCoins);
  ck(Math.min(...prices) === 40 && Math.max(...prices) === 220, "cosmetic prices stay in documented range");
  ck(Assignments.LIMITS.rewardMin === 5 && Assignments.LIMITS.rewardMax === 50, "assignment reward bounds remain modest");
  const small = Assignments.rewardFor({targetType:"problems", target:5}, ["4.multiMultiply"]).coins;
  ck(small >= 5 && small <= 20, "small assignment reward remains reasonable");

  const earnedRec = recFor(a.kid);
  ck(earnedRec.controls.currency && earnedRec.controls.currency.ledger && earnedRec.controls.currency.ledger.length > 0, "bounded currency ledger records earn/spend events");
  const masteryBefore = JSON.stringify(earnedRec.controls.skillMastery);
  await call({action:"cosmetic_equip", name:a.kid, pin:"1234", cosmeticId:"glow", slot:"aura"});
  ck(JSON.stringify(recFor(a.kid).controls.skillMastery) === masteryBefore, "cosmetics do not affect mastery/certification");

  console.log(fails ? fails + " PHASE 4C TEST FAILURES" : "ALL PHASE 4C TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
