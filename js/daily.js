/* Number Ninja daily goals, streaks, vacation pauses, and grace days.
 * Pure core: no DOM, no storage, no account writes.
 */
(function(root){
  "use strict";
  const WEEKDAYS = ["sun","mon","tue","wed","thu","fri","sat"];
  const MAX_DAYS = 60;
  const MAX_RECENT_EVENTS = 80;
  const MAX_HEARTBEAT_SECONDS = 60;
  const GRACE_EVERY_COMPLETIONS = 5;

  function clone(x){ return JSON.parse(JSON.stringify(x == null ? null : x)); }
  function pad(n){ return String(n).padStart(2,"0"); }
  function validDate(s){ return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(s||"")) && !Number.isNaN(Date.parse(String(s)+"T00:00:00Z")); }
  function todayLocal(d){
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  }
  function parseDate(s){ return new Date(String(s) + "T00:00:00Z"); }
  function cmpDate(a,b){ return validDate(a)&&validDate(b) ? Math.sign(parseDate(a)-parseDate(b)) : 0; }
  function addDays(s,n){ const d=parseDate(s); d.setUTCDate(d.getUTCDate()+n); return d.getUTCFullYear()+"-"+pad(d.getUTCMonth()+1)+"-"+pad(d.getUTCDate()); }
  function weekdayKey(s){ return WEEKDAYS[parseDate(s).getUTCDay()]; }
  function defaultDailyGoals(){
    return {
      sun:{enabled:false,type:"problems",target:12},
      mon:{enabled:true,type:"problems",target:12},
      tue:{enabled:true,type:"problems",target:12},
      wed:{enabled:true,type:"problems",target:12},
      thu:{enabled:true,type:"problems",target:12},
      fri:{enabled:true,type:"problems",target:12},
      sat:{enabled:false,type:"problems",target:12},
    };
  }
  function normalizeGoals(goals){
    const base = defaultDailyGoals();
    const src = goals && typeof goals === "object" ? goals : {};
    WEEKDAYS.forEach(k=>{
      const g = src[k] || {};
      base[k] = {
        enabled:typeof g.enabled === "boolean" ? g.enabled : !!base[k].enabled,
        type:g.type === "minutes" ? "minutes" : "problems",
        target:Math.max(1, Math.min(120, Number(g.target || base[k].target || 12))),
      };
    });
    return base;
  }
  function newState(){
    return {
      days:{},
      currentStreak:0,
      longestStreak:0,
      lastProcessedDate:null,
      completedScheduledDays:0,
      protectedDates:{},
      graceBalance:0,
      totalGraceEarned:0,
      totalGraceUsed:0,
      lastAwardedAt:null,
      graceHistory:[],
      recentEventIds:[],
    };
  }
  function normalizeState(state){
    const s = state && typeof state === "object" ? clone(state) : {};
    const base = newState();
    Object.assign(base, s);
    base.days = base.days && typeof base.days === "object" ? base.days : {};
    base.protectedDates = base.protectedDates && typeof base.protectedDates === "object" ? base.protectedDates : {};
    base.graceHistory = Array.isArray(base.graceHistory) ? base.graceHistory : [];
    base.recentEventIds = Array.isArray(base.recentEventIds) ? base.recentEventIds.slice(-MAX_RECENT_EVENTS) : [];
    base.currentStreak = Math.max(0, Number(base.currentStreak || 0));
    base.longestStreak = Math.max(0, Number(base.longestStreak || 0));
    base.completedScheduledDays = Math.max(0, Number(base.completedScheduledDays || 0));
    base.graceBalance = Math.max(0, Number(base.graceBalance || 0));
    base.totalGraceEarned = Math.max(0, Number(base.totalGraceEarned || 0));
    base.totalGraceUsed = Math.max(0, Number(base.totalGraceUsed || 0));
    return base;
  }
  function ensureControls(controls){
    controls = controls || {};
    controls.dailyGoals = normalizeGoals(controls.dailyGoals);
    controls.dailyActivity = normalizeState(controls.dailyActivity);
    controls.vacationRanges = Array.isArray(controls.vacationRanges) ? controls.vacationRanges.filter(r=>validDate(r.start)&&validDate(r.end)&&cmpDate(r.start,r.end)<=0).slice(-20) : [];
    return controls;
  }
  function dayRecord(state, date){
    const d = state.days[date] || {date, problemsCompleted:0, activeSeconds:0, goalCompleted:false, completedAt:null};
    d.date = date;
    d.problemsCompleted = Math.max(0, Number(d.problemsCompleted || 0));
    d.activeSeconds = Math.max(0, Number(d.activeSeconds || 0));
    d.goalCompleted = !!d.goalCompleted;
    state.days[date] = d;
    return d;
  }
  function dayGoal(controls, date){
    ensureControls(controls);
    return controls.dailyGoals[weekdayKey(date)] || {enabled:false,type:"problems",target:12};
  }
  function isVacation(controls, date){
    return (controls.vacationRanges || []).some(r => validDate(r.start) && validDate(r.end) && cmpDate(r.start,date)<=0 && cmpDate(date,r.end)<=0);
  }
  function isScheduled(controls, date){
    return !!dayGoal(controls, date).enabled;
  }
  function trimDays(state, today){
    const keys = Object.keys(state.days || {}).sort();
    while(keys.length > MAX_DAYS) delete state.days[keys.shift()];
    state.recentEventIds = (state.recentEventIds || []).slice(-MAX_RECENT_EVENTS);
    state.graceHistory = (state.graceHistory || []).slice(-50);
    return state;
  }
  function awardGraceIfDue(state, at){
    const shouldHave = Math.floor((state.completedScheduledDays || 0) / GRACE_EVERY_COMPLETIONS);
    const alreadyAuto = Number(state.autoGraceEarned || 0);
    if(shouldHave > alreadyAuto) {
      const add = shouldHave - alreadyAuto;
      state.graceBalance += add;
      state.totalGraceEarned += add;
      state.autoGraceEarned = shouldHave;
      state.lastAwardedAt = at || Date.now();
      state.graceHistory.push({at:at || Date.now(), quantity:add, source:"earned"});
    }
  }
  function completeScheduledDay(state, date, at){
    const d = dayRecord(state, date);
    if(d.streakCounted) return;
    d.goalCompleted = true;
    d.completedAt = d.completedAt || (at || Date.now());
    d.streakCounted = true;
    state.currentStreak = Number(state.currentStreak || 0) + 1;
    state.longestStreak = Math.max(Number(state.longestStreak || 0), state.currentStreak);
    state.completedScheduledDays = Number(state.completedScheduledDays || 0) + 1;
    awardGraceIfDue(state, at);
  }
  function processThrough(controls, today, at){
    ensureControls(controls);
    if(!validDate(today)) return {error:"invalid_date"};
    const state = controls.dailyActivity;
    if(!state.lastProcessedDate) state.lastProcessedDate = addDays(today, -1);
    let date = addDays(state.lastProcessedDate, 1);
    while(cmpDate(date, today) < 0) {
      const goal = dayGoal(controls, date);
      const rec = dayRecord(state, date);
      if(!goal.enabled) {
        rec.notScheduled = true;
      } else if(isVacation(controls, date)) {
        rec.vacation = true;
      } else if(rec.goalCompleted) {
        completeScheduledDay(state, date, rec.completedAt || at);
      } else if(!state.protectedDates[date] && state.graceBalance > 0) {
        state.graceBalance--;
        state.totalGraceUsed++;
        state.protectedDates[date] = {date, source:"grace", at:at || Date.now()};
        rec.protected = true;
        state.graceHistory.push({at:at || Date.now(), quantity:-1, source:"auto", date});
      } else if(!state.protectedDates[date]) {
        rec.missed = true;
        state.currentStreak = 0;
      }
      state.lastProcessedDate = date;
      date = addDays(date, 1);
    }
    trimDays(state, today);
    controls.dailyActivity = state;
    return {ok:true,state};
  }
  function evaluateToday(controls, date, at){
    ensureControls(controls);
    if(!validDate(date)) return {error:"invalid_date"};
    processThrough(controls, date, at);
    const state = controls.dailyActivity;
    const goal = dayGoal(controls, date);
    const rec = dayRecord(state, date);
    const vacation = isVacation(controls, date);
    const scheduled = !!goal.enabled;
    const value = goal.type === "minutes" ? Math.floor(rec.activeSeconds / 60) : rec.problemsCompleted;
    const complete = scheduled && !vacation && value >= Number(goal.target || 1);
    if(complete && !rec.goalCompleted) completeScheduledDay(state, date, at);
    controls.dailyActivity = state;
    return {
      date,
      scheduled,
      vacation,
      goal,
      progress:{problemsCompleted:rec.problemsCompleted, activeSeconds:rec.activeSeconds, value, target:goal.target, completed:!!rec.goalCompleted},
      streak:{
        currentStreak:state.currentStreak,
        longestStreak:state.longestStreak,
        graceBalance:state.graceBalance,
        totalGraceEarned:state.totalGraceEarned,
        totalGraceUsed:state.totalGraceUsed,
      },
      nextScheduledDate:nextScheduledDate(controls, date),
    };
  }
  function nextScheduledDate(controls, date){
    for(let i=1;i<=14;i++){ const d=addDays(date,i); if(isScheduled(controls,d) && !isVacation(controls,d)) return d; }
    return null;
  }
  function recordEvent(state, eventId){
    if(!eventId) return {error:"event_required"};
    if(state.recentEventIds.includes(eventId)) return {duplicate:true};
    state.recentEventIds.push(eventId);
    if(state.recentEventIds.length > MAX_RECENT_EVENTS) state.recentEventIds = state.recentEventIds.slice(-MAX_RECENT_EVENTS);
    return {ok:true};
  }
  function addProblem(controls, date, eventId, source, at){
    ensureControls(controls);
    if(!validDate(date)) return {error:"invalid_date"};
    if(source === "placement") return {error:"placement_does_not_count"};
    const ev = recordEvent(controls.dailyActivity, eventId);
    if(ev.error) return ev;
    if(ev.duplicate) return {duplicate:true, status:evaluateToday(controls,date,at)};
    processThrough(controls, date, at);
    dayRecord(controls.dailyActivity, date).problemsCompleted++;
    return {ok:true, status:evaluateToday(controls, date, at)};
  }
  function addActiveTime(controls, date, eventId, seconds, source, at){
    ensureControls(controls);
    if(!validDate(date)) return {error:"invalid_date"};
    if(source === "placement") return {error:"placement_does_not_count"};
    const n = Number(seconds || 0);
    if(!Number.isFinite(n) || n <= 0) return {error:"invalid_seconds"};
    if(n > MAX_HEARTBEAT_SECONDS) return {error:"seconds_too_large"};
    const ev = recordEvent(controls.dailyActivity, eventId);
    if(ev.error) return ev;
    if(ev.duplicate) return {duplicate:true, status:evaluateToday(controls,date,at)};
    processThrough(controls, date, at);
    dayRecord(controls.dailyActivity, date).activeSeconds += Math.floor(n);
    return {ok:true, status:evaluateToday(controls, date, at)};
  }
  function grantGrace(controls, quantity, source, at){
    ensureControls(controls);
    const q = Math.max(1, Math.min(30, Math.floor(Number(quantity || 0))));
    controls.dailyActivity.graceBalance += q;
    controls.dailyActivity.totalGraceEarned += q;
    controls.dailyActivity.graceHistory.push({at:at || Date.now(), quantity:q, source:source || "parent"});
    controls.dailyActivity.graceHistory = controls.dailyActivity.graceHistory.slice(-50);
    return {quantity:q, state:controls.dailyActivity};
  }
  function validateGoals(goals){
    const out = normalizeGoals(goals);
    return out;
  }
  function validateVacations(ranges){
    if(!Array.isArray(ranges)) return [];
    return ranges.filter(r=>validDate(r.start)&&validDate(r.end)&&cmpDate(r.start,r.end)<=0).slice(-20).map(r=>({start:r.start,end:r.end,label:String(r.label||"").slice(0,40)}));
  }

  const api = {
    WEEKDAYS, MAX_DAYS, MAX_RECENT_EVENTS, MAX_HEARTBEAT_SECONDS, GRACE_EVERY_COMPLETIONS,
    todayLocal, validDate, cmpDate, addDays, weekdayKey, defaultDailyGoals, normalizeGoals, newState, normalizeState,
    ensureControls, dayGoal, isVacation, isScheduled, processThrough, evaluateToday, addProblem, addActiveTime,
    grantGrace, validateGoals, validateVacations,
  };
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.NINJA_DAILY = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
