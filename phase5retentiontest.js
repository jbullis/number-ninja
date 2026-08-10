const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const api = require("./lib/number-ninja-api.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function key(name){ return "player:" + name.toLowerCase(); }
function activityKey(name){ return key(name) + ":activity"; }
function bucketKey(name, month){ return activityKey(name) + ":" + month; }
function recFor(name){ return JSON.parse(KV.store.get(key(name))); }
function isoDate(ms){ const d = new Date(ms); return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0"); }
function month(ms){ return isoDate(ms).slice(0,7); }
function daysAgo(n){ return Date.now() - n * 24 * 60 * 60 * 1000; }
function attempt(id, ms, skillId, source){
  return {
    attemptId:id,
    at:ms,
    localDate:isoDate(ms),
    source:source || "practice",
    mode:source || "practice",
    skillId:skillId || "4.multiMultiply",
    questionId:id,
    choiceId:id + ":c0",
    correct:id.length % 2 === 0,
  };
}

(async()=>{
  let r;
  await call({action:"register_student", name:"RetentionKid", pin:"1234", grade:"4"});
  await call({action:"register_parent", name:"RetentionParent", pin:"2222"});
  await call({action:"link_child", parentName:"RetentionParent", parentPin:"2222", childName:"RetentionKid", childPin:"1234"});

  const currentMs = daysAgo(3);
  const previousMs = daysAgo(35);
  const oldMs = daysAgo(91);
  const recent = [];
  for(let i=0;i<2105;i++){
    const ms = i < 1100 ? previousMs + i * 1000 : currentMs + i * 1000;
    const skillId = i % 2 ? "4.multiMultiply" : "4.longDivision";
    const source = i % 5 === 0 ? "workbook" : "practice";
    recent.push(attempt("recent-" + i, ms, skillId, source));
  }
  const old = attempt("old-91", oldMs, "4.multiMultiply", "practice");
  KV.store.set(activityKey("RetentionKid"), JSON.stringify({
    version:1,
    attempts:recent.concat([old]),
    daily:{
      [isoDate(oldMs)]:{attempts:1, correct:1, help:0, skills:["4.multiMultiply"]},
      [isoDate(currentMs)]:{attempts:1005, correct:500, help:0, skills:["4.multiMultiply","4.longDivision"]},
      [isoDate(previousMs)]:{attempts:1100, correct:550, help:0, skills:["4.multiMultiply","4.longDivision"]},
    },
    skills:{"4.multiMultiply":{attempts:1053,correct:520,help:0,lastAt:currentMs},"4.longDivision":{attempts:1052,correct:530,help:0,lastAt:currentMs}},
    aggregates:{totalAttempts:2106,totalCorrect:1051,totalHelp:0},
  }));

  r = await call({action:"activity_history", name:"RetentionKid", pin:"1234", dateFrom:isoDate(daysAgo(89)), dateTo:isoDate(daysAgo(0)), limit:1000});
  ck(r.status === 200 && r.body.activity.totalRetained === 2105, "2,000+ recent attempts remain retained", r.body.activity.totalRetained);
  const page1 = r.body.activity.attempts.length;
  r = await call({action:"activity_history", name:"RetentionKid", pin:"1234", dateFrom:isoDate(daysAgo(89)), dateTo:isoDate(daysAgo(0)), limit:1000, offset:1000});
  const page2 = r.body.activity.attempts.length;
  r = await call({action:"activity_history", name:"RetentionKid", pin:"1234", dateFrom:isoDate(daysAgo(89)), dateTo:isoDate(daysAgo(0)), limit:1000, offset:2000});
  const page3 = r.body.activity.attempts.length;
  ck(page1 + page2 + page3 === 2105, "paging retrieves all retained attempts", page1 + page2 + page3);
  ck(!r.body.activity.attempts.some(a => a.attemptId === "old-91"), "91-day-old detail pruned");

  const base = JSON.parse(KV.store.get(activityKey("RetentionKid")));
  ck(r.body.activity.aggregates.totalAttempts === 2106 && base.daily[isoDate(oldMs)].attempts === 1, "aggregate remains after old detail pruned");
  ck(!Array.isArray(base.attempts) && base.version === 2, "legacy base attempts cleared after migration");
  ck(KV.store.has(bucketKey("RetentionKid", month(currentMs))) && KV.store.has(bucketKey("RetentionKid", month(previousMs))), "attempts stored in monthly buckets");
  const currentBucket = JSON.parse(KV.store.get(bucketKey("RetentionKid", month(currentMs))));
  ck(currentBucket.attempts.some(a => a.attemptId === "recent-2104"), "expected time bucket contains recent detail");

  r = await call({action:"activity_history", name:"RetentionKid", pin:"1234", skillId:"4.longDivision", dateFrom:isoDate(daysAgo(89)), limit:1000});
  ck(r.body.activity.totalRetained > 1000 && r.body.activity.attempts.every(a => a.skillId === "4.longDivision"), "skill filter works across buckets");
  r = await call({action:"activity_history", name:"RetentionKid", pin:"1234", source:"workbook", dateFrom:isoDate(daysAgo(89)), limit:1000});
  ck(r.body.activity.totalRetained === Math.ceil(2105/5) && r.body.activity.attempts.every(a => a.source === "workbook"), "source filter works across buckets");

  r = await call({action:"parent_activity_history", parentName:"RetentionParent", parentPin:"2222", childName:"RetentionKid", dateFrom:isoDate(daysAgo(89)), limit:1000});
  ck(r.status === 200 && r.body.activity.totalRetained === 2105, "linked parent gets same retained detail as student");
  await call({action:"register_parent", name:"RetentionOtherParent", pin:"2222"});
  r = await call({action:"parent_activity_history", parentName:"RetentionOtherParent", parentPin:"2222", childName:"RetentionKid"});
  ck(r.status === 403 && r.body.error === "student_not_linked_to_parent", "unlinked parent cannot read bucketed activity");

  await call({action:"register_student", name:"BucketWriteKid", pin:"1234", grade:"4"});
  r = await call({action:"practice_start", name:"BucketWriteKid", pin:"1234", localDate:isoDate(Date.now()), mode:"arena", skillId:"4.multiMultiply"});
  const q = recFor("BucketWriteKid").controls.practice.pendingQuestion;
  r = await call({action:"practice_answer", name:"BucketWriteKid", pin:"1234", localDate:isoDate(Date.now()), questionId:q.id, choiceId:q.correctChoiceId});
  ck(r.status === 200 && KV.store.has(bucketKey("BucketWriteKid", month(Date.now()))), "practice answer writes expected current bucket");
  const before = JSON.parse(KV.store.get(activityKey("BucketWriteKid"))).aggregates.totalAttempts;
  r = await call({action:"practice_answer", name:"BucketWriteKid", pin:"1234", localDate:isoDate(Date.now()), questionId:q.id, choiceId:q.correctChoiceId});
  const after = JSON.parse(KV.store.get(activityKey("BucketWriteKid"))).aggregates.totalAttempts;
  ck(r.status === 409 && before === after, "same attempt replay does not duplicate detail or summary");

  console.log(fails ? fails + " PHASE 5 RETENTION TEST FAILURES" : "ALL PHASE 5 RETENTION TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
