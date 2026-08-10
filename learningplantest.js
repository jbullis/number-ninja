const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const C = require("./js/curriculum.js");
const LP = require("./js/learning-plan.js");
const A = require("./js/assignments.js");
const R = require("./js/recommendations.js");
const api = require("./lib/number-ninja-api.js");

let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
function dataWith(mastery, topics){ return { progress:{ mastery:Object.assign({}, mastery || {}), topics:Object.assign({}, topics || {}) } }; }
function topic(solved, wrongs){ return { solved, first:solved, wrongs:wrongs || 0, tutors:0 }; }
function active(plan, type){ return LP.activeItems(plan, type); }

const now = 1786200000000;
let controls = api.defaultControls("4");
let data = dataWith({ "4.multiMultiply":10 }, { "4.multiMultiply":topic(0,1) });
LP.evaluate(data, controls, {now});
ck(active(controls.learningPlan, "remediation").length === 0, "one wrong answer does not create remediation");

data = dataWith({ "4.multiMultiply":20 }, { "4.multiMultiply":topic(2,5) });
LP.evaluate(data, controls, {now});
let rem = active(controls.learningPlan, "remediation").find(x=>x.skillId==="4.multiMultiply" && x.reasonCode==="low_accuracy");
ck(rem && rem.skillId === "4.multiMultiply" && rem.reasonCode === "low_accuracy", "low accuracy with enough attempts creates remediation");
const remId = rem.id;
LP.evaluate(data, controls, {now:now+1000});
ck(active(controls.learningPlan, "remediation").filter(x=>x.id === remId).length === 1, "duplicate remediation not created and id persists");

data = dataWith({ "4.multiMultiply":70 }, { "4.multiMultiply":topic(5,3) });
LP.evaluate(data, controls, {now:now+2000});
ck(active(controls.learningPlan, "remediation").some(x=>x.id === remId), "hysteresis prevents remediation flapping before mastery target");
data = dataWith({ "4.multiMultiply":80 }, { "4.multiMultiply":topic(7,2) });
LP.evaluate(data, controls, {now:now+3000});
ck(!active(controls.learningPlan, "remediation").some(x=>x.id===remId) && controls.learningPlan.history.some(e=>e.type==="remediation_resolved"), "mastery improvement resolves remediation");

controls = api.defaultControls("4");
data = dataWith({ "3.fluency":40, "4.placeValue":90, "4.longDivision":10 }, { "4.longDivision":topic(3,0) });
LP.evaluate(data, controls, {now});
rem = active(controls.learningPlan, "remediation")[0];
ck(rem && rem.skillId === "3.fluency" && rem.relatedSkillId === "4.longDivision" && rem.reasonCode === "prerequisite_blocker", "prerequisite blocker creates remediation");

controls = api.defaultControls("4");
controls.skillMastery.bySkill["3.fluency"] = { certified:true, needsReview:true };
data = dataWith({ "3.fluency":20 }, { "3.fluency":topic(1,8) });
LP.evaluate(data, controls, {now});
ck(!active(controls.learningPlan, "remediation").length, "Needs Review does not create duplicate remediation");

controls = api.defaultControls("4");
let made = A.createAssignment([], { skillIds:["3.fluency"], targetType:"problems", target:5 }, { effectiveDate:"2026-08-08", now, id:"asg_lp" });
controls.assignments = made.assignments;
data = dataWith({ "3.fluency":20 }, { "3.fluency":topic(1,8) });
LP.evaluate(data, controls, {now});
ck(active(controls.learningPlan, "remediation").length === 1, "parent assignment does not erase remediation");

controls = api.defaultControls("4");
data = dataWith({ "4.multiMultiply":90, "4.longDivision":90 }, { "4.multiMultiply":topic(2,0), "4.longDivision":topic(2,0) });
LP.evaluate(data, controls, {now});
ck(active(controls.learningPlan, "enrichment").length === 0, "weak evidence does not create enrichment");

data = dataWith({
  "3.fluency":95, "4.placeValue":95, "4.multiMultiply":95, "4.longDivision":95,
}, {
  "3.fluency":topic(12,0), "4.placeValue":topic(12,0), "4.multiMultiply":topic(12,0), "4.longDivision":topic(12,0),
});
LP.evaluate(data, controls, {now});
let en = active(controls.learningPlan, "enrichment")[0];
ck(en && C.BY_ID[en.skillId].grade === "5", "strong sustained readiness creates enrichment");
const enId = en && en.id;
LP.evaluate(data, controls, {now:now+1000});
ck(active(controls.learningPlan, "enrichment").filter(x=>x.id===enId).length === 1, "no duplicate enrichment and id persists");

controls = api.defaultControls("4");
controls.placement.recommendations = [{ skillId:"5.operations", recommendedOverride:"unlocked", reason:"Placement supported this." }];
controls.skillOverrides["5.operations"] = "unlocked";
data = dataWith({ "4.multiMultiply":95, "4.longDivision":95 }, { "4.multiMultiply":topic(12,0), "4.longDivision":topic(12,0) });
LP.evaluate(data, controls, {now});
ck(active(controls.learningPlan, "enrichment").some(x=>x.skillId==="5.operations"), "placement may support enrichment readiness");

controls = api.defaultControls("4");
controls.allowAboveGrade = false;
LP.evaluate(data, controls, {now});
ck(active(controls.learningPlan, "enrichment").length === 0, "allowAboveGrade=false prevents new enrichment");
controls.allowAboveGrade = true;
LP.evaluate(dataWith({ "3.fluency":95, "4.placeValue":95, "4.multiMultiply":95, "4.longDivision":95 }, { "3.fluency":topic(12,0), "4.placeValue":topic(12,0), "4.multiMultiply":topic(12,0), "4.longDivision":topic(12,0) }), controls, {now});
ck(active(controls.learningPlan, "enrichment").length > 0, "enrichment persists across sessions");
controls.allowAboveGrade = false;
LP.evaluate(data, controls, {now:now+1000});
ck(!active(controls.learningPlan, "enrichment").length && controls.learningPlan.history.some(e=>e.reasonCode==="parent_disabled_future_enrichment"), "disabling above-grade replaces active enrichment");

controls = api.defaultControls("4");
data = dataWith({ "3.fluency":95, "4.placeValue":95, "4.multiMultiply":95, "4.longDivision":95 }, { "3.fluency":topic(12,0), "4.placeValue":topic(12,0), "4.multiMultiply":topic(12,0), "4.longDivision":topic(12,0) });
LP.evaluate(data, controls, {now});
en = active(controls.learningPlan, "enrichment")[0];
data.progress.mastery[en.skillId] = 80;
LP.evaluate(data, controls, {now:now+1000});
ck(!active(controls.learningPlan, "enrichment").some(x=>x.skillId===en.skillId), "mastering enrichment skill resolves item");

controls = api.defaultControls("4");
controls.skillMastery.bySkill["4.multiMultiply"] = { certified:true, needsReview:true, reviewDueAt:now-1000 };
controls.learningPlan = LP.normalizePlan({items:[{id:"sys:remediation:3.fluency:4.longDivision",type:"remediation",skillId:"3.fluency",relatedSkillId:"4.longDivision",status:"active",createdAt:now,updatedAt:now,reasonText:"Build this skill to make division easier."}]});
made = A.createAssignment([], { skillIds:["4.placeValue"], targetType:"problems", target:5 }, { effectiveDate:"2026-08-08", now, id:"asg_pri" });
controls.assignments = made.assignments;
data = dataWith({ "4.placeValue":90, "3.fluency":20, "4.multiMultiply":90 }, { "3.fluency":topic(2,5), "4.placeValue":topic(8,0) });
let recs = R.buildRecommendations(data, controls, {now, localDate:"2026-08-08", limit:6});
ck(recs[0].type === "parent_assignment", "parent assignment outranks Needs Review");
ck(recs.findIndex(r=>r.type==="needs_review") < recs.findIndex(r=>r.type==="persistent_remediation"), "Needs Review outranks remediation");
controls.assignments = [];
recs = R.buildRecommendations(data, controls, {now, localDate:"2026-08-08", limit:6});
ck(recs[1] && recs[1].type === "persistent_remediation", "remediation outranks challenge/home progression");

controls = api.defaultControls("4");
controls.learningPlan = LP.normalizePlan({items:Array.from({length:8},(_,i)=>({id:"r"+i,type:"remediation",skillId:["3.multiply","3.divide","3.fluency","4.placeValue","4.multiMultiply","4.longDivision","4.factorsMultiples","4.fractionEquiv"][i],status:"active",createdAt:i,updatedAt:i,reasonText:"x"})), history:Array.from({length:80},(_,i)=>({at:i,type:"remediation_created",skillId:"3.multiply",itemId:"r"}))});
LP.evaluate(dataWith({},{}), controls, {now});
ck(active(controls.learningPlan, "remediation").length <= LP.LIMITS.maxActiveRemediation && controls.learningPlan.history.length <= LP.LIMITS.maxHistory, "max active limits and history bound enforced");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function recFor(name){ return JSON.parse(KV.store.get("player:" + name.toLowerCase())); }
function writeRec(name, rec){ KV.store.set("player:" + name.toLowerCase(), JSON.stringify(rec)); }
(async()=>{
  await call({action:"register_parent", name:"LPParent", pin:"2222"});
  await call({action:"register_student", name:"LPKid", pin:"1234", grade:"4"});
  await call({action:"link_child", parentName:"LPParent", parentPin:"2222", childName:"LPKid", childPin:"1234"});
  let save = recFor("LPKid").data || {};
  save.progress = { mastery:{ "4.multiMultiply":20 }, topics:{ "4.multiMultiply":topic(2,5) } };
  let lprec = recFor("LPKid");
  lprec.data = save;
  writeRec("LPKid", lprec);
  let r = await call({action:"report", name:"LPKid", pin:"1234", localDate:"2026-08-08"});
  ck(r.body.learningPlan.items.some(x=>x.status==="active"&&x.type==="remediation"), "student report returns persistent learning plan");
  r = await call({action:"update_child_controls", parentName:"LPParent", parentPin:"2222", childName:"LPKid", controls:{ learningPlan:{items:[]} }, localDate:"2026-08-08"});
  ck(r.status === 200 && r.body.controls.learningPlan.items.some(x=>x.status==="active"), "browser cannot mutate plan state through controls");
  r = await call({action:"learning_plan_status", name:"LPKid", pin:"1234", localDate:"2026-08-08"});
  ck(r.status === 200 && r.body.learningPlan.items.length, "read-only learning_plan_status returns plan");

  r = await call({action:"parent_create_assignment", parentName:"LPParent", parentPin:"2222", childName:"LPKid", localDate:"2026-08-08", assignment:{ skillIds:["4.multiMultiply"], targetType:"problems", target:20 }});
  const id = r.body.assignment.id;
  r = await call({action:"assignment_start", name:"LPKid", pin:"1234", assignmentId:id, localDate:"2026-08-08"});
  for(let i=0;i<20;i++){
    const rec = recFor("LPKid"), q = rec.controls.assignments.find(a=>a.id===id).occurrences.pendingQuestion;
    if(!q) break;
    await call({action:"assignment_answer", name:"LPKid", pin:"1234", assignmentId:id, questionId:q.id, choiceId:q.correctChoiceId, localDate:"2026-08-08"});
    if(i<19) await call({action:"assignment_start", name:"LPKid", pin:"1234", assignmentId:id, localDate:"2026-08-08"});
  }
  r = await call({action:"report", name:"LPKid", pin:"1234", localDate:"2026-08-08"});
  ck(!r.body.learningPlan.items.some(x=>x.status==="active"&&x.skillId==="4.multiMultiply"), "assignment work can resolve remediation through actual evidence");

  console.log(fails ? fails + " LEARNING PLAN TEST FAILURES" : "ALL LEARNING PLAN TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
