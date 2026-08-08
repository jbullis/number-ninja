/* Number Ninja adaptive placement engine.
 * Pure core: no DOM, no storage, no account writes.
 */
(function(root){
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./curriculum.js") : root.NINJA_CURRICULUM;
  const GRADES = C.GRADES;
  const MAX_Q = 12;
  const MIN_Q = 6;
  const PER_GRADE = 4;

  function now(){ return Date.now(); }
  function validGrade(g){ return GRADES.includes(String(g)) ? String(g) : "4"; }
  function clone(x){ return JSON.parse(JSON.stringify(x == null ? null : x)); }
  function gradeLabel(g){ return g === "K" ? "Kindergarten" : "Grade " + g; }
  function bands(homeGrade){ return C.placementBands(validGrade(homeGrade)); }
  function newPlacementState(grade, attempt){
    return {
      status:"not_started",
      recommended:true,
      startedAt:null,
      completedAt:null,
      homeGradeAtStart:validGrade(grade),
      attempt:Number(attempt || 0),
      responses:{ total:0, correct:0, bySkill:{}, byGrade:{} },
      recommendations:[],
      pendingQuestion:null,
      appliedRecommendationSnapshot:null,
      undoSnapshot:null,
      lastTaken:null,
      history:[],
    };
  }
  function normalizePlacement(placement, homeGrade){
    const p = placement && typeof placement === "object" ? clone(placement) : {};
    const base = newPlacementState(homeGrade, p.attempt || 0);
    Object.assign(base, p);
    base.status = ["not_started","in_progress","completed","skipped"].includes(base.status) ? base.status : "not_started";
    base.recommended = base.recommended !== false;
    base.homeGradeAtStart = validGrade(base.homeGradeAtStart || homeGrade);
    base.responses = base.responses && typeof base.responses === "object" ? base.responses : { total:0, correct:0, bySkill:{}, byGrade:{} };
    base.responses.bySkill = base.responses.bySkill || {};
    base.responses.byGrade = base.responses.byGrade || {};
    base.recommendations = Array.isArray(base.recommendations) ? base.recommendations : [];
    base.history = Array.isArray(base.history) ? base.history : [];
    return base;
  }
  function representativeSkills(homeGrade){
    const wanted = bands(homeGrade);
    const out = [];
    wanted.forEach(g=>{
      const skills = C.SKILLS.filter(s=>s.grade === g).slice();
      skills.sort((a,b)=>
        (a.prereqs.length - b.prereqs.length) ||
        a.group.localeCompare(b.group) ||
        a.label.localeCompare(b.label)
      );
      const seenGroups = new Set();
      const chosen = [];
      skills.forEach(s=>{
        if(chosen.length < PER_GRADE && !seenGroups.has(s.group)){
          chosen.push(s); seenGroups.add(s.group);
        }
      });
      skills.forEach(s=>{ if(chosen.length < PER_GRADE && !chosen.includes(s)) chosen.push(s); });
      chosen.slice(0, PER_GRADE).forEach(s=>out.push(s));
    });
    return out;
  }
  function startAttempt(controls, at){
    controls = controls || {};
    const homeGrade = validGrade(controls.homeGrade);
    const prev = normalizePlacement(controls.placement, homeGrade);
    const p = newPlacementState(homeGrade, Number(prev.attempt || 0) + 1);
    p.status = "in_progress";
    p.startedAt = at || now();
    p.pool = representativeSkills(homeGrade).map(s=>s.id);
    p.cursor = 0;
    p.history = prev.history || [];
    if(prev.status && prev.status !== "not_started") {
      p.history.push({
        attempt:prev.attempt || 0,
        status:prev.status,
        startedAt:prev.startedAt || null,
        completedAt:prev.completedAt || null,
        lastTaken:prev.lastTaken || null,
        recommendations:prev.recommendations || [],
      });
      if(p.history.length > 10) p.history = p.history.slice(-10);
    }
    return p;
  }
  function nextSkill(placement){
    const p = normalizePlacement(placement, placement && placement.homeGradeAtStart);
    const pool = Array.isArray(p.pool) && p.pool.length ? p.pool : representativeSkills(p.homeGradeAtStart).map(s=>s.id);
    const bySkill = p.responses.bySkill || {};
    const untried = pool.find(id => !bySkill[id] || bySkill[id].attempted < 1);
    if(untried) return untried;
    const weak = pool.filter(id => (bySkill[id] && bySkill[id].attempted < 2 && bySkill[id].correct === 0))[0];
    if(weak) return weak;
    return pool[(p.responses.total || 0) % pool.length];
  }
  function choiceId(questionId, index) {
    return questionId + ":c" + index;
  }
  function buildQuestion(placement, generator, at) {
    const p = placement && placement.responses ? placement : normalizePlacement(placement, placement && placement.homeGradeAtStart);
    if (p.status !== "in_progress") return null;
    if (p.pendingQuestion && !p.pendingQuestion.answered) return p.pendingQuestion;
    const skillId = nextSkill(p);
    const skill = C.BY_ID[skillId];
    if (!skill || typeof generator !== "function") return null;
    const q = generator(skillId);
    const questionId = "plc-" + p.attempt + "-" + ((p.responses.total || 0) + 1) + "-" + skillId.replace(/[^a-zA-Z0-9]/g, "") + "-" + (at || now());
    const choices = (q.choices || []).map((c, i) => ({ id:choiceId(questionId, i), h:c.h }));
    const okIndex = (q.choices || []).findIndex(c => c && c.ok);
    if (okIndex < 0) return null;
    p.pendingQuestion = {
      id:questionId,
      skillId,
      skillLabel:skill.label,
      skillGrade:skill.grade,
      questionNumber:(p.responses.total || 0) + 1,
      qHTML:q.qHTML,
      tip:q.tip || "",
      choices,
      correctChoiceId:choiceId(questionId, okIndex),
      issuedAt:at || now(),
      answered:false,
    };
    return p.pendingQuestion;
  }
  function issueQuestion(placement, generator, at) {
    const p = normalizePlacement(placement, placement && placement.homeGradeAtStart);
    const q = buildQuestion(p, generator, at);
    return { placement:p, question:q };
  }
  function publicQuestion(q) {
    if (!q) return null;
    return {
      id:q.id,
      skillId:q.skillId,
      skillLabel:q.skillLabel,
      skillGrade:q.skillGrade,
      questionNumber:q.questionNumber,
      qHTML:q.qHTML,
      tip:q.tip,
      choices:(q.choices || []).map(c => ({ id:c.id, h:c.h })),
    };
  }
  function answerPendingQuestion(placement, questionId, choiceIdValue, at) {
    const p = normalizePlacement(placement, placement && placement.homeGradeAtStart);
    if (p.status !== "in_progress") return { error:"placement_not_in_progress", placement:p };
    const q = p.pendingQuestion;
    if (!q) return { error:"no_pending_question", placement:p };
    if (q.answered) return { error:"question_already_answered", placement:p };
    if (q.id !== questionId) return { error:"stale_question", placement:p };
    if (!(q.choices || []).some(c => c.id === choiceIdValue)) return { error:"invalid_choice", placement:p };
    const correct = choiceIdValue === q.correctChoiceId;
    q.answered = true;
    q.answeredAt = at || now();
    q.selectedChoiceId = choiceIdValue;
    p.pendingQuestion = null;
    const next = recordResponse(p, q.skillId, correct, at);
    return { placement:next, correct };
  }
  function recordResponse(placement, skillId, correct, at){
    const p = normalizePlacement(placement, placement && placement.homeGradeAtStart);
    const skill = C.BY_ID[skillId];
    if(!skill) return p;
    p.status = "in_progress";
    p.responses.total = (p.responses.total || 0) + 1;
    if(correct) p.responses.correct = (p.responses.correct || 0) + 1;
    const s = p.responses.bySkill[skillId] || { attempted:0, correct:0, grade:skill.grade, label:skill.label };
    s.attempted++; if(correct) s.correct++;
    s.accuracy = s.correct / s.attempted;
    p.responses.bySkill[skillId] = s;
    const g = p.responses.byGrade[skill.grade] || { attempted:0, correct:0 };
    g.attempted++; if(correct) g.correct++;
    g.accuracy = g.correct / g.attempted;
    p.responses.byGrade[skill.grade] = g;
    p.lastResponseAt = at || now();
    return p;
  }
  function shouldStop(placement){
    const p = normalizePlacement(placement, placement && placement.homeGradeAtStart);
    const total = p.responses.total || 0;
    if(total >= MAX_Q) return true;
    if(total < MIN_Q) return false;
    const bs = bands(p.homeGradeAtStart);
    const enoughBands = bs.every(g => (p.responses.byGrade[g] && p.responses.byGrade[g].attempted >= 2));
    if(!enoughBands) return false;
    const acc = total ? (p.responses.correct || 0) / total : 0;
    return total >= 8 || acc >= 0.88 || acc <= 0.35;
  }
  function currentState(skillId, mastery, controls){
    const m = mastery || {};
    const c = controls || {};
    const override = c.skillOverrides && c.skillOverrides[skillId];
    if(override) return override + " by parent";
    const state = C.skillState(skillId, m, c.skillOverrides || {}, c).state;
    const masteryText = m[skillId] ? " mastery " + m[skillId] : " no mastery yet";
    return state + "," + masteryText;
  }
  function recommendationFor(skill, evidence, homeGrade, mastery, controls){
    const acc = evidence.attempted ? evidence.correct / evidence.attempted : 0;
    const homeIdx = C.GRADE_INDEX[homeGrade], skillIdx = C.GRADE_INDEX[skill.grade];
    const base = {
      id:skill.id,
      skillId:skill.id,
      skillLabel:skill.label,
      skillGrade:skill.grade,
      currentState:currentState(skill.id, mastery, controls),
      evidence:{ attempted:evidence.attempted, correct:evidence.correct, accuracy:Math.round(acc * 100) / 100 },
      recommendedOverride:null,
      action:"keep_current_path",
      reason:"Placement evidence supports the current path.",
    };
    if(acc >= 0.8 && skillIdx > homeIdx){
      base.action = "recommend_above_grade_skill";
      base.recommendedOverride = "unlocked";
      base.reason = "Strong answers on above-grade skill samples.";
    } else if(acc >= 0.75){
      base.action = skillIdx >= homeIdx ? "start_at_current_skill" : "keep_current_path";
      base.recommendedOverride = skillIdx >= homeIdx ? "unlocked" : null;
      base.reason = "Strong evidence for this skill.";
    } else if(acc < 0.5 && skillIdx <= homeIdx){
      base.action = "recommend_lower_skill_reinforcement";
      base.recommendedOverride = "unlocked";
      base.reason = "Practice here can strengthen a prerequisite without lowering the home grade.";
    } else if(acc < 0.5){
      base.action = "strengthen_prerequisite";
      base.reason = "Keep advanced work available later, after prerequisites get stronger.";
    }
    return base;
  }
  function completeAttempt(placement, controls, mastery, at){
    const p = normalizePlacement(placement, placement && placement.homeGradeAtStart);
    const c = controls || {};
    const bySkill = p.responses.bySkill || {};
    p.status = "completed";
    p.completedAt = at || now();
    p.lastTaken = p.completedAt;
    p.homeGradeAtStart = validGrade(p.homeGradeAtStart || c.homeGrade);
    p.recommendations = Object.keys(bySkill).map(id => recommendationFor(C.BY_ID[id], bySkill[id], p.homeGradeAtStart, mastery || {}, c));
    p.recommended = false;
    delete p.pool;
    delete p.cursor;
    p.pendingQuestion = null;
    return p;
  }
  function skipPlacement(placement, homeGrade, at){
    const p = normalizePlacement(placement, homeGrade);
    p.status = "skipped";
    p.recommended = false;
    p.lastTaken = at || now();
    return p;
  }
  function resetForRetake(placement, homeGrade, at){
    const prev = normalizePlacement(placement, homeGrade);
    const p = newPlacementState(homeGrade, Number(prev.attempt || 0) + 1);
    p.retakeRequestedAt = at || now();
    p.history = prev.history || [];
    p.history.push({
      attempt:prev.attempt || 0,
      status:prev.status,
      startedAt:prev.startedAt || null,
      completedAt:prev.completedAt || null,
      lastTaken:prev.lastTaken || null,
      recommendations:prev.recommendations || [],
    });
    if(p.history.length > 10) p.history = p.history.slice(-10);
    return p;
  }
  function applyRecommendations(controls, selectedIds, at){
    const c = clone(controls || {});
    c.skillOverrides = c.skillOverrides || {};
    const p = normalizePlacement(c.placement, c.homeGrade);
    const ids = new Set(Array.isArray(selectedIds) ? selectedIds : (p.recommendations || []).map(r=>r.id));
    const items = [];
    (p.recommendations || []).forEach(r=>{
      if(!ids.has(r.id) || !r.recommendedOverride) return;
      const prev = Object.prototype.hasOwnProperty.call(c.skillOverrides, r.skillId) ? c.skillOverrides[r.skillId] : null;
      c.skillOverrides[r.skillId] = r.recommendedOverride;
      items.push({ id:r.id, skillId:r.skillId, previousOverride:prev, appliedOverride:r.recommendedOverride, action:r.action });
    });
    p.appliedRecommendationSnapshot = { at:at || now(), items };
    p.undoSnapshot = { at:at || now(), items };
    p.history = p.history || [];
    p.history.push({ at:at || now(), action:"placement_applied", items });
    c.placement = p;
    return { controls:c, applied:items };
  }
  function undoLastApply(controls, at){
    const c = clone(controls || {});
    c.skillOverrides = c.skillOverrides || {};
    const p = normalizePlacement(c.placement, c.homeGrade);
    const snap = p.undoSnapshot;
    const restored = [];
    if(snap && Array.isArray(snap.items)){
      snap.items.forEach(it=>{
        if(c.skillOverrides[it.skillId] !== it.appliedOverride) return;
        if(it.previousOverride == null) delete c.skillOverrides[it.skillId];
        else c.skillOverrides[it.skillId] = it.previousOverride;
        restored.push(it);
      });
      p.history = p.history || [];
      p.history.push({ at:at || now(), action:"placement_undone", items:restored });
      p.undoSnapshot = null;
      p.lastUndoAt = at || now();
    }
    c.placement = p;
    return { controls:c, restored };
  }

  const api = {
    MAX_Q, MIN_Q, PER_GRADE,
    gradeLabel, bands, newPlacementState, normalizePlacement, representativeSkills,
    startAttempt, nextSkill, buildQuestion, issueQuestion, publicQuestion, answerPendingQuestion, recordResponse, shouldStop, completeAttempt,
    skipPlacement, resetForRetake, applyRecommendations, undoLastApply,
  };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_PLACEMENT = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
