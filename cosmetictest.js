const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const Cosmetics = require("./js/cosmetics.js");
const Ach = require("./js/achievements.js");
const api = require("./lib/number-ninja-api.js");

let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }

const ids = Cosmetics.CATALOG.map(c => c.id);
ck(new Set(ids).size === ids.length, "catalog IDs unique");
ck(Cosmetics.CATALOG.length === 25, "cosmetic catalog size", Cosmetics.CATALOG.length);
Cosmetics.CATALOG.forEach(c => {
  ck(Cosmetics.SLOTS.includes(c.slot), "valid slot " + c.id);
  ck(Cosmetics.CATEGORIES.includes(c.category), "valid category " + c.id);
  ck(["starter","coins","achievement","mastery","streak","assignment","special"].includes(c.unlockType), "valid unlock type " + c.id);
  if(c.unlockType === "coins") ck(c.priceCoins >= 40 && c.priceCoins <= 220, "coin price in range " + c.id);
  if(c.unlockType === "achievement") ck(!!Ach.catalogById()[c.requirement.achievementId], "achievement mapping exists " + c.id);
});

let controls = api.defaultControls("4");
let data = { coins:100, skin:"e:Foxx", owned:["e:Foxx"], effect:"glow", ownedEffects:["glow"] };
let state = Cosmetics.normalizeState(null, data);
ck(state.owned["e:Ninja"] && state.owned["e:Robo"] && state.owned["title:rookie"], "starter cosmetics owned");
ck(state.owned["e:Foxx"] && state.equipped.avatar === "e:Foxx", "legacy owned character imported once");
state = Cosmetics.normalizeState(state, { owned:["e:Wizard"], ownedEffects:["rainbow"], skin:"e:Wizard", effect:"rainbow" });
ck(!state.owned["e:Wizard"] && !state.owned["rainbow"], "server state ignores later forged legacy ownership");

controls = api.defaultControls("4");
controls.skillMastery.bySkill["4.multiMultiply"] = {certified:true};
Ach.evaluate({progress:{topics:{},mastery:{}}}, controls, {now:1000});
Cosmetics.syncUnlocks(controls, {coins:0}, {now:2000});
ck(controls.cosmetics.owned["title:blackbelt"], "achievement unlock sync grants mapped cosmetic");
const historyLen = controls.cosmetics.unlockHistory.length;
Cosmetics.syncUnlocks(controls, {coins:0}, {now:3000});
ck(controls.cosmetics.unlockHistory.length === historyLen, "duplicate sync does not duplicate unlock history");
let pub = Cosmetics.publicSummary(controls.cosmetics, {coins:0});
ck(pub.items.find(i=>i.id==="frame:silentstar").name === "Mystery Unlock", "hidden cosmetic concealed before earning");
controls.skillMastery.history = [{at:1,type:"challenge",skillId:"4.multiMultiply",passed:true,total:6,correct:6}];
Ach.evaluate({progress:{topics:{},mastery:{}}}, controls, {now:4000});
Cosmetics.syncUnlocks(controls, {coins:0}, {now:5000});
pub = Cosmetics.publicSummary(controls.cosmetics, {coins:0});
ck(pub.items.find(i=>i.id==="frame:silentstar").owned && pub.items.find(i=>i.id==="frame:silentstar").name === "Silent Star Frame", "hidden cosmetic revealed after earning");

controls = api.defaultControls("4");
data = { coins:60 };
let bought = Cosmetics.purchase(controls, data, "glow", "req1", {now:1000});
ck(!bought.error && data.coins === 20 && controls.cosmetics.owned.glow, "valid purchase deducts exact catalog price");
bought = Cosmetics.purchase(controls, data, "glow", "req2", {now:2000});
ck(bought.alreadyOwned && data.coins === 20, "second purchase does not deduct");
bought = Cosmetics.purchase(controls, data, "sparkle", "req3", {now:3000});
ck(bought.error === "insufficient_coins", "insufficient funds rejected");
bought = Cosmetics.purchase(controls, data, "title:blackbelt", "req4", {now:4000});
ck(bought.error === "cosmetic_not_purchasable", "achievement-only item cannot be purchased");
bought = Cosmetics.purchase(controls, data, "not-real", "req5", {now:5000});
ck(bought.error === "cosmetic_not_found", "arbitrary item rejected");
data.coins = 100;
bought = Cosmetics.purchase(controls, data, "sparkle", "same", {now:6000});
const coinsAfter = data.coins;
bought = Cosmetics.purchase(controls, data, "fire", "same", {now:7000});
ck(bought.duplicate && data.coins === coinsAfter, "duplicate request ID safe");

let eq = Cosmetics.equip(controls, data, "sparkle", "aura");
ck(!eq.error && controls.cosmetics.equipped.aura === "sparkle" && data.effect === "sparkle", "owned item equips");
eq = Cosmetics.equip(controls, data, "fire", "aura");
ck(eq.error === "cosmetic_not_owned", "unowned equip rejected");
eq = Cosmetics.equip(controls, data, "sparkle", "avatar");
ck(eq.error === "wrong_slot", "wrong slot rejected");
Cosmetics.resetEquipped(controls, data);
ck(controls.cosmetics.equipped.avatar === "e:Ninja" && controls.cosmetics.equipped.aura === "none", "reset defaults equipped");

(async()=>{
  let r;
  await call({action:"register_student", name:"CosKid", pin:"1234", grade:"4"});
  r = await call({action:"coin_earn", name:"CosKid", pin:"1234", localDate:"2026-08-08", eventId:"cos-earn-1", reason:"story_level_complete", stars:3});
  ck(r.status === 200 && r.body.coins === 60, "server reward creates cosmetic spending balance");
  r = await call({action:"save", name:"CosKid", pin:"1234", data:{coins:60, progress:{topics:{},mastery:{}}, owned:["e:Wizard"], ownedEffects:["rainbow"], skin:"e:Wizard", effect:"rainbow", inventory:{freehint:2}}});
  ck(r.status === 200 && r.body.data.coins === 60, "same-balance legacy save preserved");
  ck(!r.body.cosmetics.items.find(i=>i.id==="e:Wizard").owned, "fake ownership save cannot grant catalog cosmetics");
  ck(r.body.data.inventory.freehint === 2, "legacy power inventory still saves");
  r = await call({action:"cosmetic_purchase", name:"CosKid", pin:"1234", cosmeticId:"glow", requestId:"buy1", priceCoins:-100});
  ck(r.status === 400 && r.body.error === "client_catalog_not_allowed", "client supplied price rejected");
  r = await call({action:"cosmetic_purchase", name:"CosKid", pin:"1234", cosmeticId:"glow", requestId:"buy2"});
  ck(r.status === 200 && r.body.coins === 20 && r.body.cosmetics.items.find(i=>i.id==="glow").owned, "purchase API grants ownership and deducts coins");
  r = await call({action:"cosmetic_purchase", name:"CosKid", pin:"1234", cosmeticId:"sparkle", requestId:"buy3"});
  ck(r.status === 409 && r.body.error === "insufficient_coins", "purchase with insufficient canonical coins rejected");
  r = await call({action:"cosmetic_equip", name:"CosKid", pin:"1234", cosmeticId:"glow", slot:"aura"});
  ck(r.status === 200 && r.body.data.effect === "glow", "equip API updates canonical appearance");
  r = await call({action:"cosmetic_equip", name:"CosKid", pin:"1234", cosmeticId:"fire", slot:"aura"});
  ck(r.status === 409 && r.body.error === "cosmetic_not_owned", "equip API rejects unowned item");
  r = await call({action:"cosmetic_purchase", name:"CosKid", pin:"1234", cosmeticId:"title:blackbelt", requestId:"buy4"});
  ck(r.status === 409 && r.body.error === "cosmetic_not_purchasable", "locked achievement item cannot be purchased");
  r = await call({action:"save", name:"CosKid", pin:"1234", data:{coins:999999, progress:{topics:{},mastery:{}}, owned:["e:Wizard"], ownedEffects:["rainbow"], skin:"e:Wizard", effect:"rainbow"}});
  ck(r.status === 200 && r.body.data.coins < 220, "forged coin save cannot enable expensive purchase");
  r = await call({action:"cosmetic_purchase", name:"CosKid", pin:"1234", cosmeticId:"e:Wizard", requestId:"buy5"});
  ck(r.status === 409 && r.body.error === "insufficient_coins", "forged coin value cannot fund purchase");

  await call({action:"register_student", name:"AchCosKid", pin:"1234", grade:"4"});
  const rec = recFor("AchCosKid");
  rec.controls.skillMastery.bySkill["4.multiMultiply"] = {certified:true};
  writeRec("AchCosKid", rec);
  r = await call({action:"achievement_status", name:"AchCosKid", pin:"1234", localDate:"2026-08-08"});
  ck(r.status === 200 && r.body.cosmetics.items.find(i=>i.id==="title:blackbelt").owned, "achievement earning automatically unlocks mapped cosmetic");
  const masteryBefore = JSON.stringify(recFor("AchCosKid").controls.skillMastery);
  r = await call({action:"cosmetic_equip", name:"AchCosKid", pin:"1234", cosmeticId:"title:blackbelt", slot:"title"});
  ck(JSON.stringify(recFor("AchCosKid").controls.skillMastery) === masteryBefore, "cosmetic equip does not affect mastery");

  await call({action:"register_parent", name:"CosParent", pin:"2222"});
  await call({action:"link_child", parentName:"CosParent", parentPin:"2222", childName:"CosKid", childPin:"1234"});
  r = await call({action:"parent_report", parentName:"CosParent", parentPin:"2222", childName:"CosKid", localDate:"2026-08-08"});
  ck(r.status === 200 && r.body.cosmetics && r.body.cosmetics.ownedCount >= 1, "parent report includes cosmetic summary");

  console.log(fails ? fails + " COSMETIC TEST FAILURES" : "ALL COSMETIC TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
