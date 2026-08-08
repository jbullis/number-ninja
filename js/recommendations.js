/* Number Ninja adaptive recommendation engine.
 * Pure core: no DOM, no storage.
 */
(function(root){
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./curriculum.js") : root.NINJA_CURRICULUM;
  const Mastery = (typeof module !== "undefined" && module.exports) ? require("./mastery.js") : root.NINJA_MASTERY;
  const PRIORITY = { parent_assignment:0, needs_review:1, weak_prerequisite:20, challenge_ready:30, home_progression:40, enrichment:50 };

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

    Object.keys(bySkill).forEach(id => {
      const s = C.BY_ID[id], st = bySkill[id] || {};
      if(s && st.certified && (st.needsReview || (st.reviewDueAt && st.reviewDueAt <= t))) {
        const age = st.reviewDueAt ? Math.max(0, t - st.reviewDueAt) / 86400000 : 0;
        out.push(rec(s, "needs_review", st.needsReview ? "This Black Belt stays earned. A short review will keep it sharp." : "This Black Belt review is due.", PRIORITY.needs_review - Math.min(age, 30) / 100, "Needs Review"));
      }
    });

    missingPrereqRecommendations(data, controls).forEach(r => out.push(r));

    if(Mastery) {
      Mastery.eligibleChallenges(data, controls, 6).forEach(item => {
        const s = C.BY_ID[item.skillId];
        if(s) out.push(rec(s, "challenge_ready", "You have enough practice evidence for a short Black Belt challenge.", 30, "Black Belt Challenge Ready"));
      });
    }

    const placement = placementBoosts(controls);
    C.unlockedSkills(mastery, controls.skillOverrides || {}, controls).forEach(s => {
      const st = bySkill[s.id] || {};
      if(st.certified && !(st.needsReview || (st.reviewDueAt && st.reviewDueAt <= t))) return;
      const m = Number(mastery[s.id] || 0);
      const ev = topicEvidence(data, s.id);
      if(m >= 100) return;
      const above = C.GRADE_INDEX[s.grade] > homeIdx;
      if(!above && C.GRADE_INDEX[s.grade] < Math.max(0, homeIdx - 1) && m <= 0 && ev.attempts <= 0) return;
      if(above && controls.allowAboveGrade === false && !(controls.skillOverrides || {})[s.id]) return;
      if(above) out.push(rec(s, "enrichment", placement[s.id] || "Optional advanced practice is ready when you want a stretch.", 50 + m / 100, "Enrichment"));
      else {
        const gradeDistance = Math.abs(C.GRADE_INDEX[s.grade] - homeIdx);
        out.push(rec(s, "home_progression", placement[s.id] || "This is a strong next step for your current path.", 40 + gradeDistance * 2 + m / 100, m >= 70 ? "Ready to Level Up" : "Recommended Practice"));
      }
    });

    const seen = new Set();
    return out
      .filter(r => C.BY_ID[r.skillId])
      .sort((a,b) => a.priority - b.priority || C.GRADE_INDEX[a.grade] - C.GRADE_INDEX[b.grade] || a.skillLabel.localeCompare(b.skillLabel))
      .filter(r => !seen.has(r.skillId) && seen.add(r.skillId))
      .slice(0, limit);
  }
  function primaryAndAlternates(data, controls){
    const list = buildRecommendations(data, controls, {limit:4});
    return {primary:list[0] || null, alternates:list.slice(1,4), recommendations:list};
  }

  const api = { PRIORITY, buildRecommendations, primaryAndAlternates, missingPrereqRecommendations };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_RECOMMENDATIONS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
