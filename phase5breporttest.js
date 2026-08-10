const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function key(name){ return "player:" + name.toLowerCase(); }
function recFor(name){ return JSON.parse(KV.store.get(key(name))); }
function writeRec(name, rec){ KV.store.set(key(name), JSON.stringify(rec)); }
function activityKey(name){ return key(name) + ":activity"; }
function attempt(id, date, source, skillId, correct, help, extra){
  return Object.assign({attemptId:id, at:Date.parse(date+"T12:00:00Z"), localDate:date, source:source||"practice", mode:source||"practice", skillId:skillId||"4.multiMultiply", questionId:id, choiceId:"choice", correct:!!correct, helpUsed:!!help}, extra||{});
}
async function setup(){
  await call({action:"register_parent", name:"ReportParent", pin:"2222"});
  await call({action:"register_student", name:"ReportKid", pin:"1234", grade:"4"});
  await call({action:"link_child", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", childPin:"1234"});
  const attempts = [
    attempt("a1","2026-08-08","practice","4.multiMultiply",true,false),
    attempt("a2","2026-08-08","practice","4.multiMultiply",false,true),
    attempt("a3","2026-08-08","workbook","4.multiMultiply",false,true),
    attempt("a4","2026-08-09","assignment","4.multiMultiply",false,true,{assignmentId:"asg1",occurrenceDate:"2026-08-09"}),
    attempt("a5","2026-08-09","practice","4.multiMultiply",false,false),
    attempt("a6","2026-08-09","practice","4.multiMultiply",false,false),
    attempt("a7","2026-08-09","mastery_review","4.longDivision",true,false),
    attempt("formula","2026-08-09","practice","4.longDivision",true,false,{assignmentId:"=cmd"})
  ];
  KV.store.set(activityKey("ReportKid"), JSON.stringify({
    version:1,
    attempts,
    daily:{
      "2026-04-01":{attempts:4,correct:3,help:1,activeSeconds:120,skills:["4.multiMultiply"],assignmentsCompleted:0,masteryEvents:0},
      "2026-08-08":{attempts:3,correct:1,help:2,activeSeconds:600,skills:["4.multiMultiply"]},
      "2026-08-09":{attempts:5,correct:2,help:1,activeSeconds:900,skills:["4.multiMultiply","4.longDivision"]}
    },
    skills:{},
    aggregates:{totalAttempts:8,totalCorrect:3,totalHelp:3}
  }));
  let rec = recFor("ReportKid");
  rec.data = {coins:0, level:2, stats:{totalCorrect:3}, progress:{mastery:{"4.multiMultiply":40,"4.longDivision":90,"4.factorsMultiples":90,"3.fluency":90,"4.placeValue":90}, topics:{"4.multiMultiply":{solved:1,first:1,wrongs:5,tutors:2},"4.longDivision":{solved:2,first:2,wrongs:0,tutors:0},"4.factorsMultiples":{solved:20,first:20,wrongs:0,tutors:0}}, solved:{}, story:{}}};
  rec.controls.skillMastery.bySkill["4.longDivision"] = {certified:true, needsReview:true, reviewDueAt:1};
  rec.controls.learningPlan.items = [{id:"lp1",type:"enrichment",skillId:"5.operations",status:"active",reasonText:"Ready for harder work.",createdAt:1,updatedAt:1}];
  rec.controls.dailyActivity.currentStreak = 12;
  rec.controls.dailyActivity.longestStreak = 20;
  rec.controls.dailyActivity.graceBalance = 2;
  rec.controls.dailyActivity.completedScheduledDays = 50;
  rec.controls.dailyActivity.days = {
    "2026-08-03":{date:"2026-08-03",goalCompleted:true,completedAt:Date.parse("2026-08-03T12:00:00Z")},
    "2026-08-05":{date:"2026-08-05",goalCompleted:true,completedAt:Date.parse("2026-08-05T12:00:00Z")},
    "2026-08-09":{date:"2026-08-09",goalCompleted:true,completedAt:Date.parse("2026-08-09T12:00:00Z")}
  };
  rec.controls.assignments = [{
    id:"asg1",title:"Multiply practice",status:"active",source:"parent",skillIds:["4.multiMultiply"],groupIds:[],targetType:"problems",target:10,dueDate:"2026-08-01",schedule:"weekdays",weekdays:["mon","wed","fri"],reward:{coins:8},
    occurrences:{currentOccurrenceDate:"2026-08-09",attempted:1,correct:0,completed:false,recentOccurrences:[
      {date:"2026-07-31",attempted:10,correct:10,activeSeconds:0,completed:true,rewardCoins:8,completedAt:Date.parse("2026-07-31T12:00:00Z")},
      {date:"2026-08-04",attempted:10,correct:8,activeSeconds:0,completed:true,rewardCoins:8,completedAt:Date.parse("2026-08-04T12:00:00Z")},
      {date:"2026-08-06",attempted:10,correct:8,activeSeconds:0,completed:true,rewardCoins:8,completedAt:Date.parse("2026-08-06T12:00:00Z")},
      {date:"2026-08-08",attempted:10,correct:8,activeSeconds:0,completed:true,rewardCoins:8,completedAt:Date.parse("2026-08-08T12:00:00Z")}
    ]}
  },{
    id:"asg2",title:"Division warmup",status:"active",source:"parent",skillIds:["4.longDivision"],groupIds:[],targetType:"problems",target:5,dueDate:"2026-08-01",schedule:"once",weekdays:[],reward:{coins:6},
    occurrences:{currentOccurrenceDate:"2026-08-01",attempted:0,correct:0,completed:false,recentOccurrences:[]}
  }];
  rec.parentHistory = [
    {at:Date.parse("2026-08-04T12:00:00Z"), action:"assignment_occurrence_completed", assignmentId:"asg1", occurrenceDate:"2026-08-04"},
    {at:Date.parse("2026-07-31T12:00:00Z"), action:"assignment_occurrence_completed", assignmentId:"asg1", occurrenceDate:"2026-07-31"}
  ];
  writeRec("ReportKid", rec);
}

(async()=>{
  await setup();
  let r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09"});
  ck(r.status === 200, "linked parent can load report", r.body);
  const report = r.body.report;
  ck(report.summary.attempts === 8 && report.summary.correct === 3 && report.summary.incorrect === 5, "date range totals correct");
  ck(report.summary.accuracy === 37.5 && report.summary.help === 3 && report.summary.helpRate === 37.5, "accuracy and help rate correct");
  ck(report.summary.dailyGoalsCompleted === 1 && report.summary.currentStreak === undefined, "summary contains range daily goals only");
  ck(report.currentStatus.currentStreak === 12 && report.currentStatus.longestStreak === 20 && report.currentStatus.graceBalance === 2, "current status separated from range summary");
  ck(report.currentStatus.currentBlackBelts === 1 && report.currentStatus.currentNeedsReview === 1 && report.currentStatus.activeEnrichment === 1, "current mastery and plan status separated");
  ck(report.daily.length === 2 && report.daily[0].activeSeconds === 600 && report.daily[1].activeSeconds === 900, "day-by-day summaries correct");
  ck(report.skills.find(s=>s.skillId==="4.multiMultiply").attempts === 6, "skill summary counts range attempts");
  ck(report.skills.find(s=>s.skillId==="4.multiMultiply").status === "Needs practice", "weakness detection labels skill");
  ck(report.alerts.some(a=>a.type==="weak_skill"), "weak skill alert created from meaningful evidence");
  ck(report.alerts.some(a=>a.type==="needs_review"), "Needs Review alert created");
  ck(report.alerts.some(a=>a.type==="challenge_ready"), "challenge-ready alert created");
  ck(report.alerts.some(a=>a.type==="above_grade_readiness"), "above-grade readiness alert from enrichment");
  ck(report.alerts.some(a=>a.type==="assignment_overdue"), "assignment overdue alert created");
  ck(!JSON.stringify(report).includes("correctChoiceId") && !JSON.stringify(report).includes("pinHash") && !JSON.stringify(report).includes("currency"), "private/internal data not exposed");

  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09", skillId:"4.longDivision"});
  ck(r.body.report.summary.attempts === 2 && r.body.report.skills.length === 1, "skill filter works");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09", source:"workbook"});
  ck(r.body.report.summary.attempts === 1 && r.body.report.attempts[0].source === "workbook", "source filter works");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09", correct:"false"});
  ck(r.body.report.summary.attempts === 5 && r.body.report.attempts.every(a=>!a.correct), "correct filter works");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09", helpUsed:"true"});
  ck(r.body.report.summary.attempts === 3 && r.body.report.attempts.every(a=>a.helpUsed), "help filter works");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09", assignmentId:"asg1"});
  ck(r.body.report.summary.attempts === 1 && r.body.report.attempts[0].assignmentId === "asg1", "assignment filter works");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09", limit:3, offset:3});
  ck(r.body.report.attempts.length === 3 && r.body.report.attemptPage.total === 8 && r.body.report.attemptPage.hasMore, "attempt paging works");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-03", dateTo:"2026-08-09"});
  ck(r.body.report.summary.dailyGoalsCompleted === 3, "daily goals completed counted inside selected range, not lifetime total");
  ck(r.body.report.summary.assignmentsCompleted === 3, "recurring assignment occurrences counted once inside selected range");
  ck(r.body.report.currentStatus.currentStreak === 12 && r.body.report.summary.longestStreak === undefined, "streak fields stay in current status for longer range");

  for (const preset of ["today","last7","thisWeek","last30","thisMonth"]) {
    r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", range:preset});
    ck(r.status === 200 && r.body.report.range.preset === preset, "range preset works: " + preset, r.body);
  }
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-04-01", dateTo:"2026-04-01"});
  ck(r.body.report.summary.attempts === 4 && r.body.report.summary.correct === 3 && r.body.report.daily[0].attempts === 4, "older permanent daily summary contributes to unfiltered report");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-04-01", dateTo:"2026-04-01", skillId:"4.multiMultiply"});
  ck(r.body.report.summary.attempts === 0 && r.body.report.notes.filteredHistoricalDetailUnavailable, "filtered older detail is unavailable instead of mixing unfiltered summaries");

  const beforeAlertCount = Object.keys(recFor("ReportKid").controls.reporting.alerts).length;
  await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09"});
  const afterAlertCount = Object.keys(recFor("ReportKid").controls.reporting.alerts).length;
  ck(beforeAlertCount === afterAlertCount, "duplicate report loads do not duplicate alerts");

  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09", exportType:"csv_attempts"});
  ck(r.body.report.csv.split(/\r?\n/).length === 9, "CSV attempts row count correct");
  ck(r.body.report.csv.includes("'=cmd"), "CSV formula injection escaped");
  ck(!r.body.report.csv.includes("correctChoiceId") && !r.body.report.csv.includes("pin"), "CSV excludes answer keys and PIN data");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09", exportType:"csv_skills"});
  ck(r.body.report.csv.includes("currentMastery") && r.body.report.csv.includes("certified"), "CSV skill summary includes status fields");

  await call({action:"register_parent", name:"OtherReportParent", pin:"2222"});
  r = await call({action:"parent_progress_report", parentName:"OtherReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-08-08", dateTo:"2026-08-09"});
  ck(r.status === 403 && r.body.error === "student_not_linked_to_parent", "unrelated parent forbidden");
  r = await call({action:"parent_progress_report", parentName:"ReportParent", parentPin:"2222", childName:"ReportKid", dateFrom:"2026-02-30", dateTo:"2026-08-09"});
  ck(r.status === 400 && r.body.error === "invalid_date_range", "invalid date rejected");

  await call({action:"register_student", name:"TinyBadKid", pin:"1234", grade:"4"});
  await call({action:"register_parent", name:"TinyParent", pin:"2222"});
  await call({action:"link_child", parentName:"TinyParent", parentPin:"2222", childName:"TinyBadKid", childPin:"1234"});
  KV.store.set(activityKey("TinyBadKid"), JSON.stringify({version:1,attempts:[attempt("t1","2026-08-08","practice","4.multiMultiply",false,false),attempt("t2","2026-08-08","practice","4.multiMultiply",false,false)],daily:{},skills:{},aggregates:{totalAttempts:2,totalCorrect:0,totalHelp:0}}));
  r = await call({action:"parent_progress_report", parentName:"TinyParent", parentPin:"2222", childName:"TinyBadKid", dateFrom:"2026-08-08", dateTo:"2026-08-08"});
  ck(!r.body.report.alerts.some(a=>a.type==="weak_skill"), "1-2 bad attempts do not create weak-skill alert");

  r = await call({action:"report", name:"ReportKid", pin:"1234", localDate:"2026-08-09"});
  ck(!JSON.stringify(r.body).includes("parent note") && !JSON.stringify(r.body).includes("reporting"), "parent-only report state not exposed to student APIs");

  console.log(fails ? fails + " PHASE 5B REPORT TEST FAILURES" : "ALL PHASE 5B REPORT TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
