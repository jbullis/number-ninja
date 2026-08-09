const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }

async function setup(name){
  await call({action:"register_student", name, pin:"1234", grade:"4"});
  return name;
}
async function earn(name, eventId, reason, extra){
  return call(Object.assign({action:"coin_earn", name, pin:"1234", localDate:"2026-08-08", eventId, reason}, extra || {}));
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

  r = await earn(kid, "earn-1", "story_level_complete", {stars:3});
  ck(r.status === 200 && r.body.awarded === 60 && r.body.coins === 60, "legitimate server reward increases coins");
  r = await earn(kid, "earn-1", "story_level_complete", {stars:3});
  ck(r.status === 200 && r.body.duplicate && r.body.awarded === 0 && r.body.coins === 60, "duplicate reward event does not repay");
  r = await call({action:"coin_earn", name:kid, pin:"1234", localDate:"2026-08-08", eventId:"bad-amount", reason:"level_up", coins:999});
  ck(r.status === 400 && r.body.error === "client_coin_amount_not_allowed", "client-supplied reward amount rejected");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:400, level:2, progress:{topics:{},mastery:{}}}});
  ck(r.status === 200 && r.body.data.coins === 60, "general save cannot change 60 to 400");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:25, level:2, progress:{topics:{},mastery:{}}}});
  ck(r.status === 200 && r.body.data.coins === 25, "legacy lower-balance save is retained for client-side spending");

  await earn(kid, "earn-2", "story_level_complete", {stars:3});
  ck(recFor(kid).data.coins === 85, "server reward after lower save uses canonical balance");
  r = await call({action:"cosmetic_purchase", name:kid, pin:"1234", cosmeticId:"glow", requestId:"buy-glow"});
  ck(r.status === 200 && r.body.coins === 45 && r.body.cosmetics.items.find(i=>i.id==="glow").owned, "cosmetic purchase deducts correctly");
  r = await call({action:"cosmetic_purchase", name:kid, pin:"1234", cosmeticId:"sparkle", requestId:"buy-sparkle"});
  ck(r.status === 409 && r.body.error === "insufficient_coins", "insufficient-funds purchase still rejects");
  r = await call({action:"save", name:kid, pin:"1234", data:{coins:45, owned:["e:Wizard"], ownedEffects:["rainbow"], skin:"e:Wizard", effect:"rainbow", progress:{topics:{},mastery:{}}}});
  ck(!r.body.cosmetics.items.find(i=>i.id==="e:Wizard").owned && !r.body.cosmetics.items.find(i=>i.id==="rainbow").owned, "forged ownership still rejected");

  const a = await parentSetup("CurrencyAssign");
  r = await call({action:"parent_create_assignment", parentName:a.parent, parentPin:"2222", childName:a.kid, localDate:"2026-08-08", assignment:{skillIds:["4.multiMultiply"], targetType:"problems", target:1}});
  const assignmentId = r.body.assignment.id;
  r = await call({action:"assignment_start", name:a.kid, pin:"1234", assignmentId, localDate:"2026-08-08"});
  const rec = recFor(a.kid);
  const pending = rec.controls.assignments.find(x=>x.id===assignmentId).occurrences.pendingQuestion;
  r = await call({action:"assignment_answer", name:a.kid, pin:"1234", assignmentId, questionId:pending.id, choiceId:pending.correctChoiceId, localDate:"2026-08-08"});
  ck(r.status === 200 && r.body.completed && r.body.rewardCoins > 0 && recFor(a.kid).data.coins === r.body.rewardCoins, "assignment reward still pays server-side");

  console.log(fails ? fails + " CURRENCY INTEGRITY TEST FAILURES" : "ALL CURRENCY INTEGRITY TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
