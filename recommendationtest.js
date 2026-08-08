const C = require("./js/curriculum.js");
const M = require("./js/mastery.js");
const R = require("./js/recommendations.js");
const api = require("./lib/number-ninja-api.js");

let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
function dataWith(mastery, topics){
  return { progress:{ mastery:Object.assign({}, mastery || {}), topics:Object.assign({}, topics || {}) } };
}
function topic(solved, wrongs){ return { solved, first:solved, wrongs:wrongs || 0, tutors:0 }; }

const now = Date.now();

let controls = api.defaultControls("4");
controls.skillMastery.bySkill["4.multiMultiply"] = { certified:true, needsReview:true, reviewDueAt:now - 86400000 };
let data = dataWith({ "4.placeValue":90, "3.fluency":90, "4.multiMultiply":90, "4.longDivision":10 }, {
  "4.longDivision":topic(4,2),
  "4.multiMultiply":topic(22,1),
});
let recs = R.buildRecommendations(data, controls, { now, limit:4 });
ck(recs[0] && recs[0].skillId === "4.multiMultiply" && recs[0].type === "needs_review", "Needs Review outranks normal progression");

controls = api.defaultControls("4");
controls.skillMastery.bySkill["4.multiMultiply"] = { certified:true, needsReview:false, reviewDueAt:now - 86400000 * 3 };
data = dataWith({
  "3.fluency":90,
  "4.placeValue":90,
  "4.multiMultiply":90,
  "4.longDivision":90,
}, {
  "4.multiMultiply":topic(24,1),
  "4.longDivision":topic(24,1),
});
M.summary(data, controls);
recs = R.buildRecommendations(data, controls, { now, limit:4 });
ck(recs[0] && recs[0].skillId === "4.multiMultiply" && recs[0].type === "needs_review", "overdue review outranks challenge ready");
ck(recs.some(r => r.type === "challenge_ready"), "challenge-ready skills are surfaced");

controls = api.defaultControls("4");
data = dataWith({
  "2.placeValue1000":90,
  "3.addSubMental":90,
  "4.placeValue":90,
  "3.fluency":45,
  "4.multiMultiply":10,
}, {
  "3.fluency":topic(5,7),
  "4.multiMultiply":topic(1,3),
});
recs = R.buildRecommendations(data, controls, { now, limit:4 });
ck(recs[0] && recs[0].skillId === "3.fluency" && recs[0].type === "weak_prerequisite", "weak prerequisite outranks unrelated home-grade work");

controls = api.defaultControls("4");
data = dataWith({ "3.fluency":90, "4.factorsMultiples":20 }, { "4.factorsMultiples":topic(4,1) });
recs = R.buildRecommendations(data, controls, { now, limit:4 });
ck(recs.some(r => r.type === "home_progression" && C.BY_ID[r.skillId].grade === "4"), "normal home-grade progression works");

controls = api.defaultControls("4");
controls.allowAboveGrade = true;
data = dataWith({
  "3.fluency":90,
  "4.placeValue":90,
  "4.multiMultiply":90,
  "4.longDivision":90,
}, {
  "4.multiMultiply":topic(24,1),
  "4.longDivision":topic(24,1),
});
recs = R.buildRecommendations(data, controls, { now, limit:8 });
ck(recs.some(r => r.type === "enrichment" && r.grade === "5"), "above-grade enrichment appears when allowed and prerequisites support it");

controls.allowAboveGrade = false;
recs = R.buildRecommendations(data, controls, { now, limit:8 });
ck(!recs.some(r => r.type === "enrichment" && r.grade === "5"), "parent-disabled above-grade recommendation is respected");

controls.skillOverrides["5.operations"] = "unlocked";
recs = R.buildRecommendations(data, controls, { now, limit:8 });
ck(recs.some(r => r.skillId === "5.operations" && r.type === "enrichment"), "previously unlocked above-grade access remains preserved");

controls = api.defaultControls("4");
controls.placement = Object.assign(controls.placement || {}, {
  status:"completed",
  recommendations:[{ skillId:"5.operations", recommendedOverride:"unlocked", reason:"Placement found this is a good next step." }],
});
controls.skillOverrides["5.operations"] = "unlocked";
data = dataWith({
  "3.fluency":90,
  "4.placeValue":90,
  "4.multiMultiply":90,
  "4.longDivision":90,
});
recs = R.buildRecommendations(data, controls, { now, limit:8 });
const placementRec = recs.find(r => r.skillId === "5.operations");
ck(placementRec && /Placement/.test(placementRec.reason), "placement evidence can explain enrichment recommendation");

const pack = R.primaryAndAlternates(data, controls);
ck(pack.primary && pack.alternates.length <= 3 && pack.recommendations.length <= 4, "student-facing recommendation list is limited");

console.log(fails ? fails + " RECOMMENDATION TEST FAILURES" : "ALL RECOMMENDATION TESTS PASSED");
process.exitCode = fails ? 1 : 0;
