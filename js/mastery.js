/* Number Ninja mastery challenge and spaced-review engine.
 * Pure core: no DOM, no storage, no account writes.
 */
(function(root){
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./curriculum.js") : root.NINJA_CURRICULUM;

  const CHALLENGE_QUESTIONS = 6;
  const REVIEW_QUESTIONS = 4;
  const MIN_MASTERY_FOR_CHALLENGE = 80;
  const MIN_ORDINARY_ACCURACY = 0.70;
  const PASS_OVERALL = 0.80;
  const PASS_TARGET = 0.75;
  const REVIEW_PASS = 0.75;
  const RETRY_CLEAN_CORRECT = 3;
  const REVIEW_INTERVAL_DAYS = [3, 7, 21, 45, 90];
  const NEEDS_REVIEW_INTERVAL_DAYS = 2;

  function now(){ return Date.now(); }
  function clone(x){ return JSON.parse(JSON.stringify(x == null ? null : x)); }
  function dayMs(days){ return days * 24 * 60 * 60 * 1000; }
  function idSafe(id){ return String(id || "").replace(/[^a-zA-Z0-9]/g, ""); }
  function newState(){
    return {
      bySkill:{},
      pendingChallenge:null,
      pendingReview:null,
      history:[],
    };
  }
  function normalizeState(state){
    const s = state && typeof state === "object" ? clone(state) : {};
    const base = newState();
    Object.assign(base, s);
    base.bySkill = base.bySkill && typeof base.bySkill === "object" ? base.bySkill : {};
    base.history = Array.isArray(base.history) ? base.history : [];
    return base;
  }
  function ensureControls(controls){
    controls = controls || {};
    controls.skillMastery = normalizeState(controls.skillMastery);
    return controls;
  }
  function defaultSkillState(){
    return {
      certified:false,
      certifiedAt:null,
      challengeEligible:false,
      challengeAttempts:0,
      challengePasses:0,
      lastChallengeAt:null,
      lastChallengePassed:null,
      retryAfterCleanCorrect:null,
      needsReview:false,
      reviewDueAt:null,
      lastReviewedAt:null,
      retentionScore:null,
      reviewMisses:0,
      reviewLevel:0,
      ordinaryPracticeEvidence:{ attempts:0, correct:0, cleanCorrect:0, accuracy:0 },
    };
  }
  function skillRecord(controls, skillId){
    ensureControls(controls);
    const rec = controls.skillMastery.bySkill[skillId] || defaultSkillState();
    controls.skillMastery.bySkill[skillId] = Object.assign(defaultSkillState(), rec);
    return controls.skillMastery.bySkill[skillId];
  }
  function progressFor(data){
    return (data && data.progress) || {};
  }
  function masteryMap(data){
    return progressFor(data).mastery || {};
  }
  function topicEvidence(data, skillId){
    const topic = (progressFor(data).topics || {})[skillId] || {};
    const solved = Number(topic.solved || 0);
    const wrongs = Number(topic.wrongs || 0);
    const first = Number(topic.first || 0);
    const attempts = solved + wrongs;
    return {
      attempts,
      correct:solved,
      cleanCorrect:first,
      accuracy:attempts ? solved / attempts : 0,
    };
  }
  function evidenceTarget(skill){
    return Math.max(5, Math.ceil(Number(skill && skill.evidence || 12) * 0.45));
  }
  function prereqsSatisfied(skill, data, controls){
    if(!skill) return false;
    const mastery = masteryMap(data);
    return (skill.prereqs || []).every(id => {
      const rec = skillRecord(controls, id);
      return rec.certified || Number(mastery[id] || 0) >= MIN_MASTERY_FOR_CHALLENGE;
    });
  }
  function evaluateSkill(skillId, data, controls, at){
    ensureControls(controls);
    const skill = C.BY_ID[skillId];
    if(!skill) return { eligible:false, reason:"unknown_skill" };
    const rec = skillRecord(controls, skillId);
    const ev = topicEvidence(data, skillId);
    rec.ordinaryPracticeEvidence = ev;
    const masteryScore = Number(masteryMap(data)[skillId] || 0);
    rec.masteryScore = masteryScore;
    if(rec.certified) {
      rec.challengeEligible = false;
      return { eligible:false, reason:"already_certified", record:rec, evidence:ev, masteryScore };
    }
    if(masteryScore < MIN_MASTERY_FOR_CHALLENGE) {
      rec.challengeEligible = false;
      return { eligible:false, reason:"mastery_below_threshold", record:rec, evidence:ev, masteryScore };
    }
    if(ev.correct < evidenceTarget(skill) || ev.accuracy < MIN_ORDINARY_ACCURACY) {
      rec.challengeEligible = false;
      return { eligible:false, reason:"ordinary_evidence_needed", record:rec, evidence:ev, masteryScore };
    }
    if(rec.retryAfterCleanCorrect != null && ev.cleanCorrect < rec.retryAfterCleanCorrect) {
      rec.challengeEligible = false;
      return { eligible:false, reason:"retry_practice_needed", record:rec, evidence:ev, masteryScore };
    }
    if(!prereqsSatisfied(skill, data, controls)) {
      rec.challengeEligible = false;
      return { eligible:false, reason:"prerequisites_needed", record:rec, evidence:ev, masteryScore };
    }
    rec.challengeEligible = true;
    return { eligible:true, reason:"ready", record:rec, evidence:ev, masteryScore, at:at || now() };
  }
  function eligibleChallenges(data, controls, limit){
    ensureControls(controls);
    return C.SKILLS.map(s => ({ skill:s, check:evaluateSkill(s.id, data, controls) }))
      .filter(x => x.check.eligible)
      .sort((a,b) => {
        const ma = a.check.masteryScore || 0, mb = b.check.masteryScore || 0;
        return mb - ma || a.skill.grade.localeCompare(b.skill.grade) || a.skill.label.localeCompare(b.skill.label);
      })
      .slice(0, limit || 4)
      .map(x => ({
        skillId:x.skill.id,
        skillLabel:x.skill.label,
        skillGrade:x.skill.grade,
        masteryScore:x.check.masteryScore,
        evidence:x.check.evidence,
      }));
  }
  function challengePlan(skillId){
    const skill = C.BY_ID[skillId];
    if(!skill) return [];
    const prereqs = (skill.prereqs || []).filter(id => C.BY_ID[id]).slice(-2);
    const prereqCount = Math.min(prereqs.length, Math.max(0, Math.floor(CHALLENGE_QUESTIONS * Number(skill.challengeMix || 0.25))));
    const pickedPrereqs = prereqs.slice(-prereqCount);
    const plan = [];
    for(let i=0;i<CHALLENGE_QUESTIONS - pickedPrereqs.length;i++) plan.push({ skillId, role:"target" });
    pickedPrereqs.forEach(id => plan.push({ skillId:id, role:"prerequisite" }));
    return plan;
  }
  function newPending(kind, skillId, plan, attempt, at){
    return {
      id:kind + "-" + idSafe(skillId) + "-" + (attempt || 1) + "-" + (at || now()),
      kind,
      status:"in_progress",
      skillId,
      startedAt:at || now(),
      attempt:Number(attempt || 1),
      plan:plan || [],
      index:0,
      total:0,
      correct:0,
      targetTotal:0,
      targetCorrect:0,
      prereqTotal:0,
      prereqCorrect:0,
      responses:{ bySkill:{} },
      pendingQuestion:null,
    };
  }
  function startChallenge(controls, data, skillId, at){
    ensureControls(controls);
    const active = controls.skillMastery.pendingChallenge;
    if(active && active.status === "in_progress") return { pending:active, resumed:true };
    const check = evaluateSkill(skillId, data, controls, at);
    if(!check.eligible) return { error:check.reason || "challenge_not_ready" };
    const rec = skillRecord(controls, skillId);
    const pending = newPending("challenge", skillId, challengePlan(skillId), Number(rec.challengeAttempts || 0) + 1, at);
    controls.skillMastery.pendingChallenge = pending;
    return { pending, resumed:false };
  }
  function dueReviewSkills(data, controls, at){
    ensureControls(controls);
    const t = at || now();
    return Object.keys(controls.skillMastery.bySkill || {})
      .map(id => ({ id, skill:C.BY_ID[id], state:skillRecord(controls, id) }))
      .filter(x => x.skill && x.state.certified && x.state.reviewDueAt && x.state.reviewDueAt <= t)
      .sort((a,b) => {
        if(!!b.state.needsReview !== !!a.state.needsReview) return b.state.needsReview ? 1 : -1;
        return Number(a.state.reviewDueAt || 0) - Number(b.state.reviewDueAt || 0);
      })
      .map(x => ({
        skillId:x.id,
        skillLabel:x.skill.label,
        skillGrade:x.skill.grade,
        needsReview:!!x.state.needsReview,
        reviewDueAt:x.state.reviewDueAt,
      }));
  }
  function reviewPlan(skillId){
    const skill = C.BY_ID[skillId];
    if(!skill) return [];
    const prereq = (skill.prereqs || []).filter(id => C.BY_ID[id]).slice(-1);
    const plan = [];
    for(let i=0;i<REVIEW_QUESTIONS - prereq.length;i++) plan.push({ skillId, role:"target" });
    prereq.forEach(id => plan.push({ skillId:id, role:"prerequisite" }));
    return plan;
  }
  function startReview(controls, data, skillId, at){
    ensureControls(controls);
    const active = controls.skillMastery.pendingReview;
    if(active && active.status === "in_progress") return { pending:active, resumed:true };
    const rec = skillRecord(controls, skillId);
    if(!rec.certified) return { error:"skill_not_certified" };
    if(Number(rec.reviewDueAt || 0) > (at || now()) && !rec.needsReview) return { error:"review_not_due" };
    const pending = newPending("review", skillId, reviewPlan(skillId), Number(rec.reviewAttempts || 0) + 1, at);
    controls.skillMastery.pendingReview = pending;
    return { pending, resumed:false };
  }
  function choiceId(questionId, index){ return questionId + ":c" + index; }
  function issueQuestion(pending, generator, at){
    if(!pending || pending.status !== "in_progress") return null;
    if(pending.pendingQuestion && !pending.pendingQuestion.answered) return pending.pendingQuestion;
    if(pending.index >= pending.plan.length) return null;
    const item = pending.plan[pending.index];
    const skill = C.BY_ID[item.skillId];
    const q = skill && generator ? generator(item.skillId, pending.id + ":" + pending.index) : null;
    if(!skill || !q || !Array.isArray(q.choices)) return null;
    const okIndex = q.choices.findIndex(c => c && c.ok);
    if(okIndex < 0) return null;
    const questionId = pending.id + "-q" + (pending.index + 1) + "-" + idSafe(item.skillId) + "-" + (at || now());
    pending.pendingQuestion = {
      id:questionId,
      skillId:item.skillId,
      role:item.role,
      skillLabel:skill.label,
      skillGrade:skill.grade,
      questionNumber:pending.index + 1,
      totalQuestions:pending.plan.length,
      qHTML:q.qHTML,
      tip:q.tip || "",
      choices:q.choices.map((c,i) => ({ id:choiceId(questionId, i), h:c.h })),
      correctChoiceId:choiceId(questionId, okIndex),
      issuedAt:at || now(),
      answered:false,
    };
    return pending.pendingQuestion;
  }
  function publicQuestion(q){
    if(!q) return null;
    return {
      id:q.id,
      skillId:q.skillId,
      role:q.role,
      skillLabel:q.skillLabel,
      skillGrade:q.skillGrade,
      questionNumber:q.questionNumber,
      totalQuestions:q.totalQuestions,
      qHTML:q.qHTML,
      tip:q.tip,
      choices:(q.choices || []).map(c => ({ id:c.id, h:c.h })),
    };
  }
  function publicPending(pending){
    if(!pending) return null;
    const p = clone(pending);
    if(p.pendingQuestion) p.pendingQuestion = publicQuestion(p.pendingQuestion);
    return p;
  }
  function answerPending(pending, questionId, choiceIdValue, at){
    if(!pending || pending.status !== "in_progress") return { error:"not_in_progress", pending };
    const q = pending.pendingQuestion;
    if(!q) return { error:"no_pending_question", pending };
    if(q.answered) return { error:"question_already_answered", pending };
    if(q.id !== questionId) return { error:"stale_question", pending };
    if(!(q.choices || []).some(c => c.id === choiceIdValue)) return { error:"invalid_choice", pending };
    const correct = choiceIdValue === q.correctChoiceId;
    q.answered = true;
    q.selectedChoiceId = choiceIdValue;
    q.answeredAt = at || now();
    const skill = C.BY_ID[q.skillId] || {};
    const bySkill = pending.responses.bySkill[q.skillId] || { attempted:0, correct:0, label:skill.label || q.skillId, grade:skill.grade || "" };
    bySkill.attempted++;
    if(correct) bySkill.correct++;
    bySkill.accuracy = bySkill.correct / bySkill.attempted;
    pending.responses.bySkill[q.skillId] = bySkill;
    pending.total++;
    if(correct) pending.correct++;
    if(q.role === "target") {
      pending.targetTotal++;
      if(correct) pending.targetCorrect++;
    } else {
      pending.prereqTotal++;
      if(correct) pending.prereqCorrect++;
    }
    pending.index++;
    pending.pendingQuestion = null;
    pending.lastAnswerAt = at || now();
    return { pending, correct };
  }
  function canComplete(pending){
    return !!pending && pending.status === "in_progress" && !pending.pendingQuestion && pending.index >= pending.plan.length && pending.total >= pending.plan.length;
  }
  function completeChallenge(controls, data, at){
    ensureControls(controls);
    const pending = controls.skillMastery.pendingChallenge;
    if(!canComplete(pending)) return { error:"challenge_not_complete" };
    const rec = skillRecord(controls, pending.skillId);
    const overall = pending.total ? pending.correct / pending.total : 0;
    const target = pending.targetTotal ? pending.targetCorrect / pending.targetTotal : 0;
    const passed = overall >= PASS_OVERALL && target >= PASS_TARGET;
    rec.challengeAttempts = Number(rec.challengeAttempts || 0) + 1;
    rec.lastChallengeAt = at || now();
    rec.lastChallengePassed = passed;
    if(passed) {
      rec.certified = true;
      rec.certifiedAt = rec.certifiedAt || (at || now());
      rec.challengePasses = Number(rec.challengePasses || 0) + 1;
      rec.needsReview = false;
      rec.reviewLevel = Math.max(0, Number(rec.reviewLevel || 0));
      rec.reviewDueAt = (at || now()) + dayMs(REVIEW_INTERVAL_DAYS[0]);
      rec.retryAfterCleanCorrect = null;
    } else {
      const ev = topicEvidence(data, pending.skillId);
      rec.retryAfterCleanCorrect = Number(ev.cleanCorrect || 0) + RETRY_CLEAN_CORRECT;
    }
    rec.challengeEligible = false;
    const result = {
      skillId:pending.skillId,
      passed,
      overallAccuracy:overall,
      targetAccuracy:target,
      total:pending.total,
      correct:pending.correct,
      targetTotal:pending.targetTotal,
      targetCorrect:pending.targetCorrect,
    };
    controls.skillMastery.history = controls.skillMastery.history || [];
    controls.skillMastery.history.push({ at:at || now(), type:"challenge", skillId:pending.skillId, passed, total:pending.total, correct:pending.correct });
    if(controls.skillMastery.history.length > 50) controls.skillMastery.history = controls.skillMastery.history.slice(-50);
    controls.skillMastery.pendingChallenge = null;
    return { result, record:rec };
  }
  function completeReview(controls, at){
    ensureControls(controls);
    const pending = controls.skillMastery.pendingReview;
    if(!canComplete(pending)) return { error:"review_not_complete" };
    const rec = skillRecord(controls, pending.skillId);
    if(!rec.certified) return { error:"skill_not_certified" };
    const overall = pending.total ? pending.correct / pending.total : 0;
    const target = pending.targetTotal ? pending.targetCorrect / pending.targetTotal : overall;
    const passed = overall >= REVIEW_PASS && target >= REVIEW_PASS;
    rec.lastReviewedAt = at || now();
    rec.retentionScore = overall;
    rec.reviewAttempts = Number(rec.reviewAttempts || 0) + 1;
    if(passed) {
      rec.needsReview = false;
      rec.reviewLevel = Math.min(REVIEW_INTERVAL_DAYS.length - 1, Number(rec.reviewLevel || 0) + 1);
      rec.reviewDueAt = (at || now()) + dayMs(REVIEW_INTERVAL_DAYS[rec.reviewLevel]);
    } else {
      rec.needsReview = true;
      rec.reviewMisses = Number(rec.reviewMisses || 0) + 1;
      rec.reviewDueAt = (at || now()) + dayMs(NEEDS_REVIEW_INTERVAL_DAYS);
    }
    const result = {
      skillId:pending.skillId,
      passed,
      needsReview:!!rec.needsReview,
      overallAccuracy:overall,
      targetAccuracy:target,
      total:pending.total,
      correct:pending.correct,
    };
    controls.skillMastery.history = controls.skillMastery.history || [];
    controls.skillMastery.history.push({ at:at || now(), type:"review", skillId:pending.skillId, passed, needsReview:!!rec.needsReview, total:pending.total, correct:pending.correct });
    if(controls.skillMastery.history.length > 50) controls.skillMastery.history = controls.skillMastery.history.slice(-50);
    controls.skillMastery.pendingReview = null;
    return { result, record:rec };
  }
  function summary(data, controls, at){
    ensureControls(controls);
    C.SKILLS.forEach(s => evaluateSkill(s.id, data, controls, at));
    return {
      eligibleChallenges:eligibleChallenges(data, controls, 8),
      dueReviews:dueReviewSkills(data, controls, at).slice(0, 8),
      bySkill:clone(controls.skillMastery.bySkill || {}),
    };
  }
  function needsReviewSet(controls, at){
    ensureControls(controls);
    const t = at || now();
    const out = {};
    Object.keys(controls.skillMastery.bySkill || {}).forEach(id => {
      const rec = skillRecord(controls, id);
      if(rec.certified && (rec.needsReview || (rec.reviewDueAt && rec.reviewDueAt <= t))) out[id] = rec;
    });
    return out;
  }

  const api = {
    CHALLENGE_QUESTIONS, REVIEW_QUESTIONS, MIN_MASTERY_FOR_CHALLENGE, MIN_ORDINARY_ACCURACY,
    PASS_OVERALL, PASS_TARGET, REVIEW_PASS, RETRY_CLEAN_CORRECT, REVIEW_INTERVAL_DAYS, NEEDS_REVIEW_INTERVAL_DAYS,
    newState, normalizeState, ensureControls, defaultSkillState, skillRecord, topicEvidence, evidenceTarget,
    evaluateSkill, eligibleChallenges, challengePlan, startChallenge, reviewPlan, dueReviewSkills, startReview,
    issueQuestion, publicQuestion, publicPending, answerPending, canComplete, completeChallenge, completeReview,
    summary, needsReviewSet,
  };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_MASTERY = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
