const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const C = require("./js/curriculum.js");
const A = require("./js/assignments.js");
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }

const date = "2026-08-07";
const nextDate = "2026-08-10";
const group = A.groupId("4", "Fractions");

(async()=>{
  let r = A.createAssignment([], { skillIds:["4.multiMultiply"], targetType:"problems", target:20, dueDate:nextDate }, { effectiveDate:date, now:1000, id:"asg_test" });
  ck(!r.error && r.assignment.status === "active" && r.assignment.target === 20, "create valid one-time problem assignment");
  ck(r.assignment.id === "asg_test", "pure assignment id can be injected for deterministic tests");
  ck(r.assignment.title && /20/.test(r.assignment.title), "auto title works");
  ck(r.assignment.reward.coins >= A.LIMITS.rewardMin && r.assignment.reward.coins <= A.LIMITS.rewardMax, "reward bounded");

  r = A.createAssignment([], { skillIds:["4.multiMultiply"], targetType:"minutes", target:15, minimumAccuracy:80, schedule:"weekdays", weekdays:["mon","wed","fri"], endDate:"2026-08-31" }, { effectiveDate:date, now:2000, id:"asg_time" });
  ck(!r.error && r.assignment.targetType === "minutes", "create valid time assignment");
  ck(r.assignment.weekdays.join(",") === "mon,wed,fri", "weekdays schedule normalizes");
  ck(A.nextOccurrenceDate(r.assignment, date) === "2026-08-07", "next occurrence calculation");
  ck(A.nextOccurrenceDate(r.assignment, "2026-09-01") === null, "end date stops recurrence");

  r.assignment.occurrences.recentCompletedDates = Array.from({length:30}, (_,i)=>"2026-08-" + String((i % 28) + 1).padStart(2,"0"));
  const compact = A.normalizeAssignment(r.assignment);
  ck(compact.occurrences.recentCompletedDates.length <= A.LIMITS.recentCompletedMax, "occurrence state does not grow unbounded");

  r = A.createAssignment([], { skillIds:["4.multiMultiply","4.multiMultiply","4.longDivision"], targetType:"problems", target:10 }, { effectiveDate:date, now:3000, id:"asg_multi" });
  ck(!r.error && r.assignment.skillIds.length === 2, "multi-skill assignment and duplicate skill dedupe");

  r = A.createAssignment([], { groupIds:[group], targetType:"problems", target:12 }, { effectiveDate:date, now:4000, id:"asg_group" });
  ck(!r.error && r.assignment.groupIds[0] === group && r.assignment.skillIds.length > 1, "group resolves to current curriculum skills");

  ck(A.createAssignment([], { skillIds:["missing.skill"], targetType:"problems", target:10 }, { effectiveDate:date }).error === "unknown_skill", "unknown skill rejected");
  ck(A.createAssignment([], { skillIds:C.SKILLS.slice(0,21).map(s=>s.id), targetType:"problems", target:10 }, { effectiveDate:date }).error === "too_many_skills", "too many skills rejected");
  ck(A.createAssignment([], { skillIds:["4.multiMultiply"], targetType:"problems", target:0 }, { effectiveDate:date }).error === "invalid_target", "invalid problem target rejected");
  ck(A.createAssignment([], { skillIds:["4.multiMultiply"], targetType:"minutes", target:121 }, { effectiveDate:date }).error === "invalid_target", "invalid minute target rejected");
  ck(A.createAssignment([], { skillIds:["4.multiMultiply"], targetType:"problems", target:10, minimumAccuracy:40 }, { effectiveDate:date }).error === "invalid_accuracy", "invalid accuracy rejected");
  ck(A.createAssignment([], { skillIds:["4.multiMultiply"], targetType:"problems", target:10, dueDate:"2026-02-30" }, { effectiveDate:date }).error === "invalid_due_date", "impossible date rejected");
  ck(A.createAssignment([], { skillIds:["4.multiMultiply"], targetType:"problems", target:10, schedule:"weekdays", weekdays:["noday"] }, { effectiveDate:date }).error === "invalid_weekday", "invalid weekday rejected");
  ck(A.createAssignment([], { skillIds:["4.multiMultiply"], targetType:"problems", target:10, schedule:"weekdays", weekdays:["mon"], endDate:"2026-08-01" }, { effectiveDate:date }).error === "end_date_before_start", "end date before start rejected");

  const small = A.createAssignment([], { skillIds:["k.count100"], targetType:"problems", target:1 }, { effectiveDate:date, now:5000, id:"small" }).assignment;
  const large = A.createAssignment([], { skillIds:["5.logic","5.wordProblems","5.decimalOps"], targetType:"minutes", target:120, minimumAccuracy:100 }, { effectiveDate:date, now:6000, id:"large" }).assignment;
  ck(small.reward.coins < large.reward.coins && large.reward.coins <= A.LIMITS.rewardMax, "reward scales modestly with effort and difficulty");

  let list = [];
  r = A.createAssignment(list, { skillIds:["4.multiMultiply"], targetType:"problems", target:10 }, { effectiveDate:date, now:7000, id:"dup1" });
  list = r.assignments;
  r = A.createAssignment(list, { skillIds:["4.multiMultiply"], targetType:"problems", target:10 }, { effectiveDate:date, now:7100, id:"dup2" });
  ck(r.error === "duplicate_assignment", "exact rapid duplicate rejected");

  await call({ action:"register_parent", name:"AssignParent", pin:"2222" });
  await call({ action:"register_parent", name:"OtherParent", pin:"3333" });
  await call({ action:"register_student", name:"AssignKid", pin:"1234", grade:"4" });
  let res = await call({ action:"link_child", parentName:"AssignParent", parentPin:"2222", childName:"AssignKid", childPin:"1234" });
  ck(res.status === 200, "linked parent setup");

  res = await call({ action:"parent_create_assignment", name:"AssignKid", pin:"1234", childName:"AssignKid", localDate:date, assignment:{ skillIds:["4.multiMultiply"], targetType:"problems", target:10 } });
  ck(res.status === 403 && res.body.error === "wrong_account_type", "child cannot create assignment");

  res = await call({ action:"parent_create_assignment", parentName:"OtherParent", parentPin:"3333", childName:"AssignKid", localDate:date, assignment:{ skillIds:["4.multiMultiply"], targetType:"problems", target:10 } });
  ck(res.status === 403 && res.body.error === "student_not_linked_to_parent", "unrelated parent cannot create assignment");

  res = await call({ action:"parent_create_assignment", parentName:"AssignParent", parentPin:"2222", childName:"AssignKid", localDate:date, assignment:{ id:"client_id", title:"Multiply practice", skillIds:["4.multiMultiply"], targetType:"problems", target:10, reward:{coins:999}, notes:"parent-only note" } });
  ck(res.status === 200 && res.body.assignment.id !== "client_id", "assignment ID generated server-side");
  ck(res.body.assignment.reward.coins !== 999 && res.body.assignment.reward.coins <= A.LIMITS.rewardMax, "client-supplied reward ignored");
  ck(res.body.assignment.notes === "parent-only note", "parent list response may include notes");
  const assignmentId = res.body.assignment.id;

  res = await call({ action:"parent_create_assignment", parentName:"AssignParent", parentPin:"2222", childName:"AssignKid", localDate:date, assignment:{ title:"Multiply practice duplicate", skillIds:["4.multiMultiply"], targetType:"problems", target:10 } });
  ck(res.status === 400 && res.body.error === "duplicate_assignment", "API exact rapid duplicate rejected");

  res = await call({ action:"report", name:"AssignKid", pin:"1234", localDate:date });
  ck(res.status === 200 && res.body.assignments.length === 1 && !("notes" in res.body.assignments[0]), "student gets sanitized active assignment summaries");

  res = await call({ action:"parent_update_assignment", name:"AssignKid", pin:"1234", childName:"AssignKid", assignmentId, localDate:date, assignment:{ skillIds:["4.longDivision"], targetType:"minutes", target:15, schedule:"weekdays", weekdays:["tue"], endDate:"2026-08-31", minimumAccuracy:80, notes:"updated private note" } });
  ck(res.status === 403 && res.body.error === "wrong_account_type", "child cannot edit assignment");

  res = await call({ action:"parent_update_assignment", parentName:"AssignParent", parentPin:"2222", childName:"AssignKid", assignmentId, localDate:date, assignment:{ skillIds:["4.longDivision"], targetType:"minutes", target:15, schedule:"weekdays", weekdays:["tue"], endDate:"2026-08-31", minimumAccuracy:80, notes:"updated private note" } });
  ck(res.status === 200 && res.body.assignment.targetType === "minutes" && res.body.assignment.skillIds[0] === "4.longDivision", "linked parent can edit assignment");
  ck(res.body.assignment.notes === "updated private note", "edit preserves parent-visible note");

  res = await call({ action:"parent_create_assignment", parentName:"AssignParent", parentPin:"2222", childName:"AssignKid", localDate:date, assignment:{ skillIds:["5.operations"], targetType:"problems", target:8 } });
  ck(res.status === 200 && recFor("AssignKid").controls.homeGrade === "4" && recFor("AssignKid").controls.skillOverrides["5.operations"] !== "unlocked", "above-grade assignment does not change home grade or unlock unrelated content");

  res = await call({ action:"parent_archive_assignment", parentName:"AssignParent", parentPin:"2222", childName:"AssignKid", assignmentId, localDate:date });
  ck(res.status === 200 && res.body.assignment.status === "archived", "linked parent can archive assignment");
  ck(recFor("AssignKid").parentHistory.some(e => e.action === "assignment_archived" && e.assignmentId === assignmentId), "archived assignment remains in parent history");

  res = await call({ action:"parent_archive_assignment", name:"AssignKid", pin:"1234", childName:"AssignKid", assignmentId, localDate:date });
  ck(res.status === 403 && res.body.error === "wrong_account_type", "child cannot archive assignment");

  res = await call({ action:"update_child_controls", parentName:"AssignParent", parentPin:"2222", childName:"AssignKid", controls:{ assignments:[{id:"bad",skillIds:["4.logic"],targetType:"problems",target:1}] } });
  ck(res.status === 200 && !recFor("AssignKid").controls.assignments.some(a => a.id === "bad"), "generic controls update cannot mutate assignments");

  const missing = { homeGrade:"4", allowAboveGrade:true };
  ck(A.normalizeList(missing.assignments).length === 0, "missing assignments normalize safely");
  ck(A.summarizeList([{id:"legacy",skillIds:["4.multiMultiply"],targetType:"problems",target:5,status:"active"}], {localDate:date}).length === 1, "existing controls.assignments normalize safely");

  res = await call({ action:"parent_list_assignments", parentName:"AssignParent", parentPin:"2222", childName:"AssignKid", localDate:date });
  ck(res.status === 200 && res.body.assignments.some(a => a.status === "archived") && res.body.assignments.some(a => a.status === "active"), "parent list shows archived and active assignments");

  console.log(fails ? fails + " ASSIGNMENT TEST FAILURES" : "ALL ASSIGNMENT TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
