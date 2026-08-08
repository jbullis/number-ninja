/* Number Ninja cosmetic catalog and ownership engine.
 * Pure core: no DOM, no storage.
 */
(function(root){
  "use strict";

  const VERSION = 1;
  const HISTORY_MAX = 80;
  const RECENT_MAX = 10;
  const REQUEST_MAX = 80;
  const RARITIES = ["starter","common","uncommon","rare","legendary"];
  const SLOTS = ["avatar","aura","title","frame","background"];
  const CATEGORIES = ["characters","auras","titles","frames","backgrounds"];
  let CATALOG_ORDER = 0;

  function C(id,name,description,category,slot,rarity,icon,unlockType,priceCoins,requirement,hidden,defaultOwned,visual){
    return { id, name, description, category, slot, rarity, icon, unlockType, priceCoins:priceCoins == null ? null : Number(priceCoins), requirement:requirement || null, hidden:!!hidden, defaultOwned:!!defaultOwned, visual:visual || {}, sort:CATALOG_ORDER++ };
  }

  const CATALOG = [
    C("e:Ninja","Ninja","The classic Number Ninja look.","characters","avatar","starter","N","starter",null,null,false,true,{kind:"emoji",glyph:"N"}),
    C("e:Robo","Robo","A friendly practice robot.","characters","avatar","starter","R","starter",null,null,false,true,{kind:"emoji",glyph:"R"}),
    C("e:Glitch","Glitch","A pixel-pal from the puzzle zone.","characters","avatar","common","G","coins",50,null,false,false,{kind:"emoji",glyph:"G"}),
    C("e:Foxx","Foxx","Quick, bright, and ready to train.","characters","avatar","uncommon","F","coins",80,null,false,false,{kind:"emoji",glyph:"F"}),
    C("e:Drago","Drago","A bold training partner.","characters","avatar","rare","D","coins",120,null,false,false,{kind:"emoji",glyph:"D"}),
    C("e:Rocket","Rocket","Built for launch-speed practice.","characters","avatar","rare","R","coins",160,null,false,false,{kind:"emoji",glyph:"R"}),
    C("e:Wizard","Wizard","A math-magic look for advanced practice.","characters","avatar","rare","W","coins",220,null,false,false,{kind:"emoji",glyph:"W"}),
    C("e:Legend","Legend Crown","A legendary look for major mastery.","characters","avatar","legendary","L","achievement",null,{achievementId:"mastery.10_black_belts",text:"Earn 10 Black Belts"},false,false,{kind:"emoji",glyph:"L"}),

    C("none","No Aura","Keep the classic look.","auras","aura","starter","-","starter",null,null,false,true,{css:"none"}),
    C("glow","Neon Glow","A bright blue practice glow.","auras","aura","common","G","coins",40,null,false,false,{css:"glow"}),
    C("sparkle","Sparkle Aura","A twinkly dojo aura.","auras","aura","common","S","coins",60,null,false,false,{css:"sparkle"}),
    C("fire","Fire Aura","A warm challenge aura.","auras","aura","uncommon","F","coins",80,null,false,false,{css:"fire"}),
    C("rainbow","Rainbow Aura","A colorful victory aura.","auras","aura","rare","R","coins",100,null,false,false,{css:"rainbow"}),
    C("aura:focus","Focus Aura","Unlocked by finishing a training focus.","auras","aura","rare","FOC","achievement",null,{achievementId:"plan.first_remediation_resolved",text:"Finish a training focus"},false,false,{css:"sparkle"}),
    C("aura:advanced","Advanced Aura","Unlocked by completing advanced training.","auras","aura","legendary","ADV","achievement",null,{achievementId:"plan.first_enrichment_resolved",text:"Finish advanced training"},false,false,{css:"rainbow"}),

    C("title:rookie","Rookie Ninja","A starter nameplate title.","titles","title","starter","R","starter",null,null,false,true,{}),
    C("title:quick","Quick Thinker","A sharp practice nameplate.","titles","title","common","QT","coins",40,null,false,false,{}),
    C("title:blackbelt","Black Belt Ninja","Unlocked with your first certified Black Belt.","titles","title","rare","BB","achievement",null,{achievementId:"mastery.first_black_belt",text:"Earn your first Black Belt"},false,false,{}),
    C("title:assignment","Assignment Ace","Unlocked by completing a parent assignment.","titles","title","uncommon","AA","achievement",null,{achievementId:"assignments.first_complete",text:"Complete a parent assignment"},false,false,{}),

    C("frame:none","No Frame","The default profile frame.","frames","frame","starter","-","starter",null,null,false,true,{}),
    C("frame:moon","Moon Frame","A calm silver profile frame.","frames","frame","common","MO","coins",70,null,false,false,{}),
    C("frame:streak10","Ten-Day Frame","Unlocked by a 10-day streak.","frames","frame","rare","10","achievement",null,{achievementId:"streak.10",text:"Reach a 10-day streak"},false,false,{}),
    C("frame:silentstar","Silent Star Frame","A surprise frame for a hidden badge.","frames","frame","legendary","?","achievement",null,{achievementId:"special.perfect_black_belt",text:"Mystery unlock"},true,false,{}),

    C("bg:default","Classic Dojo","The original Number Ninja background.","backgrounds","background","starter","DO","starter",null,null,false,true,{}),
    C("bg:twilight","Twilight Dojo","A quiet practice backdrop.","backgrounds","background","uncommon","TW","coins",90,null,false,false,{})
  ];

  function clone(x){ return JSON.parse(JSON.stringify(x == null ? null : x)); }
  function now(options){ return Number(options && options.now || Date.now()); }
  function idSafe(id){ return String(id || "").replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 80); }
  let byIdCache = null;
  function catalogById(){
    if(!byIdCache) {
      byIdCache = {};
      CATALOG.forEach(c => { byIdCache[c.id] = c; });
    }
    return byIdCache;
  }
  function defaultEquipped(){
    return { avatar:"e:Ninja", aura:"none", title:"title:rookie", frame:"frame:none", background:"bg:default" };
  }
  function newState(){
    return { version:VERSION, owned:{}, equipped:defaultEquipped(), purchaseHistory:[], unlockHistory:[], recentUnlocks:[], recentRequestIds:[] };
  }
  function own(state, id, source, at){
    const item = catalogById()[id];
    if(!item) return false;
    if(state.owned[id]) return false;
    const t = at || Date.now();
    state.owned[id] = { ownedAt:t, source:source || item.unlockType || "system" };
    state.unlockHistory.push({ cosmeticId:id, unlockedAt:t, source:source || item.unlockType || "system" });
    state.unlockHistory = state.unlockHistory.slice(-HISTORY_MAX);
    state.recentUnlocks.push({ cosmeticId:id, unlockedAt:t, source:source || item.unlockType || "system", acknowledgedAt:null });
    state.recentUnlocks = state.recentUnlocks.slice(-RECENT_MAX);
    return true;
  }
  function normalizeState(state, data){
    const hadServerState = !!(state && typeof state === "object" && Number(state.version || 0) >= 1);
    state = state && typeof state === "object" ? clone(state) : {};
    const base = newState();
    Object.assign(base, state);
    base.version = VERSION;
    base.owned = base.owned && typeof base.owned === "object" ? base.owned : {};
    base.equipped = Object.assign(defaultEquipped(), base.equipped || {});
    base.purchaseHistory = Array.isArray(base.purchaseHistory) ? base.purchaseHistory.filter(x => x && catalogById()[x.cosmeticId]).slice(-HISTORY_MAX).map(x => ({
      cosmeticId:x.cosmeticId, coinsSpent:Math.max(0, Number(x.coinsSpent || 0)), purchasedAt:Number(x.purchasedAt || 0), requestId:idSafe(x.requestId)
    })) : [];
    base.unlockHistory = Array.isArray(base.unlockHistory) ? base.unlockHistory.filter(x => x && catalogById()[x.cosmeticId]).slice(-HISTORY_MAX).map(x => ({
      cosmeticId:x.cosmeticId, unlockedAt:Number(x.unlockedAt || 0), source:String(x.source || "system").slice(0, 40)
    })) : [];
    base.recentUnlocks = Array.isArray(base.recentUnlocks) ? base.recentUnlocks.filter(x => x && catalogById()[x.cosmeticId]).slice(-RECENT_MAX).map(x => ({
      cosmeticId:x.cosmeticId, unlockedAt:Number(x.unlockedAt || 0), source:String(x.source || "system").slice(0, 40), acknowledgedAt:Number(x.acknowledgedAt || 0) || null
    })) : [];
    base.recentRequestIds = Array.isArray(base.recentRequestIds) ? base.recentRequestIds.map(idSafe).filter(Boolean).slice(-REQUEST_MAX) : [];

    CATALOG.filter(c => c.defaultOwned || c.unlockType === "starter").forEach(c => {
      if(!base.owned[c.id]) base.owned[c.id] = { ownedAt:0, source:"starter" };
    });
    const d = data || {};
    if(!hadServerState) {
      (Array.isArray(d.owned) ? d.owned : []).forEach(id => { if(catalogById()[String(id)] && !base.owned[String(id)]) base.owned[String(id)] = { ownedAt:0, source:"legacy" }; });
      (Array.isArray(d.ownedEffects) ? d.ownedEffects : []).forEach(id => { if(catalogById()[String(id)] && !base.owned[String(id)]) base.owned[String(id)] = { ownedAt:0, source:"legacy" }; });
      if(catalogById()[d.skin] && base.owned[d.skin]) base.equipped.avatar = d.skin;
      if(catalogById()[d.effect] && base.owned[d.effect]) base.equipped.aura = d.effect;
    }
    SLOTS.forEach(slot => {
      const item = catalogById()[base.equipped[slot]];
      if(!item || item.slot !== slot || !base.owned[item.id]) base.equipped[slot] = defaultEquipped()[slot];
    });
    return base;
  }
  function ensureControls(controls, data){
    controls = controls || {};
    controls.cosmetics = normalizeState(controls.cosmetics, data || null);
    return controls;
  }
  function achievementEarned(controls, achievementId){
    return !!(controls && controls.achievements && controls.achievements.earned && controls.achievements.earned[achievementId]);
  }
  function syncUnlocks(controls, data, options){
    ensureControls(controls, data);
    const state = controls.cosmetics;
    const at = now(options);
    CATALOG.forEach(item => {
      if(item.unlockType === "achievement" && item.requirement && achievementEarned(controls, item.requirement.achievementId)) {
        own(state, item.id, "achievement", at);
      }
    });
    controls.cosmetics = normalizeState(state, data);
    return controls.cosmetics;
  }
  function seenRequest(state, requestId){
    requestId = idSafe(requestId);
    if(!requestId) return {error:"request_required"};
    if(state.recentRequestIds.includes(requestId)) return {duplicate:true};
    state.recentRequestIds.push(requestId);
    state.recentRequestIds = state.recentRequestIds.slice(-REQUEST_MAX);
    return {duplicate:false, requestId};
  }
  function purchase(controls, data, cosmeticId, requestId, options){
    ensureControls(controls, data);
    data = data || {};
    const state = controls.cosmetics;
    const req = seenRequest(state, requestId);
    if(req.error) return {error:req.error};
    const item = catalogById()[cosmeticId];
    if(!item) return {error:"cosmetic_not_found"};
    if(req.duplicate) return {duplicate:true, alreadyOwned:!!state.owned[item.id], state, item};
    if(state.owned[item.id]) return {alreadyOwned:true, state, item, coins:data.coins || 0};
    if(item.unlockType !== "coins") return {error:"cosmetic_not_purchasable"};
    const price = Math.max(0, Number(item.priceCoins || 0));
    const coins = Math.max(0, Number(data.coins || 0));
    if(coins < price) return {error:"insufficient_coins"};
    data.coins = coins - price;
    own(state, item.id, "purchase", now(options));
    state.purchaseHistory.push({ cosmeticId:item.id, coinsSpent:price, purchasedAt:now(options), requestId:req.requestId });
    state.purchaseHistory = state.purchaseHistory.slice(-HISTORY_MAX);
    controls.cosmetics = normalizeState(state, data);
    return {state:controls.cosmetics, item, coins:data.coins, coinsSpent:price};
  }
  function equip(controls, data, cosmeticId, slot){
    ensureControls(controls, data);
    data = data || {};
    const state = controls.cosmetics;
    const item = catalogById()[cosmeticId];
    if(!item) return {error:"cosmetic_not_found"};
    if(slot && item.slot !== String(slot)) return {error:"wrong_slot"};
    if(!state.owned[item.id]) return {error:"cosmetic_not_owned"};
    state.equipped[item.slot] = item.id;
    if(item.slot === "avatar") data.skin = item.id;
    if(item.slot === "aura") data.effect = item.id;
    controls.cosmetics = normalizeState(state, data);
    return {state:controls.cosmetics, item};
  }
  function resetEquipped(controls, data){
    ensureControls(controls, data);
    data = data || {};
    controls.cosmetics.equipped = defaultEquipped();
    data.skin = "e:Ninja";
    data.effect = "none";
    return controls.cosmetics;
  }
  function publicItem(item, state, data){
    const owned = !!state.owned[item.id];
    const achievementLocked = item.unlockType === "achievement" && !owned;
    if(item.hidden && achievementLocked) {
      return { id:item.id, name:"Mystery Unlock", description:"Keep training to discover this cosmetic.", category:item.category, slot:item.slot, rarity:item.rarity, icon:"?", hidden:true, owned:false, equipped:false, unlockType:"achievement", priceCoins:null, requirementText:"Mystery unlock", affordable:false };
    }
    return {
      id:item.id, name:item.name, description:item.description, category:item.category, slot:item.slot, rarity:item.rarity, icon:item.icon,
      hidden:!!item.hidden, owned, equipped:state.equipped[item.slot] === item.id, unlockType:item.unlockType,
      priceCoins:item.priceCoins, requirementText:item.requirement && item.requirement.text || null,
      affordable:item.unlockType === "coins" && Number(data && data.coins || 0) >= Number(item.priceCoins || 0),
      visual:item.visual
    };
  }
  function publicSummary(state, data){
    const s = normalizeState(state, data);
    return {
      version:VERSION,
      coins:Number(data && data.coins || 0),
      ownedCount:Object.keys(s.owned).length,
      totalCount:CATALOG.length,
      categories:CATEGORIES.slice(),
      slots:SLOTS.slice(),
      rarities:RARITIES.slice(),
      equipped:clone(s.equipped),
      items:CATALOG.map(item => publicItem(item, s, data || null)),
      recentUnlocks:s.recentUnlocks.filter(x => !x.acknowledgedAt).map(x => {
        const item = catalogById()[x.cosmeticId];
        return Object.assign({ unlockedAt:x.unlockedAt, source:x.source }, publicItem(item, s, data || null));
      }),
      purchaseHistory:s.purchaseHistory.slice(-10),
      unlockHistory:s.unlockHistory.slice(-10)
    };
  }
  function markRecentSeen(state, at){
    const s = normalizeState(state);
    const t = at || Date.now();
    s.recentUnlocks.forEach(x => { if(!x.acknowledgedAt) x.acknowledgedAt = t; });
    return normalizeState(s);
  }

  const api = {
    VERSION, HISTORY_MAX, RECENT_MAX, REQUEST_MAX, RARITIES, SLOTS, CATEGORIES, CATALOG,
    newState, normalizeState, ensureControls, catalogById, syncUnlocks, purchase, equip,
    resetEquipped, publicSummary, markRecentSeen
  };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_COSMETICS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
