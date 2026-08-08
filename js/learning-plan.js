/* Number Ninja persistent system learning plan.
 * Pure core: no DOM, no storage.
 */
(function(root){
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./curriculum.js") : root.NINJA_CURRICULUM;

  const VERSION = 1;
  const LIMITS = {
    maxActiveRemediation:3,
    maxActiveEnrichment:2,
    maxHistory:50,
  };
  const REMEDIATION_ENTRY_ATTEMPTS = 5;
  const REMEDIATION_ENTRY_ACCURACY = 0.65;
  const REMEDIATION_EXIT_ATTEMPTS = 8;
  const REMEDIATION_EXIT_ACCURACY = 0.75;
  const REMEDIATION_EXIT_MASTERY = 80;
  const PREREQ_BLOCK_MASTERY = 60;
  const ENRICHMENT_MASTERY = 90;
  const ENRICHMENT_EVIDENCE = 8;
  const ENRICHMENT_RESOLVE_MASTERY = 80;

  function clone(x){ return JSON.parse(JSON.stringify(x || null)); }
  function now(options){ return Number(options && options.now || Date.now()); }
  function progressFor(data){ return data && data.progress || {}; }
  function masteryMap(data){ return progressFor(data).mastery || {}; }
  function topicEvidence(data, skillId){
    const t = (progressFor(data).topics || {})[skillId] || {};
    const solved = Number(t.solved || 0), wrongs = Number(t.wrongs || 0), attempts = solved + wrongs;
    return {solved, wrongs, attempts, accuracy:attempts ? solved / attempts : null};
  }
  function skillMasteryState(controls, skillId){
    return controls && controls.skillMastery && controls.skillMastery.bySkill && controls.skillMastery.bySkill[skillId] || {};
  }
  function strongSkill(data, controls, skillId){
    const st = skillMasteryState(controls, skillId);
    if(st.certified && !st.needsReview) return true;
    const m = Number(masteryMap(data)[skillId] || 0);
    const ev = topicEvidence(data, skillId);
    return m >= ENRICHMENT_MASTERY && ev.attempts >= ENRICHMENT_EVIDENCE && (ev.accuracy == null || ev.accuracy >= REMEDIATION_EXIT_ACCURACY);
  }
  function itemId(type, skillId, relatedSkillId){
    return ["sys", type, skillId, relatedSkillId || "none"].join(":").replace(/[^a-zA-Z0-9:._-]/g, "");
  }
  function normalizeItem(x){
    x = x && typeof x === "object" ? x : {};
    const type = x.type === "enrichment" ? "enrichment" : "remediation";
    const skillId = C.BY_ID[x.skillId] ? x.skillId : "";
    const relatedSkillId = C.BY_ID[x.relatedSkillId] ? x.relatedSkillId : null;
    const status = ["active","resolved","replaced","dismissed"].includes(x.status) ? x.status : "active";
    return {
      id:String(x.id || itemId(type, skillId, relatedSkillId)),
      type, skillId, relatedSkillId,
      reasonCode:String(x.reasonCode || ""),
      reasonText:String(x.reasonText || "").slice(0, 180),
      createdAt:Number(x.createdAt || 0),
      updatedAt:Number(x.updatedAt || x.createdAt || 0),
      status,
      evidence:x.evidence && typeof x.evidence === "object" ? clone(x.evidence) : {},
      target:x.target && typeof x.target === "object" ? clone(x.target) : {},
      resolvedAt:Number(x.resolvedAt || 0) || null,
    };
  }
  function normalizePlan(plan){
    plan = plan && typeof plan === "object" ? plan : {};
    const items = (Array.isArray(plan.items) ? plan.items : []).map(normalizeItem).filter(x => x.skillId);
    const seen = new Set();
    return {
      version:VERSION,
      items:items.filter(x => {
        if(seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      }).slice(-30),
      history:(Array.isArray(plan.history) ? plan.history : []).filter(e => e && e.type && e.skillId).slice(-LIMITS.maxHistory).map(e => ({
        at:Number(e.at || 0),
        type:String(e.type).slice(0, 40),
        skillId:String(e.skillId || ""),
        relatedSkillId:e.relatedSkillId ? String(e.relatedSkillId) : null,
        itemId:String(e.itemId || ""),
        reasonCode:String(e.reasonCode || ""),
      })),
    };
  }
  function activeItems(plan, type){
    const p = normalizePlan(plan);
    return p.items.filter(x => x.status === "active" && (!type || x.type === type));
  }
  function publicPlan(plan){
    const p = normalizePlan(plan);
    return {
      version:p.version,
      items:p.items.map(x => {
        const s = C.BY_ID[x.skillId], r = x.relatedSkillId && C.BY_ID[x.relatedSkillId];
        return Object.assign({}, x, {
          skillLabel:s ? s.label : x.skillId,
          skillGrade:s ? s.grade : "",
          relatedSkillLabel:r ? r.label : null,
          relatedSkillGrade:r ? r.grade : null,
        });
      }),
      history:p.history.slice(-10),
    };
  }
  function evidenceSnapshot(data, controls, skillId, relatedSkillId){
    const ev = topicEvidence(data, skillId), m = Number(masteryMap(data)[skillId] || 0), st = skillMasteryState(controls, skillId);
    const snap = { mastery:m, attempts:ev.attempts, correct:ev.solved, wrongs:ev.wrongs, accuracy:ev.accuracy == null ? null : Math.round(ev.accuracy * 100) / 100, certified:!!st.certified, needsReview:!!st.needsReview };
    if(relatedSkillId) snap.relatedSkillId = relatedSkillId;
    return snap;
  }
  function remediationCandidateFromEvidence(data, controls){
    const out = [];
    Object.keys(progressFor(data).topics || {}).forEach(id => {
      const skill = C.BY_ID[id], st = skillMasteryState(controls, id);
      if(!skill || (st.certified && st.needsReview)) return;
      if(st.certified && !st.needsReview) return;
      const ev = topicEvidence(data, id);
      if(ev.attempts >= REMEDIATION_ENTRY_ATTEMPTS && ev.accuracy != null && ev.accuracy < REMEDIATION_ENTRY_ACCURACY) {
        out.push({
          type:"remediation",
          skillId:id,
          relatedSkillId:null,
          reasonCode:"low_accuracy",
          reasonText:"A little more practice here will make the next skill easier.",
          evidence:evidenceSnapshot(data, controls, id),
          target:{ masteryAtLeast:REMEDIATION_EXIT_MASTERY, accuracyAtLeast:REMEDIATION_EXIT_ACCURACY, attemptsAtLeast:REMEDIATION_EXIT_ATTEMPTS },
          rank:ev.accuracy + C.GRADE_INDEX[skill.grade] / 100,
        });
      }
    });
    return out;
  }
  function remediationCandidateFromPrereqs(data, controls){
    const out = [];
    const mastery = masteryMap(data), homeGrade = controls.homeGrade || "4";
    const homeIdx = C.GRADE_INDEX[homeGrade] == null ? C.GRADE_INDEX["4"] : C.GRADE_INDEX[homeGrade];
    C.SKILLS.filter(s => C.GRADE_INDEX[s.grade] >= homeIdx && C.GRADE_INDEX[s.grade] <= Math.min(C.GRADES.length - 1, homeIdx + 1)).forEach(skill => {
      const skillEv = topicEvidence(data, skill.id);
      if(skillEv.attempts < 3) return;
      (skill.prereqs || []).forEach(pid => {
        const p = C.BY_ID[pid], st = skillMasteryState(controls, pid);
        if(!p || (st.certified && st.needsReview) || (st.certified && !st.needsReview)) return;
        const pm = Number(mastery[pid] || 0), ev = topicEvidence(data, pid);
        if(pm < PREREQ_BLOCK_MASTERY || (ev.attempts >= REMEDIATION_ENTRY_ATTEMPTS && ev.accuracy != null && ev.accuracy < 0.70)) {
          out.push({
            type:"remediation",
            skillId:pid,
            relatedSkillId:skill.id,
            reasonCode:"prerequisite_blocker",
            reasonText:"Build this skill to make " + skill.label + " easier.",
            evidence:evidenceSnapshot(data, controls, pid, skill.id),
            target:{ masteryAtLeast:REMEDIATION_EXIT_MASTERY, accuracyAtLeast:REMEDIATION_EXIT_ACCURACY, attemptsAtLeast:REMEDIATION_EXIT_ATTEMPTS },
            rank:pm / 100 + C.GRADE_INDEX[p.grade] / 100,
          });
        }
      });
    });
    return out;
  }
  function placementEnrichmentIds(controls){
    const ids = {};
    const p = controls && controls.placement || {};
    (p.recommendations || []).forEach(r => {
      if(r && r.recommendedOverride === "unlocked" && C.BY_ID[r.skillId]) ids[r.skillId] = true;
    });
    return ids;
  }
  function enrichmentCandidates(data, controls){
    if(controls.allowAboveGrade === false) return [];
    const mastery = masteryMap(data), homeGrade = controls.homeGrade || "4";
    const homeIdx = C.GRADE_INDEX[homeGrade] == null ? C.GRADE_INDEX["4"] : C.GRADE_INDEX[homeGrade];
    const placement = placementEnrichmentIds(controls);
    const strongHome = C.SKILLS.filter(s => C.GRADE_INDEX[s.grade] === homeIdx && strongSkill(data, controls, s.id)).length;
    return C.SKILLS.filter(s => C.GRADE_INDEX[s.grade] > homeIdx).filter(s => {
      if(Number(mastery[s.id] || 0) >= ENRICHMENT_RESOLVE_MASTERY || skillMasteryState(controls, s.id).certified) return false;
      const state = C.skillState(s.id, mastery, controls.skillOverrides || {}, controls);
      if(state.state !== "unlocked") return false;
      if(!(s.prereqs || []).every(pid => strongSkill(data, controls, pid))) return false;
      return strongHome >= (placement[s.id] ? 1 : 2);
    }).map(s => ({
      type:"enrichment",
      skillId:s.id,
      relatedSkillId:null,
      reasonCode:placement[s.id] ? "placement_supported_readiness" : "sustained_readiness",
      reasonText:"You've shown you're ready to try a harder skill.",
      evidence:evidenceSnapshot(data, controls, s.id),
      target:{ masteryAtLeast:ENRICHMENT_RESOLVE_MASTERY, certified:true },
      rank:C.GRADE_INDEX[s.grade] + Number(mastery[s.id] || 0) / 100,
    }));
  }
  function isResolved(item, data, controls){
    const st = skillMasteryState(controls, item.skillId);
    if(item.type === "enrichment") {
      if(controls.allowAboveGrade === false) return {resolved:true, status:"replaced", reasonCode:"parent_disabled_future_enrichment"};
      return {resolved:!!st.certified || Number(masteryMap(data)[item.skillId] || 0) >= ENRICHMENT_RESOLVE_MASTERY, status:"resolved", reasonCode:"enrichment_mastered"};
    }
    if(st.certified && st.needsReview) return {resolved:true, status:"resolved", reasonCode:"handled_by_needs_review"};
    if(st.certified && !st.needsReview) return {resolved:true, status:"resolved", reasonCode:"skill_certified"};
    const ev = topicEvidence(data, item.skillId);
    const mastery = Number(masteryMap(data)[item.skillId] || 0);
    const accuracyReady = ev.attempts >= REMEDIATION_EXIT_ATTEMPTS && ev.accuracy != null && ev.accuracy >= REMEDIATION_EXIT_ACCURACY;
    return {resolved:mastery >= REMEDIATION_EXIT_MASTERY || accuracyReady, status:"resolved", reasonCode:"target_met"};
  }
  function upsert(plan, candidate, at){
    const id = itemId(candidate.type, candidate.skillId, candidate.relatedSkillId);
    let item = plan.items.find(x => x.id === id);
    if(item && item.status === "active") {
      item.updatedAt = at;
      item.reasonCode = candidate.reasonCode;
      item.reasonText = candidate.reasonText;
      item.evidence = candidate.evidence;
      item.target = candidate.target;
      return item;
    }
    item = normalizeItem(Object.assign({}, candidate, { id, status:"active", createdAt:at, updatedAt:at, resolvedAt:null }));
    plan.items.push(item);
    plan.history.push({ at, type:candidate.type + "_created", skillId:item.skillId, relatedSkillId:item.relatedSkillId, itemId:item.id, reasonCode:item.reasonCode });
    return item;
  }
  function evaluate(data, controls, options){
    controls = controls || {};
    const at = now(options);
    const plan = normalizePlan(controls.learningPlan);
    const retained = [];
    plan.items.forEach(item => {
      if(item.status !== "active") { retained.push(item); return; }
      const res = isResolved(item, data, controls);
      if(res.resolved) {
        item.status = res.status || "resolved";
        item.resolvedAt = at;
        item.updatedAt = at;
        item.reasonCode = res.reasonCode || item.reasonCode;
        plan.history.push({ at, type:item.type + "_" + item.status, skillId:item.skillId, relatedSkillId:item.relatedSkillId, itemId:item.id, reasonCode:item.reasonCode });
      }
      retained.push(item);
    });
    plan.items = retained;

    const remediation = remediationCandidateFromEvidence(data, controls).concat(remediationCandidateFromPrereqs(data, controls))
      .sort((a,b) => a.rank - b.rank || a.skillId.localeCompare(b.skillId))
      .slice(0, LIMITS.maxActiveRemediation);
    const enrichment = enrichmentCandidates(data, controls)
      .sort((a,b) => a.rank - b.rank || a.skillId.localeCompare(b.skillId))
      .slice(0, LIMITS.maxActiveEnrichment);
    remediation.forEach(c => upsert(plan, c, at));
    enrichment.forEach(c => upsert(plan, c, at));

    const activeRem = plan.items.filter(x => x.status === "active" && x.type === "remediation").sort((a,b) => a.updatedAt - b.updatedAt);
    activeRem.slice(0, Math.max(0, activeRem.length - LIMITS.maxActiveRemediation)).forEach(item => {
      item.status = "replaced"; item.resolvedAt = at; item.updatedAt = at; item.reasonCode = "max_active_replaced";
      plan.history.push({ at, type:"remediation_replaced", skillId:item.skillId, relatedSkillId:item.relatedSkillId, itemId:item.id, reasonCode:item.reasonCode });
    });
    const activeEn = plan.items.filter(x => x.status === "active" && x.type === "enrichment").sort((a,b) => a.updatedAt - b.updatedAt);
    activeEn.slice(0, Math.max(0, activeEn.length - LIMITS.maxActiveEnrichment)).forEach(item => {
      item.status = "replaced"; item.resolvedAt = at; item.updatedAt = at; item.reasonCode = "max_active_replaced";
      plan.history.push({ at, type:"enrichment_replaced", skillId:item.skillId, relatedSkillId:item.relatedSkillId, itemId:item.id, reasonCode:item.reasonCode });
    });
    plan.history = plan.history.slice(-LIMITS.maxHistory);
    controls.learningPlan = normalizePlan(plan);
    return controls.learningPlan;
  }

  const api = {
    VERSION, LIMITS, REMEDIATION_ENTRY_ATTEMPTS, REMEDIATION_ENTRY_ACCURACY,
    REMEDIATION_EXIT_ATTEMPTS, REMEDIATION_EXIT_ACCURACY, REMEDIATION_EXIT_MASTERY,
    ENRICHMENT_MASTERY, ENRICHMENT_EVIDENCE, ENRICHMENT_RESOLVE_MASTERY,
    normalizePlan, publicPlan, activeItems, evaluate, topicEvidence,
  };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_LEARNING_PLAN = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
