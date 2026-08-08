/* Number Ninja achievement and badge engine.
 * Pure core: catalog, normalization, evaluation, public summaries.
 */
(function(root){
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./curriculum.js") : root.NINJA_CURRICULUM;

  const VERSION = 1;
  const HISTORY_MAX = 100;
  const RECENT_MAX = 12;
  const PROCESSED_MAX = 200;
  const TIERS = ["bronze","silver","gold","legendary"];
  const CATEGORIES = ["practice","mastery","goals","streak","assignments","learning-plan","exploration","accuracy","special"];
  let CATALOG_ORDER = 0;

  const CATALOG = [
    A("practice.first_problem","First Problem","Finish your first math problem.","First problem","practice","bronze","*",false,"problems",1),
    A("practice.25","Steady Steps","Finish 25 practice problems.","25 problems","practice","bronze","25",false,"problems",25),
    A("practice.100","Hundred Strike","Finish 100 practice problems.","100 problems","practice","silver","100",false,"problems",100),
    A("practice.500","Training Hero","Finish 500 practice problems.","500 problems","practice","gold","500",false,"problems",500),
    A("practice.1000","Thousand Star Ninja","Finish 1,000 practice problems.","1,000 problems","practice","legendary","1K",false,"problems",1000),

    A("accuracy.strong_20","Sharp Start","Show strong accuracy across 20 or more problems.","Strong accuracy","accuracy","silver","90%",false,"strong20",1),
    A("accuracy.strong_100","Precision Pro","Keep strong accuracy across 100 or more problems.","Accurate practice","accuracy","gold","85%",false,"strong100",1),
    A("accuracy.clean_assignment","Careful Assignment","Complete an assignment with an accuracy goal.","Accuracy assignment","accuracy","silver","OK",false,"accuracyAssignmentsCompleted",1),

    A("mastery.first_black_belt","First Black Belt","Certify your first skill as a Black Belt.","First Black Belt","mastery","silver","BB",false,"blackBelts",1),
    A("mastery.5_black_belts","Black Belt Five","Certify 5 skills as Black Belts.","5 Black Belts","mastery","gold","5BB",false,"blackBelts",5),
    A("mastery.10_black_belts","Black Belt Ten","Certify 10 skills as Black Belts.","10 Black Belts","mastery","legendary","10B",false,"blackBelts",10),
    A("mastery.domain_black_belts_3","Across the Dojo","Earn Black Belts in 3 different math groups.","3 groups certified","mastery","gold","3G",false,"blackBeltGroups",3),
    A("mastery.first_review_pass","Still Sharp","Pass your first Black Belt review.","First review passed","mastery","silver","RV",false,"totalMasteryReviewsPassed",1),

    A("goals.first_daily_goal","Daily Goal Done","Complete your first scheduled daily goal.","First goal","goals","bronze","DG",false,"completedScheduledDays",1),
    A("goals.5_scheduled","Goal Builder","Complete 5 scheduled goal days.","5 goal days","goals","silver","5D",false,"completedScheduledDays",5),
    A("goals.first_grace_earned","Grace Day Ready","Earn your first grace day by staying consistent.","First grace day","goals","silver","GD",false,"totalGraceEarned",1),

    A("streak.10","Ten-Day Focus","Reach a 10-day scheduled-goal streak.","10-day streak","streak","gold","10",false,"longestStreak",10),
    A("streak.25","Streak Master","Reach a 25-day scheduled-goal streak.","25-day streak","streak","legendary","25",false,"longestStreak",25),
    A("streak.grace_protected","Streak Saver","Keep a streak protected with a grace day.","Grace protected","streak","silver","SAVE",false,"totalGraceUsed",1),

    A("assignments.first_complete","Assignment Complete","Complete your first parent assignment.","First assignment","assignments","bronze","ASG",false,"totalAssignmentsCompleted",1),
    A("assignments.5_complete","Assignment Finisher","Complete 5 assignment occurrences.","5 assignments","assignments","silver","5A",false,"totalAssignmentsCompleted",5),
    A("assignments.recurring_complete","Repeat Ready","Complete a recurring assignment occurrence.","Recurring assignment","assignments","silver","REP",false,"recurringAssignmentsCompleted",1),

    A("plan.first_remediation_resolved","Training Focus Finished","Finish your first system training focus.","Focus finished","learning-plan","silver","FOC",false,"totalRemediationsResolved",1),
    A("plan.3_remediations_resolved","Focus Finisher","Resolve 3 system training focuses.","3 focuses","learning-plan","gold","3F",false,"totalRemediationsResolved",3),
    A("plan.first_enrichment_resolved","Advanced Step","Finish your first advanced training target.","Advanced target","learning-plan","gold","ADV",false,"totalEnrichmentsResolved",1),

    A("exploration.3_groups","Math Explorer","Practice skills from 3 different math groups.","3 math groups","exploration","silver","MAP",false,"groupsPracticed",3),
    A("exploration.3_grades","Trailblazer","Practice across 3 grade bands you have access to.","Across grades","exploration","gold","???",true,"gradesPracticed",3),
    A("exploration.workbook_and_arena","Two Paths","Use both Workbook Quest and Practice Arena.","Two paths","exploration","bronze","???",true,"workbookAndArena",1),

    A("special.perfect_black_belt","Silent Star","Complete a Black Belt challenge without missing.","Perfect challenge","special","legendary","???",true,"perfectChallengeCount",1),
  ];

  function A(id,title,description,shortDescription,category,tier,icon,hidden,rule,target){
    return { id, title, description, shortDescription, category, tier, icon, hidden:!!hidden, repeatable:false, target:target || 1, reward:{coins:0, cosmeticId:null}, rule, sort:CATALOG_ORDER++ };
  }
  // Re-assign sort after construction because A uses the incrementing value.
  CATALOG.forEach((a,i) => { a.sort = i; });
  const COSMETIC_REWARDS = {
    "mastery.first_black_belt":"title:blackbelt",
    "mastery.10_black_belts":"e:Legend",
    "streak.10":"frame:streak10",
    "assignments.first_complete":"title:assignment",
    "plan.first_remediation_resolved":"aura:focus",
    "plan.first_enrichment_resolved":"aura:advanced",
    "special.perfect_black_belt":"frame:silentstar"
  };
  CATALOG.forEach(a => {
    if(COSMETIC_REWARDS[a.id]) a.reward = { coins:0, cosmeticId:COSMETIC_REWARDS[a.id] };
  });

  function clone(x){ return JSON.parse(JSON.stringify(x == null ? null : x)); }
  function now(options){ return Number(options && options.now || Date.now()); }
  function cleanId(id){ return String(id || "").replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 120); }
  function newState(){
    return { version:VERSION, earned:{}, counters:{ processedEvents:[] }, recentAwards:[], history:[] };
  }
  function normalizeEarned(e){
    e = e && typeof e === "object" ? e : {};
    const out = {};
    Object.keys(e).forEach(id => {
      if(!catalogById()[id]) return;
      const x = e[id] || {};
      out[id] = {
        earnedAt:Number(x.earnedAt || x.firstEarnedAt || 0),
        firstEarnedAt:Number(x.firstEarnedAt || x.earnedAt || 0),
        lastEarnedAt:Number(x.lastEarnedAt || x.earnedAt || x.firstEarnedAt || 0),
        count:Math.max(1, Number(x.count || 1)),
      };
    });
    return out;
  }
  function normalizeState(state){
    state = state && typeof state === "object" ? clone(state) : {};
    const base = newState();
    Object.assign(base, state);
    base.version = VERSION;
    base.earned = normalizeEarned(base.earned);
    base.counters = base.counters && typeof base.counters === "object" ? base.counters : {};
    base.counters.processedEvents = Array.isArray(base.counters.processedEvents) ? base.counters.processedEvents.map(cleanId).filter(Boolean).slice(-PROCESSED_MAX) : [];
    ["totalAssignmentsCompleted","accuracyAssignmentsCompleted","recurringAssignmentsCompleted","totalMasteryReviewsPassed","totalRemediationsResolved","totalEnrichmentsResolved","perfectChallengeCount"].forEach(k => {
      base.counters[k] = Math.max(0, Number(base.counters[k] || 0));
    });
    base.recentAwards = Array.isArray(base.recentAwards) ? base.recentAwards.filter(x => x && catalogById()[x.achievementId]).slice(-RECENT_MAX).map(x => ({
      achievementId:x.achievementId,
      earnedAt:Number(x.earnedAt || 0),
      acknowledgedAt:Number(x.acknowledgedAt || 0) || null,
    })) : [];
    base.history = Array.isArray(base.history) ? base.history.filter(x => x && catalogById()[x.achievementId]).slice(-HISTORY_MAX).map(x => ({
      achievementId:x.achievementId,
      earnedAt:Number(x.earnedAt || 0),
      count:Number(x.count || 1),
    })) : [];
    return base;
  }
  function ensureControls(controls){
    controls = controls || {};
    controls.achievements = normalizeState(controls.achievements);
    return controls;
  }
  let byIdCache = null;
  function catalogById(){
    if(!byIdCache) {
      byIdCache = {};
      CATALOG.forEach(a => { byIdCache[a.id] = a; });
    }
    return byIdCache;
  }
  function progressFor(data){ return data && data.progress || {}; }
  function topicEvidence(data, skillId){
    const t = (progressFor(data).topics || {})[skillId] || {};
    const solved = Number(t.solved || 0), wrongs = Number(t.wrongs || 0), attempts = solved + wrongs;
    return { solved, wrongs, attempts, accuracy:attempts ? solved / attempts : 0 };
  }
  function allTopicAttempts(data){
    let attempted = 0, correct = 0, first = 0;
    Object.keys(progressFor(data).topics || {}).forEach(id => {
      const ev = topicEvidence(data, id);
      attempted += ev.attempts;
      correct += ev.solved;
      first += Number((progressFor(data).topics || {})[id].first || 0);
    });
    const statsCorrect = Number(data && data.stats && data.stats.totalCorrect || 0);
    correct = Math.max(correct, statsCorrect);
    attempted = Math.max(attempted, correct);
    return { attempted, correct, first, accuracy:attempted ? correct / attempted : 0 };
  }
  function eventSeen(state, key){
    key = cleanId(key);
    if(!key) return true;
    if(state.counters.processedEvents.includes(key)) return true;
    state.counters.processedEvents.push(key);
    state.counters.processedEvents = state.counters.processedEvents.slice(-PROCESSED_MAX);
    return false;
  }
  function updateCountersFromEvents(state, controls){
    controls = controls || {};
    (controls.skillMastery && controls.skillMastery.history || []).forEach(e => {
      if(!e || !e.type || !e.skillId) return;
      const key = "mastery:" + e.type + ":" + e.skillId + ":" + Number(e.at || 0) + ":" + Number(e.total || 0) + ":" + Number(e.correct || 0);
      if(eventSeen(state, key)) return;
      if(e.type === "review" && e.passed) state.counters.totalMasteryReviewsPassed++;
      if(e.type === "challenge" && e.passed && Number(e.total || 0) > 0 && Number(e.correct || 0) === Number(e.total || 0)) state.counters.perfectChallengeCount++;
    });
    (controls.learningPlan && controls.learningPlan.history || []).forEach(e => {
      if(!e || !e.type || !e.skillId) return;
      const key = "plan:" + e.type + ":" + (e.itemId || "") + ":" + e.skillId + ":" + Number(e.at || 0);
      if(eventSeen(state, key)) return;
      if(e.type === "remediation_resolved") state.counters.totalRemediationsResolved++;
      if(e.type === "enrichment_resolved") state.counters.totalEnrichmentsResolved++;
    });
    (Array.isArray(controls.assignments) ? controls.assignments : []).forEach(a => {
      (a && a.occurrences && a.occurrences.recentOccurrences || []).forEach(o => {
        if(!o || !o.completed || !o.date) return;
        const key = "assignment:" + a.id + ":" + o.date;
        if(eventSeen(state, key)) return;
        state.counters.totalAssignmentsCompleted++;
        if(a.minimumAccuracy != null) state.counters.accuracyAssignmentsCompleted++;
        if(a.schedule === "weekdays") state.counters.recurringAssignmentsCompleted++;
      });
      if(a && a.status === "completed" && a.schedule === "once" && a.occurrences && a.occurrences.lastCompletedDate) {
        const key = "assignment:" + a.id + ":" + a.occurrences.lastCompletedDate;
        if(!eventSeen(state, key)) {
          state.counters.totalAssignmentsCompleted++;
          if(a.minimumAccuracy != null) state.counters.accuracyAssignmentsCompleted++;
        }
      }
    });
  }
  function skillGroups(ids){
    const out = {};
    ids.forEach(id => {
      const s = C.BY_ID[id];
      if(s) out[s.grade + ":" + s.group] = true;
    });
    return Object.keys(out);
  }
  function metrics(data, controls){
    data = data || {};
    controls = controls || {};
    const totals = allTopicAttempts(data);
    const topicIds = Object.keys(progressFor(data).topics || {}).filter(id => topicEvidence(data, id).attempts > 0);
    const masteryBySkill = controls.skillMastery && controls.skillMastery.bySkill || {};
    const certifiedIds = Object.keys(masteryBySkill).filter(id => masteryBySkill[id] && masteryBySkill[id].certified);
    const daily = controls.dailyActivity || {};
    const sessions = progressFor(data).sessions || [];
    const solvedWb = Object.keys(progressFor(data).solved || {}).length;
    const arenaSessions = sessions.filter(s => s && s.w && s.w !== "mix").length;
    const counters = normalizeState(controls.achievements).counters;
    return Object.assign({}, counters, {
      problems:totals.attempted,
      totalCorrect:totals.correct,
      aggregateAccuracy:totals.accuracy,
      strong20:totals.attempted >= 20 && totals.accuracy >= 0.90 ? 1 : 0,
      strong100:totals.attempted >= 100 && totals.accuracy >= 0.85 ? 1 : 0,
      blackBelts:certifiedIds.length,
      blackBeltGroups:skillGroups(certifiedIds).length,
      completedScheduledDays:Number(daily.completedScheduledDays || 0),
      longestStreak:Number(daily.longestStreak || 0),
      totalGraceEarned:Number(daily.totalGraceEarned || 0),
      totalGraceUsed:Number(daily.totalGraceUsed || 0),
      groupsPracticed:skillGroups(topicIds).length,
      gradesPracticed:Array.from(new Set(topicIds.map(id => C.BY_ID[id] && C.BY_ID[id].grade).filter(Boolean))).length,
      workbookAndArena:(solvedWb > 0 && arenaSessions > 0) ? 1 : 0,
    });
  }
  function valueForRule(m, rule){
    return Number(m[rule] || 0);
  }
  function isEarned(a, m){
    return valueForRule(m, a.rule) >= Number(a.target || 1);
  }
  function award(state, a, at){
    if(state.earned[a.id] && !a.repeatable) return false;
    const existing = state.earned[a.id];
    const count = existing ? Number(existing.count || 1) + 1 : 1;
    state.earned[a.id] = {
      earnedAt:existing ? existing.earnedAt : at,
      firstEarnedAt:existing ? existing.firstEarnedAt : at,
      lastEarnedAt:at,
      count,
    };
    state.history.push({ achievementId:a.id, earnedAt:at, count });
    state.history = state.history.slice(-HISTORY_MAX);
    state.recentAwards.push({ achievementId:a.id, earnedAt:at, acknowledgedAt:null });
    state.recentAwards = state.recentAwards.slice(-RECENT_MAX);
    return true;
  }
  function evaluate(data, controls, options){
    ensureControls(controls);
    const at = now(options);
    const state = normalizeState(controls.achievements);
    updateCountersFromEvents(state, controls);
    controls.achievements = state;
    const m = metrics(data, controls);
    CATALOG.forEach(a => {
      if(!state.earned[a.id] && isEarned(a, m)) award(state, a, at);
    });
    controls.achievements = normalizeState(state);
    return controls.achievements;
  }
  function progress(a, m){
    const value = Math.max(0, valueForRule(m, a.rule));
    const target = Number(a.target || 1);
    return { value:Math.min(value, target), target, percent:target ? Math.max(0, Math.min(100, Math.round(value / target * 100))) : 0 };
  }
  function publicAchievement(a, state, m){
    const earned = !!state.earned[a.id];
    if(a.hidden && !earned) {
      return { id:a.id, title:"???", description:"Keep training to discover this badge.", shortDescription:"Mystery badge", category:a.category, tier:a.tier, icon:"?", hidden:true, earned:false, progress:null };
    }
    return {
      id:a.id,
      title:a.title,
      description:a.description,
      shortDescription:a.shortDescription,
      category:a.category,
      tier:a.tier,
      icon:a.icon,
      hidden:!!a.hidden,
      earned,
      earnedAt:earned ? state.earned[a.id].earnedAt : null,
      progress:earned ? { value:a.target, target:a.target, percent:100 } : progress(a, m),
      reward:a.reward || { coins:0, cosmeticId:null },
    };
  }
  function publicSummary(state, data, controls){
    const s = normalizeState(state);
    const m = metrics(data || null, controls || {});
    const achievements = CATALOG.map(a => publicAchievement(a, s, m));
    const recentAwards = s.recentAwards.filter(x => !x.acknowledgedAt).map(x => {
      const a = catalogById()[x.achievementId];
      return Object.assign({ earnedAt:x.earnedAt }, publicAchievement(a, s, m));
    });
    return {
      version:VERSION,
      earnedCount:Object.keys(s.earned).length,
      totalCount:CATALOG.length,
      hiddenCount:CATALOG.filter(a => a.hidden).length,
      categories:CATEGORIES.slice(),
      tiers:TIERS.slice(),
      recentAwards,
      achievements,
      history:s.history.slice(-20).map(x => ({ achievementId:x.achievementId, earnedAt:x.earnedAt })),
    };
  }
  function markRecentSeen(state, at){
    const s = normalizeState(state);
    const t = at || Date.now();
    s.recentAwards.forEach(x => { if(!x.acknowledgedAt) x.acknowledgedAt = t; });
    return normalizeState(s);
  }

  const api = {
    VERSION, HISTORY_MAX, RECENT_MAX, PROCESSED_MAX, TIERS, CATEGORIES, CATALOG,
    newState, normalizeState, ensureControls, metrics, updateCountersFromEvents,
    evaluate, publicSummary, markRecentSeen, catalogById,
  };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_ACHIEVEMENTS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
