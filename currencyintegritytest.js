const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }
async function setup(name){
  await call({action:"register_student", name, pin:"1234", grade:"4"});
  return name;
}
async function earnPractice(name, eventSuffix){
  await call({action:"practice_start", name, pin:"1234", localDate:"2026-08-08", mode:"arena", skillId:"4.multiMultiply"});
  const pending = recFor(name).controls.practice.pendingQuestion;
  return call({action:"practice_answer", name, pin:"1234", localDate:"2026-08-08", questionId:pending.id, choiceId:pending.correctChoiceId, eventId:"ignored-" + eventSuffix});
}
async function parentSetup(prefix){
  await call({action:"register_parent", name:prefix+"Parent", pin:"2222"});
  await call({action:"register_student", name:prefix+"Kid", pin:"1234", grade:"4"});
  await call({action:"link_child", parentName:prefix+"Parent", parentPin:"2222", childName:prefix+"Kid", childPin:"1234"});
  return {parent:prefix+"Parent", kid:prefix+"Kid"};
}

(async()=>{
  let r;
  const kid = await setup("CurrencyKid");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:200, level:2, progress:{topics:{},mastery:{}}}});
  ck(r.status === 200 && r.body.data.coins === 0, "general save cannot change 0 coins to 200");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:400, level:2, progress:{topics:{},mastery:{}}}});
  ck(r.status === 200 && r.body.data.coins === 0, "repeated saves cannot mint coins");

  r = await earnPractice(kid, "1");
  ck(r.status === 200 && r.body.coins.awarded === 13 && r.body.coins.coins === 13, "legitimate server-scored practice reward increases coins");
  r = await call({action:"practice_answer", name:kid, pin:"1234", localDate:"2026-08-08", questionId:"replay", choiceId:"x"});
  ck(r.status === 400 && r.body.error === "question_required", "duplicate reward cannot be claimed without pending question");
  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-08", eventId:"bad-amount", reason:"level_up", coins:999});
  ck(r.status === 400 && r.body.error === "client_coin_amount_not_allowed", "client-supplied reward amount rejected");
  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-08", eventId:"daily-1", reason:"daily_bonus"});
  ck(r.status === 400 && r.body.error === "daily_bonus_automatic", "daily bonus no longer pays through client claim");
  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-08", eventId:"fake-boss", reason:"boss_clear", boosted:true});
  ck(r.status === 400 && r.body.error === "progression_evidence_required", "fake boss_clear without progression evidence is rejected");
  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-08", eventId:"fake-level", reason:"level_up"});
  ck(r.status === 400 && r.body.error === "progression_evidence_required", "fake level_up does not pay");
  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-08", eventId:"fake-story", reason:"story_level_complete", levelKey:"C99", stars:3});
  ck(r.status === 400 && r.body.error === "progression_evidence_required", "fake story completion without server evidence is rejected");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:400, level:2, progress:{topics:{},mastery:{}}}});
  ck(r.status === 200 && r.body.data.coins === 13, "general save cannot increase coins");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:25, level:2, progress:{topics:{},mastery:{}}}});
  ck(r.status === 200 && r.body.data.coins === 13, "higher lower-balance save cannot increase from canonical");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:5, level:2, progress:{topics:{"4.multiMultiply":{solved:1,first:1,wrongs:0,tutors:0}},mastery:{},story:{C1:{stars:1,ft:1,wr:0}}}}});
  ck(r.status === 200 && r.body.data.coins === 5, "legacy lower-balance save is retained for client-side spending");

  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-08", eventId:"story-1", reason:"story_level_complete", levelKey:"C1", stars:3});
  ck(r.status === 400 && r.body.error === "progression_evidence_required", "story reward cannot use forgeable saved progress");
  await earnPractice(kid, "2");
  ck(recFor(kid).data.coins === 8, "client boosted/tier cannot inflate later practice reward");
  for(let i=3;i<=13;i++) await earnPractice(kid, String(i));
  r = await call({action:"cosmetic_purchase", name:kid, pin:"1234", cosmeticId:"glow", requestId:"buy-glow"});
  ck(r.status === 200 && r.body.cosmetics.items.find(i=>i.id==="glow").owned, "cosmetic purchase deducts correctly after legitimate rewards");
  r = await call({action:"cosmetic_purchase", name:kid, pin:"1234", cosmeticId:"sparkle", requestId:"buy-sparkle"});
  ck(r.status === 409 && r.body.error === "insufficient_coins", "insufficient-funds purchase still rejects");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:45, owned:["e:Wizard"], ownedEffects:["rainbow"], skin:"e:Wizard", effect:"rainbow", progress:{topics:{},mastery:{}}}});
  ck(!r.body.cosmetics.items.find(i=>i.id==="e:Wizard").owned && !r.body.cosmetics.items.find(i=>i.id==="rainbow").owned, "forged ownership still rejected");

  const a = await parentSetup("CurrencyAssign");
  r = await call({action:"parent_create_assignment", parentName:a.parent, parentPin:"2222", childName:a.kid, localDate:"2026-08-08", assignment:{skillIds:["4.multiMultiply"], targetType:"problems", target:1}});
  const assignmentId = r.body.assignment.id;
  r = await call({action:"assignment_start", name:a.kid, pin:"1234", assignmentId, localDate:"2026-08-08"});
  const pending = recFor(a.kid).controls.assignments.find(x=>x.id===assignmentId).occurrences.pendingQuestion;
  r = await call({action:"assignment_answer", name:a.kid, pin:"1234", assignmentId, questionId:pending.id, choiceId:pending.correctChoiceId, localDate:"2026-08-08"});
  ck(r.status === 200 && r.body.completed && r.body.rewardCoins > 0 && recFor(a.kid).data.coins === r.body.rewardCoins, "assignment reward still pays server-side");

  console.log(fails ? fails + " CURRENCY INTEGRITY TEST FAILURES" : "ALL CURRENCY INTEGRITY TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
