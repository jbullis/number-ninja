/* Number Ninja parent assignment model.
 * Pure core: validation, normalization, scheduling, summaries, rewards.
 */
(function(root){
  "use strict";
  const C = (typeof module !== "undefined" && module.exports) ? require("./curriculum.js") : root.NINJA_CURRICULUM;
  const Daily = (typeof module !== "undefined" && module.exports) ? require("./daily.js") : root.NINJA_DAILY;

  const WEEKDAYS = ["sun","mon","tue","wed","thu","fri","sat"];
  const LIMITS = {
    maxActiveAssignments:20,
    maxSkills:20,
    maxGroups:12,
    titleLength:80,
    noteLength:300,
    problemMin:1,
    problemMax:200,
    minuteMin:1,
    minuteMax:120,
    rewardMin:5,
    rewardMax:50,
    recentCompletedMax:20,
    duplicateWindowMs:2 * 60 * 1000,
  };

  function clone(x){ return JSON.parse(JSON.stringify(x == null ? null : x)); }
  function cleanText(s,max){ return String(s || "").trim().replace(/\s+/g," ").slice(0,max); }
  function groupId(grade, group){ return String(grade) + ":" + String(group); }
  function groupCatalog(){
    const seen = {};
    C.SKILLS.forEach(s => { seen[groupId(s.grade, s.group)] = { id:groupId(s.grade, s.group), grade:s.grade, group:s.group, label:s.group + " - Grade " + s.grade }; });
    return Object.keys(seen).sort().map(id => seen[id]);
  }
  function groupMap(){
    const m = {};
    groupCatalog().forEach(g => { m[g.id] = g; });
    return m;
  }
  function unique(arr){ return Array.from(new Set((arr || []).map(x => String(x || "").trim()).filter(Boolean))); }
  function normalizeWeekdays(days){
    const out = unique(days).filter(d => WEEKDAYS.includes(d));
    return WEEKDAYS.filter(d => out.includes(d));
  }
  function skillsForGroups(groupIds){
    const valid = groupMap(), out = [];
    groupIds.forEach(id => {
      if(!valid[id]) return;
      const g = valid[id];
      C.SKILLS.filter(s => s.grade === g.grade && s.group === g.group).forEach(s => out.push(s.id));
    });
    return unique(out);
  }
  function resolveScope(input){
    const rawSkills = unique(input && input.skillIds);
    const rawGroups = unique(input && input.groupIds);
    const validGroups = groupMap();
    for(const id of rawSkills) if(!C.BY_ID[id]) return {error:"unknown_skill"};
    for(const id of rawGroups) if(!validGroups[id]) return {error:"unknown_group"};
    if(rawGroups.length > LIMITS.maxGroups) return {error:"too_many_groups"};
    const skillIds = unique(rawSkills.concat(skillsForGroups(rawGroups)));
    if(!skillIds.length) return {error:"assignment_scope_required"};
    if(skillIds.length > LIMITS.maxSkills) return {error:"too_many_skills"};
    return {skillIds, groupIds:rawGroups};
  }
  function validateDateOrNull(date, field){
    if(date == null || date === "") return {date:null};
    const d = String(date);
    if(!Daily.validDate(d)) return {error:"invalid_" + field};
    return {date:d};
  }
  function nextOccurrenceDate(a, fromDate){
    if(!a || a.status === "archived") return null;
    const start = Daily.validDate(fromDate) ? fromDate : Daily.todayLocal(new Date());
    if(a.schedule === "once") {
      if(a.occurrences && a.occurrences.lastCompletedDate) return null;
      return (a.occurrences && a.occurrences.currentOccurrenceDate) || a.dueDate || start;
    }
    const days = normalizeWeekdays(a.weekdays);
    if(!days.length) return null;
    for(let i=0;i<=14;i++){
      const d = Daily.addDays(start, i);
      if(a.endDate && Daily.cmpDate(d, a.endDate) > 0) return null;
      if(days.includes(Daily.weekdayKey(d)) && !(a.occurrences && a.occurrences.recentCompletedDates || []).includes(d)) return d;
    }
    return null;
  }
  function scheduleStatus(a, localDate){
    const date = Daily.validDate(localDate) ? localDate : Daily.todayLocal(new Date());
    if(!a || a.status === "archived") return "archived";
    if(a.status === "completed") return "completed";
    if(a.endDate && Daily.cmpDate(date, a.endDate) > 0) return "expired";
    if(a.schedule === "once" && a.dueDate && Daily.cmpDate(date, a.dueDate) > 0) return "overdue";
    const next = nextOccurrenceDate(a, date);
    if(next && Daily.cmpDate(next, date) === 0) return "active";
    if(next) return "upcoming";
    return a.schedule === "weekdays" ? "expired" : "active";
  }
  function rewardFor(input, skillIds){
    const type = input.targetType === "minutes" ? "minutes" : "problems";
    const target = Number(input.target || 0);
    const base = type === "minutes" ? Math.ceil(target / 5) * 2 : Math.ceil(target / 10) * 2;
    const grades = (skillIds || []).map(id => C.BY_ID[id]).filter(Boolean).map(s => C.GRADE_INDEX[s.grade] || 0);
    const avgGrade = grades.length ? grades.reduce((a,b)=>a+b,0) / grades.length : 3;
    const breadth = Math.min(8, Math.max(0, (skillIds || []).length - 1));
    const accuracyBonus = input.minimumAccuracy ? Math.ceil((Number(input.minimumAccuracy) - 50) / 10) : 0;
    const coins = Math.max(LIMITS.rewardMin, Math.min(LIMITS.rewardMax, Math.round(base + avgGrade * 2 + breadth + accuracyBonus)));
    return {coins};
  }
  function autoTitle(a){
    const first = a.skillIds && a.skillIds[0] && C.BY_ID[a.skillIds[0]];
    const label = a.groupIds && a.groupIds.length ? (groupMap()[a.groupIds[0]] || {}).group : first ? first.label : "Math";
    return (a.targetType === "minutes" ? "Practice " + label + " for " + a.target + " minutes" : "Complete " + a.target + " " + label + " problems").slice(0, LIMITS.titleLength);
  }
  function validateInput(input, options){
    input = input && typeof input === "object" ? input : {};
    options = options || {};
    const scope = resolveScope(input);
    if(scope.error) return scope;
    const targetType = input.targetType === "minutes" ? "minutes" : input.targetType === "problems" ? "problems" : null;
    if(!targetType) return {error:"invalid_target_type"};
    const target = Math.floor(Number(input.target || 0));
    if(targetType === "problems" && (target < LIMITS.problemMin || target > LIMITS.problemMax)) return {error:"invalid_target"};
    if(targetType === "minutes" && (target < LIMITS.minuteMin || target > LIMITS.minuteMax)) return {error:"invalid_target"};
    let minimumAccuracy = input.minimumAccuracy == null || input.minimumAccuracy === "" ? null : Math.floor(Number(input.minimumAccuracy));
    if(minimumAccuracy != null && (!Number.isFinite(minimumAccuracy) || minimumAccuracy < 50 || minimumAccuracy > 100)) return {error:"invalid_accuracy"};
    if(targetType === "minutes" && minimumAccuracy != null) return {error:"accuracy_not_supported_for_time"};
    const schedule = input.schedule === "weekdays" ? "weekdays" : input.schedule === "once" || !input.schedule ? "once" : null;
    if(!schedule) return {error:"invalid_schedule"};
    const weekdays = schedule === "weekdays" ? normalizeWeekdays(input.weekdays) : [];
    if(schedule === "weekdays" && (!Array.isArray(input.weekdays) || input.weekdays.some(d => !WEEKDAYS.includes(String(d))) || !weekdays.length)) return {error:"invalid_weekday"};
    const due = validateDateOrNull(input.dueDate, "due_date");
    if(due.error) return due;
    const end = validateDateOrNull(input.endDate, "end_date");
    if(end.error) return end;
    const effectiveDate = options.effectiveDate || Daily.todayLocal(new Date());
    if(due.date && Daily.cmpDate(due.date, effectiveDate) < 0) return {error:"due_date_before_start"};
    if(end.date && Daily.cmpDate(end.date, effectiveDate) < 0) return {error:"end_date_before_start"};
    if(due.date && end.date && Daily.cmpDate(end.date, due.date) < 0) return {error:"end_date_before_due_date"};
    if(schedule === "once" && end.date) return {error:"end_date_requires_repeating"};
    return {
      title:cleanText(input.title, LIMITS.titleLength),
      notes:cleanText(input.notes, LIMITS.noteLength),
      scope,
      targetType,
      target,
      minimumAccuracy,
      schedule,
      weekdays,
      dueDate:due.date,
      endDate:end.date,
    };
  }
  function normalizeAssignment(a){
    a = a && typeof a === "object" ? clone(a) : {};
    a.id = String(a.id || "");
    a.title = cleanText(a.title, LIMITS.titleLength);
    a.createdAt = Number(a.createdAt || 0);
    a.updatedAt = Number(a.updatedAt || a.createdAt || 0);
    a.status = ["active","completed","expired","archived"].includes(a.status) ? a.status : "active";
    a.source = a.source === "parent" ? "parent" : "parent";
    a.scope = a.scope && typeof a.scope === "object" ? a.scope : {};
    a.scope.skillIds = unique(a.scope.skillIds).filter(id => C.BY_ID[id]).slice(0, LIMITS.maxSkills);
    a.scope.groupIds = unique(a.scope.groupIds).filter(id => groupMap()[id]).slice(0, LIMITS.maxGroups);
    a.skillIds = unique(a.skillIds || a.scope.skillIds).filter(id => C.BY_ID[id]).slice(0, LIMITS.maxSkills);
    a.groupIds = unique(a.groupIds || a.scope.groupIds).filter(id => groupMap()[id]).slice(0, LIMITS.maxGroups);
    a.targetType = a.targetType === "minutes" ? "minutes" : "problems";
    a.target = Math.max(1, Math.min(a.targetType === "minutes" ? LIMITS.minuteMax : LIMITS.problemMax, Math.floor(Number(a.target || 1))));
    a.minimumAccuracy = a.minimumAccuracy == null ? null : Math.max(50, Math.min(100, Math.floor(Number(a.minimumAccuracy || 0))));
    a.schedule = a.schedule === "weekdays" ? "weekdays" : "once";
    a.weekdays = a.schedule === "weekdays" ? normalizeWeekdays(a.weekdays) : [];
    a.dueDate = Daily.validDate(a.dueDate) ? a.dueDate : null;
    a.endDate = Daily.validDate(a.endDate) ? a.endDate : null;
    a.reward = a.reward && Number.isFinite(Number(a.reward.coins)) ? {coins:Math.max(LIMITS.rewardMin, Math.min(LIMITS.rewardMax, Math.floor(Number(a.reward.coins))))} : rewardFor(a, a.skillIds);
    a.occurrences = a.occurrences && typeof a.occurrences === "object" ? a.occurrences : {};
    a.occurrences.recentCompletedDates = unique(a.occurrences.recentCompletedDates).filter(Daily.validDate).slice(-LIMITS.recentCompletedMax);
    a.occurrences.recentOccurrences = Array.isArray(a.occurrences.recentOccurrences) ? a.occurrences.recentOccurrences.filter(x => x && Daily.validDate(x.date)).slice(-LIMITS.recentCompletedMax).map(x => ({
      date:x.date,
      attempted:Math.max(0, Number(x.attempted || 0)),
      correct:Math.max(0, Number(x.correct || 0)),
      activeSeconds:Math.max(0, Number(x.activeSeconds || 0)),
      completed:!!x.completed,
      missed:!!x.missed,
      rewardCoins:Math.max(0, Number(x.rewardCoins || 0)),
      completedAt:Number(x.completedAt || 0) || null,
    })) : [];
    a.occurrences.lastCompletedDate = Daily.validDate(a.occurrences.lastCompletedDate) ? a.occurrences.lastCompletedDate : null;
    a.occurrences.currentOccurrenceDate = Daily.validDate(a.occurrences.currentOccurrenceDate) ? a.occurrences.currentOccurrenceDate : null;
    a.occurrences.nextOccurrenceDate = Daily.validDate(a.occurrences.nextOccurrenceDate) ? a.occurrences.nextOccurrenceDate : null;
    a.occurrences.current = a.occurrences.current && typeof a.occurrences.current === "object" ? a.occurrences.current : null;
    if(a.occurrences.current) {
      a.occurrences.current = {
        date:Daily.validDate(a.occurrences.current.date) ? a.occurrences.current.date : a.occurrences.currentOccurrenceDate,
        attempted:Math.max(0, Number(a.occurrences.current.attempted || 0)),
        correct:Math.max(0, Number(a.occurrences.current.correct || 0)),
        activeSeconds:Math.max(0, Number(a.occurrences.current.activeSeconds || 0)),
        completed:!!a.occurrences.current.completed,
        completedAt:Number(a.occurrences.current.completedAt || 0) || null,
        rewardAwarded:!!a.occurrences.current.rewardAwarded,
        rewardAwardedAt:Number(a.occurrences.current.rewardAwardedAt || 0) || null,
        rewardCoins:Math.max(0, Number(a.occurrences.current.rewardCoins || 0)),
      };
    }
    a.occurrences.pendingQuestion = a.occurrences.pendingQuestion && typeof a.occurrences.pendingQuestion === "object" ? a.occurrences.pendingQuestion : null;
    a.notes = cleanText(a.notes, LIMITS.noteLength);
    a.archivedAt = Number(a.archivedAt || 0) || null;
    return a;
  }
  function normalizeList(list, localDate){
    return (Array.isArray(list) ? list : []).map(normalizeAssignment).filter(a => a.id && a.skillIds.length).slice(-100).map(a => refreshOccurrence(a, localDate));
  }
  function refreshOccurrence(a, localDate){
    a = normalizeAssignment(a);
    const date = Daily.validDate(localDate) ? localDate : Daily.todayLocal(new Date());
    if(a.schedule === "weekdays") {
      const days = normalizeWeekdays(a.weekdays);
      const recorded = new Set((a.occurrences.recentOccurrences || []).map(x => x.date));
      const completed = new Set(a.occurrences.recentCompletedDates || []);
      let scan = a.occurrences.currentOccurrenceDate || (a.occurrences.lastCompletedDate ? Daily.addDays(a.occurrences.lastCompletedDate, 1) : null);
      for(let i=0; scan && i<14 && Daily.cmpDate(scan, date) < 0; i++, scan = Daily.addDays(scan, 1)) {
        if(a.endDate && Daily.cmpDate(scan, a.endDate) > 0) break;
        if(days.includes(Daily.weekdayKey(scan)) && !completed.has(scan) && !recorded.has(scan)) {
          a.occurrences.recentOccurrences.push({date:scan, attempted:0, correct:0, activeSeconds:0, completed:false, missed:true, rewardCoins:0, completedAt:null});
          recorded.add(scan);
        }
      }
      a.occurrences.recentOccurrences = a.occurrences.recentOccurrences.slice(-LIMITS.recentCompletedMax);
    }
    if(a.schedule === "weekdays" && a.occurrences.current && a.occurrences.current.date && Daily.cmpDate(a.occurrences.current.date, date) < 0 && !a.occurrences.current.completed) {
      a.occurrences.recentOccurrences.push(Object.assign({}, a.occurrences.current, {missed:true}));
      a.occurrences.recentOccurrences = a.occurrences.recentOccurrences.slice(-LIMITS.recentCompletedMax);
      a.occurrences.current = null;
      a.occurrences.pendingQuestion = null;
      a.occurrences.currentOccurrenceDate = null;
    }
    const next = nextOccurrenceDate(a, date);
    a.occurrences.nextOccurrenceDate = next;
    a.occurrences.currentOccurrenceDate = next;
    if(a.status === "active" && scheduleStatus(a, localDate) === "expired") a.status = "expired";
    return a;
  }
  function signature(a){
    return JSON.stringify({
      skills:unique(a.skillIds).sort(),
      groups:unique(a.groupIds).sort(),
      targetType:a.targetType,
      target:a.target,
      minimumAccuracy:a.minimumAccuracy,
      schedule:a.schedule,
      weekdays:normalizeWeekdays(a.weekdays),
      dueDate:a.dueDate || null,
      endDate:a.endDate || null,
    });
  }
  function exactDuplicate(list, candidate, now){
    return normalizeList(list).some(a => a.status === "active" && signature(a) === signature(candidate) && Math.abs(Number(now || Date.now()) - Number(a.createdAt || 0)) <= LIMITS.duplicateWindowMs);
  }
  function choiceId(questionId, index){ return questionId + ":c" + index; }
  function idSafe(id){ return String(id || "").replace(/[^a-zA-Z0-9]/g, ""); }
  function occurrenceProgress(a, localDate){
    a = refreshOccurrence(a, localDate);
    if(a.status === "expired") return {error:"assignment_expired", assignment:a};
    if(a.status !== "active") return {error:a.status === "archived" ? "assignment_archived" : "assignment_not_active", assignment:a};
    if(scheduleStatus(a, localDate) === "expired") return {error:"assignment_expired", assignment:a};
    const occurrenceDate = a.occurrences.currentOccurrenceDate || nextOccurrenceDate(a, localDate);
    if(!occurrenceDate) return {error:"assignment_not_scheduled", assignment:a};
    if(a.schedule === "weekdays" && Daily.cmpDate(occurrenceDate, localDate) > 0) return {error:"assignment_upcoming", assignment:a};
    if(!a.occurrences.current || a.occurrences.current.date !== occurrenceDate) {
      a.occurrences.current = { date:occurrenceDate, attempted:0, correct:0, activeSeconds:0, completed:false, completedAt:null, rewardAwarded:false, rewardAwardedAt:null, rewardCoins:0 };
      a.occurrences.pendingQuestion = null;
    }
    return {assignment:a, occurrence:a.occurrences.current};
  }
  function assignmentProgressSummary(a, localDate){
    const r = occurrenceProgress(a, localDate);
    const a2 = r.assignment || a;
    const o = r.occurrence || (a2.occurrences && a2.occurrences.current) || {};
    const attempted = Number(o.attempted || 0), correct = Number(o.correct || 0), activeSeconds = Number(o.activeSeconds || 0);
    const value = a2.targetType === "minutes" ? Math.floor(activeSeconds / 60) : attempted;
    const accuracy = attempted ? Math.round((correct / attempted) * 100) : null;
    const targetReached = value >= Number(a2.target || 1);
    const accuracyMet = a2.minimumAccuracy == null || (accuracy != null && accuracy >= Number(a2.minimumAccuracy));
    return {
      occurrenceDate:o.date || (a2.occurrences && a2.occurrences.currentOccurrenceDate) || null,
      attempted, correct, activeSeconds, value,
      target:a2.target,
      remaining:Math.max(0, Number(a2.target || 0) - value),
      accuracy,
      targetReached,
      accuracyMet,
      completed:!!o.completed,
      completedAt:o.completedAt || null,
      rewardAwarded:!!o.rewardAwarded,
      rewardAwardedAt:o.rewardAwardedAt || null,
      rewardCoins:Number(o.rewardCoins || 0),
    };
  }
  function completionReady(a){
    const p = assignmentProgressSummary(a);
    if(a.targetType === "minutes") return p.value >= Number(a.target || 1);
    return p.targetReached && p.accuracyMet;
  }
  function markCompleteIfReady(a, at){
    const p = assignmentProgressSummary(a);
    const o = a.occurrences.current;
    if(!o || o.completed || !completionReady(a)) return {assignment:a, completed:false, rewardCoins:0, progress:p};
    o.completed = true;
    o.completedAt = at || Date.now();
    let rewardCoins = 0;
    if(!o.rewardAwarded) {
      rewardCoins = Math.max(0, Number(a.reward && a.reward.coins || 0));
      o.rewardAwarded = true;
      o.rewardAwardedAt = o.completedAt;
      o.rewardCoins = rewardCoins;
    }
    a.occurrences.lastCompletedDate = o.date;
    if(!a.occurrences.recentCompletedDates.includes(o.date)) a.occurrences.recentCompletedDates.push(o.date);
    a.occurrences.recentCompletedDates = a.occurrences.recentCompletedDates.slice(-LIMITS.recentCompletedMax);
    a.occurrences.recentOccurrences.push({date:o.date, attempted:o.attempted, correct:o.correct, activeSeconds:o.activeSeconds, completed:true, rewardCoins, completedAt:o.completedAt});
    a.occurrences.recentOccurrences = a.occurrences.recentOccurrences.slice(-LIMITS.recentCompletedMax);
    a.occurrences.pendingQuestion = null;
    if(a.schedule === "once") {
      a.status = "completed";
    } else {
      a.occurrences.current = null;
      a.occurrences.currentOccurrenceDate = null;
    }
    a.updatedAt = at || Date.now();
    p.completed = true;
    p.completedAt = o.completedAt;
    p.rewardAwarded = true;
    p.rewardAwardedAt = o.rewardAwardedAt;
    p.rewardCoins = rewardCoins;
    return {assignment:a, completed:true, rewardCoins, progress:p};
  }
  function publicQuestion(q){
    if(!q) return null;
    return { id:q.id, assignmentId:q.assignmentId, occurrenceDate:q.occurrenceDate, skillId:q.skillId, skillLabel:q.skillLabel, skillGrade:q.skillGrade, questionNumber:q.questionNumber, qHTML:q.qHTML, tip:q.tip || "", choices:(q.choices || []).map(c => ({id:c.id,h:c.h})) };
  }
  function issueQuestion(a, generator, localDate, at){
    const p = occurrenceProgress(a, localDate);
    if(p.error) return p;
    a = p.assignment;
    if(a.occurrences.pendingQuestion && !a.occurrences.pendingQuestion.answered) return {assignment:a, question:publicQuestion(a.occurrences.pendingQuestion), resumed:true};
    if(a.occurrences.current && a.occurrences.current.completed) return {error:"assignment_occurrence_completed", assignment:a};
    const idx = Number(a.occurrences.current.attempted || 0) % Math.max(1, a.skillIds.length);
    const skillId = a.skillIds[idx], skill = C.BY_ID[skillId];
    const q = skill && generator ? generator(skillId, a.id + ":" + p.occurrence.date + ":" + Number(a.occurrences.current.attempted || 0)) : null;
    if(!skill || !q || !Array.isArray(q.choices)) return {error:"question_unavailable", assignment:a};
    const okIndex = q.choices.findIndex(c => c && c.ok);
    if(okIndex < 0) return {error:"question_unavailable", assignment:a};
    const questionId = "asg-" + idSafe(a.id) + "-" + idSafe(p.occurrence.date) + "-q" + (Number(a.occurrences.current.attempted || 0) + 1) + "-" + (at || Date.now());
    a.occurrences.pendingQuestion = {
      id:questionId, assignmentId:a.id, occurrenceDate:p.occurrence.date, skillId, skillLabel:skill.label, skillGrade:skill.grade,
      questionNumber:Number(a.occurrences.current.attempted || 0) + 1,
      qHTML:q.qHTML, tip:q.tip || "",
      choices:q.choices.map((c,i) => ({id:choiceId(questionId, i), h:c.h})),
      correctChoiceId:choiceId(questionId, okIndex),
      issuedAt:at || Date.now(),
      answered:false,
    };
    return {assignment:a, question:publicQuestion(a.occurrences.pendingQuestion), resumed:false};
  }
  function answerQuestion(a, questionId, choiceId, localDate, at){
    const p = occurrenceProgress(a, localDate);
    if(p.error) return p;
    a = p.assignment;
    const q = a.occurrences.pendingQuestion;
    if(!q || q.answered) return {error:"question_required", assignment:a};
    if(q.id !== String(questionId || "")) return {error:"stale_question", assignment:a};
    const choice = (q.choices || []).find(c => c.id === String(choiceId || ""));
    if(!choice) return {error:"invalid_choice", assignment:a};
    if(q.occurrenceDate !== a.occurrences.current.date) return {error:"invalid_occurrence", assignment:a};
    const correct = choice.id === q.correctChoiceId;
    q.answered = true;
    q.answeredAt = at || Date.now();
    a.occurrences.current.attempted++;
    if(correct) a.occurrences.current.correct++;
    a.occurrences.pendingQuestion = null;
    const done = markCompleteIfReady(a, at);
    return {assignment:done.assignment, correct, skillId:q.skillId, occurrenceDate:q.occurrenceDate, completed:done.completed, rewardCoins:done.rewardCoins, progress:done.progress};
  }
  function addActiveTime(a, eventId, seconds, localDate, at){
    const p = occurrenceProgress(a, localDate);
    if(p.error) return p;
    a = p.assignment;
    if(a.targetType !== "minutes") return {error:"assignment_not_time_based", assignment:a};
    const n = Number(seconds || 0);
    if(!Number.isFinite(n) || n <= 0) return {error:"invalid_seconds", assignment:a};
    if(n > Daily.MAX_HEARTBEAT_SECONDS) return {error:"seconds_too_large", assignment:a};
    a.occurrences.recentEventIds = Array.isArray(a.occurrences.recentEventIds) ? a.occurrences.recentEventIds.slice(-Daily.MAX_RECENT_EVENTS) : [];
    const id = String(eventId || "");
    if(!id) return {error:"event_required", assignment:a};
    if(a.occurrences.recentEventIds.includes(id)) return {assignment:a, duplicate:true, progress:assignmentProgressSummary(a)};
    a.occurrences.recentEventIds.push(id);
    a.occurrences.recentEventIds = a.occurrences.recentEventIds.slice(-Daily.MAX_RECENT_EVENTS);
    a.occurrences.current.activeSeconds += Math.floor(n);
    const done = markCompleteIfReady(a, at);
    return {assignment:done.assignment, duplicate:false, completed:done.completed, rewardCoins:done.rewardCoins, progress:done.progress};
  }
  function createAssignment(list, input, options){
    options = options || {};
    list = normalizeList(list, options.effectiveDate);
    if(list.filter(a => a.status === "active").length >= LIMITS.maxActiveAssignments) return {error:"too_many_active_assignments"};
    const v = validateInput(input, options);
    if(v.error) return v;
    const now = Number(options.now || Date.now());
    const id = String(options.id || ("asg_" + now.toString(36) + "_" + Math.random().toString(36).slice(2,8)));
    const a = normalizeAssignment({
      id,
      title:v.title,
      createdAt:now,
      updatedAt:now,
      status:"active",
      source:"parent",
      scope:{skillIds:v.scope.skillIds, groupIds:v.scope.groupIds},
      skillIds:v.scope.skillIds,
      groupIds:v.scope.groupIds,
      targetType:v.targetType,
      target:v.target,
      minimumAccuracy:v.minimumAccuracy,
      schedule:v.schedule,
      weekdays:v.weekdays,
      dueDate:v.dueDate,
      endDate:v.endDate,
      reward:rewardFor(v, v.scope.skillIds),
      occurrences:{recentCompletedDates:[], lastCompletedDate:null},
      notes:v.notes,
      archivedAt:null,
    });
    if(!a.title) a.title = autoTitle(a);
    refreshOccurrence(a, options.effectiveDate);
    if(exactDuplicate(list, a, now)) return {error:"duplicate_assignment"};
    list.push(a);
    return {assignments:list, assignment:a};
  }
  function updateAssignment(list, id, patch, options){
    options = options || {};
    list = normalizeList(list, options.effectiveDate);
    const idx = list.findIndex(a => a.id === String(id || ""));
    if(idx < 0) return {error:"assignment_not_found"};
    const current = list[idx];
    if(current.status !== "active") return {error:"assignment_not_active"};
    const merged = Object.assign({}, current, patch || {});
    merged.skillIds = patch && patch.skillIds ? patch.skillIds : current.skillIds;
    merged.groupIds = patch && patch.groupIds ? patch.groupIds : current.groupIds;
    const v = validateInput(merged, options);
    if(v.error) return v;
    const updated = normalizeAssignment(Object.assign({}, current, {
      title:v.title || autoTitle(Object.assign({}, current, {skillIds:v.scope.skillIds, groupIds:v.scope.groupIds, targetType:v.targetType, target:v.target})),
      updatedAt:Number(options.now || Date.now()),
      scope:{skillIds:v.scope.skillIds, groupIds:v.scope.groupIds},
      skillIds:v.scope.skillIds,
      groupIds:v.scope.groupIds,
      targetType:v.targetType,
      target:v.target,
      minimumAccuracy:v.minimumAccuracy,
      schedule:v.schedule,
      weekdays:v.weekdays,
      dueDate:v.dueDate,
      endDate:v.endDate,
      reward:rewardFor(v, v.scope.skillIds),
      notes:v.notes,
    }));
    updated.occurrences = current.occurrences || updated.occurrences;
    refreshOccurrence(updated, options.effectiveDate);
    list[idx] = updated;
    return {assignments:list, assignment:updated};
  }
  function archiveAssignment(list, id, options){
    options = options || {};
    list = normalizeList(list, options.effectiveDate);
    const idx = list.findIndex(a => a.id === String(id || ""));
    if(idx < 0) return {error:"assignment_not_found"};
    const a = list[idx];
    a.status = "archived";
    a.updatedAt = Number(options.now || Date.now());
    a.archivedAt = a.updatedAt;
    list[idx] = refreshOccurrence(a, options.effectiveDate);
    return {assignments:list, assignment:list[idx]};
  }
  function summarizeAssignment(a, options){
    options = options || {};
    a = refreshOccurrence(a, options.localDate);
    const skills = (a.skillIds || []).map(id => C.BY_ID[id]).filter(Boolean).map(s => ({id:s.id,label:s.label,grade:s.grade,group:s.group}));
    const groups = (a.groupIds || []).map(id => groupMap()[id]).filter(Boolean);
    const out = {
      id:a.id,
      title:a.title,
      status:a.status,
      displayStatus:scheduleStatus(a, options.localDate),
      source:a.source,
      skillIds:a.skillIds,
      groupIds:a.groupIds,
      skills,
      groups,
      targetType:a.targetType,
      target:a.target,
      minimumAccuracy:a.minimumAccuracy,
      schedule:a.schedule,
      weekdays:a.weekdays,
      dueDate:a.dueDate,
      endDate:a.endDate,
      reward:a.reward,
      progress:assignmentProgressSummary(a, options.localDate),
      createdAt:a.createdAt,
      updatedAt:a.updatedAt,
      nextOccurrenceDate:a.occurrences && a.occurrences.nextOccurrenceDate || null,
      lastCompletedDate:a.occurrences && a.occurrences.lastCompletedDate || null,
      archivedAt:a.archivedAt || null,
    };
    if(options.includeNotes) out.notes = a.notes || "";
    return out;
  }
  function summarizeList(list, options){
    return normalizeList(list, options && options.localDate).map(a => summarizeAssignment(a, options));
  }
  function activeSummaries(list, options){
    return summarizeList(list, options).filter(a => a.status === "active" && a.displayStatus !== "expired");
  }

  const api = {
    WEEKDAYS, LIMITS, groupId, groupCatalog, normalizeWeekdays, skillsForGroups, resolveScope,
    rewardFor, validateInput, normalizeAssignment, normalizeList, refreshOccurrence, nextOccurrenceDate,
    scheduleStatus, occurrenceProgress, assignmentProgressSummary, issueQuestion, publicQuestion,
    answerQuestion, addActiveTime, markCompleteIfReady, createAssignment, updateAssignment,
    archiveAssignment, summarizeAssignment, summarizeList, activeSummaries, signature,
  };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_ASSIGNMENTS = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
