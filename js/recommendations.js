/* Number Ninja adaptive recommendation engine.
 * Pure core: no DOM, no storage.
 */
(function(root){
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./curriculum.js") : root.NINJA_CURRICULUM;
  const Mastery = (typeof module !== "undefined" && module.exports) ? require("./mastery.js") : root.NINJA_MASTERY;
  const Assignments = (typeof module !== "undefined" && module.exports) ? require("./assignments.js") : root.NINJA_ASSIGNMENTS;
  const LearningPlan = (typeof module !== "undefined" && module.exports) ? require("./learning-plan.js") : root.NINJA_LEARNING_PLAN;
  const PRIORITY = { parent_assignment:0, needs_review:1, persistent_remediation:20, weak_prerequisite:22, challenge_ready:30, home_progression:40, persistent_enrichment:50, enrichment:60 };

  function progressFor(data){ return data && data.progress || {}; }
  function masteryMap(data){ return progressFor(data).mastery || {}; }
  function topicEvidence(data, skillId){
    const t = (progressFor(data).topics || {})[skillId] || {};
    const solved = Number(t.solved || 0), wrongs = Number(t.wrongs || 0), attempts = solved + wrongs;
    return {solved, wrongs, attempts, accuracy:attempts ? solved / attempts : 0};
  }
  function rec(skill, type, reason, priority, badge){
    return {skillId:skill.id, skillLabel:skill.label, grade:skill.grade, type, reason, priority, badge};
  }
  function assignmentRecommendations(controls, options){
    if(!Assignments) return [];
    const nowDate = options && options.localDate;
    return Assignments.activeSummaries(controls && controls.assignments, {localDate:nowDate, includeNotes:false})
      .map((a,i) => {
        const dueBoost = a.displayStatus === "overdue" ? -0.5 : a.dueDate ? -0.25 : 0;
        return {
          assignmentId:a.id,
          title:a.title,
          skillId:a.skillIds && a.skillIds[0] || null,
          skillLabel:a.title,
          grade:a.skills && a.skills[0] && a.skills[0].grade || "",
          type:"parent_assignment",
          reason:a.displayStatus === "overdue" ? "This one is waiting for you." : "A parent assignment is ready.",
          priority:PRIORITY.parent_assignment + dueBoost + i / 100,
          badge:"Parent Assignment",
          assignment:a,
        };
      });
  }
  function planRecommendations(controls){
    if(!LearningPlan) return [];
    return LearningPlan.activeItems(controls && controls.learningPlan).map((item, i) => {
      const skill = C.BY_ID[item.skillId];
      if(!skill) return null;
      return {
        skillId:item.skillId,
        skillLabel:skill.label,
        grade:skill.grade,
        type:item.type === "enrichment" ? "persistent_enrichment" : "persistent_remediation",
        reason:item.reasonText || (item.type === "enrichment" ? "You've shown you're ready to try a harder skill." : "A little more practice here will make the next skill easier."),
        priority:(item.type === "enrichment" ? PRIORITY.persistent_enrichment : PRIORITY.persistent_remediation) + i / 100,
        badge:item.type === "enrichment" ? "Advanced Training" : "Ninja Training Focus",
        planItem:item,
      };
    }).filter(Boolean);
  }
  function missingPrereqRecommendations(data, controls){
    const mastery = masteryMap(data), homeGrade = controls.homeGrade || "4";
    const homeIdx = C.GRADE_INDEX[homeGrade] == null ? C.GRADE_INDEX["4"] : C.GRADE_INDEX[homeGrade];
    const placement = placementBoosts(controls);
    const out = [];
    C.SKILLS.filter(s => C.GRADE_INDEX[s.grade] >= homeIdx && C.GRADE_INDEX[s.grade] <= homeIdx + 1).forEach(skill => {
      if(C.skillState(skill.id, mastery, controls.skillOverrides || {}, controls).state === "unlocked") return;
      const skillEv = topicEvidence(data, skill.id);
      if(Number(mastery[skill.id] || 0) >= 80) return;
      if(!placement[skill.id] && Number(mastery[skill.id] || 0) <= 0 && skillEv.attempts <= 0) return;
      (skill.prereqs || []).forEach(pid => {
        const p = C.BY_ID[pid];
        if(!p) return;
        if(C.GRADE_INDEX[p.grade] < Math.max(0, homeIdx - 1)) return;
        const pm = Number(mastery[pid] || 0);
        const ev = topicEvidence(data, pid);
        const gradeDistance = Math.max(0, homeIdx - C.GRADE_INDEX[p.grade]);
        if(pm < 80) out.push(rec(p, "weak_prerequisite", "Build this skill to make the next one easier.", 20 + gradeDistance + pm / 100, "Recommended Practice"));
        else if(ev.attempts && ev.accuracy < 0.7) out.push(rec(p, "weak_prerequisite", "A quick tune-up here will make the next skill smoother.", 20.5 + gradeDistance, "Recommended Practice"));
      });
    });
    const seen = new Set();
    return out.filter(r => !seen.has(r.skillId) && seen.add(r.skillId));
  }
  function placementBoosts(controls){
    const p = controls && controls.placement || {};
    const ids = {};
    (p.recommendations || []).forEach(r => {
      if(r.recommendedOverride === "unlocked") ids[r.skillId] = r.reason || "Placement found this is a good next step.";
    });
    return ids;
  }
  function buildRecommendations(data, controls, options){
    controls = controls || {};
    data = data || {};
    const limit = options && options.limit || 4;
    const homeGrade = controls.homeGrade || "4";
    const homeIdx = C.GRADE_INDEX[homeGrade] == null ? C.GRADE_INDEX["4"] : C.GRADE_INDEX[homeGrade];
    const mastery = masteryMap(data);
    const out = [];
    const bySkill = controls.skillMastery && controls.skillMastery.bySkill || {};
    const t = options && options.now || Date.now();

    assignmentRecommendations(controls, options).forEach(r => out.push(r));

    Object.keys(bySkill).forEach(id => {
      const s = C.BY_ID[id], st = bySkill[id] || {};
      if(s && st.certified && (st.needsReview || (st.reviewDueAt && st.reviewDueAt <= t))) {
        const age = st.reviewDueAt ? Math.max(0, t - st.reviewDueAt) / 86400000 : 0;
        out.push(rec(s, "needs_review", st.needsReview ? "This Black Belt stays earned. A short review will keep it sharp." : "This Black Belt review is due.", PRIORITY.needs_review - Math.min(age, 30) / 100, "Needs Review"));
      }
    });

    const planRecs = planRecommendations(controls);
    const planRemediationSkills = new Set(planRecs.filter(r => r.type === "persistent_remediation").map(r => r.skillId));
    planRecs.filter(r => r.type === "persistent_remediation").forEach(r => out.push(r));
    missingPrereqRecommendations(data, controls).filter(r => !planRemediationSkills.has(r.skillId)).forEach(r => out.push(r));

    if(Mastery) {
      Mastery.eligibleChallenges(data, controls, 6).forEach(item => {
        const s = C.BY_ID[item.skillId];
        if(s) out.push(rec(s, "challenge_ready", "You have enough practice evidence for a short Black Belt challenge.", 30, "Black Belt Challenge Ready"));
      });
    }

    const placement = placementBoosts(controls);
    const dynamicEnrichment = [];
    C.unlockedSkills(mastery, controls.skillOverrides || {}, controls).forEach(s => {
      const st = bySkill[s.id] || {};
      if(st.certified && !(st.needsReview || (st.reviewDueAt && st.reviewDueAt <= t))) return;
      const m = Number(mastery[s.id] || 0);
      const ev = topicEvidence(data, s.id);
      if(m >= 100) return;
      const above = C.GRADE_INDEX[s.grade] > homeIdx;
      if(!above && C.GRADE_INDEX[s.grade] < Math.max(0, homeIdx - 1) && m <= 0 && ev.attempts <= 0) return;
      if(above && controls.allowAboveGrade === false && !(controls.skillOverrides || {})[s.id]) return;
      if(above) dynamicEnrichment.push(rec(s, "enrichment", placement[s.id] || "Optional advanced practice is ready when you want a stretch.", PRIORITY.enrichment + m / 100, "Enrichment"));
      else {
        const gradeDistance = Math.abs(C.GRADE_INDEX[s.grade] - homeIdx);
        out.push(rec(s, "home_progression", placement[s.id] || "This is a strong next step for your current path.", PRIORITY.home_progression + gradeDistance * 2 + m / 100, m >= 70 ? "Ready to Level Up" : "Recommended Practice"));
      }
    });
    planRecs.filter(r => r.type === "persistent_enrichment").forEach(r => out.push(r));
    const planEnrichmentSkills = new Set(planRecs.filter(r => r.type === "persistent_enrichment").map(r => r.skillId));
    dynamicEnrichment.filter(r => !planEnrichmentSkills.has(r.skillId)).forEach(r => out.push(r));

    const seen = new Set();
    return out
      .filter(r => r.type === "parent_assignment" || C.BY_ID[r.skillId])
      .sort((a,b) => a.priority - b.priority || (C.GRADE_INDEX[a.grade] || 0) - (C.GRADE_INDEX[b.grade] || 0) || a.skillLabel.localeCompare(b.skillLabel))
      .filter(r => {
        const key = r.type === "parent_assignment" ? "assignment:" + r.assignmentId : "skill:" + r.skillId;
        return !seen.has(key) && seen.add(key);
      })
      .slice(0, limit);
  }
  function primaryAndAlternates(data, controls, options){
    options = Object.assign({limit:4}, options || {});
    const list = buildRecommendations(data, controls, options);
    return {primary:list[0] || null, alternates:list.slice(1,4), recommendations:list};
  }

  const api = { PRIORITY, buildRecommendations, primaryAndAlternates, missingPrereqRecommendations, planRecommendations };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_RECOMMENDATIONS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
