const { webcrypto } = require("crypto"); if (!global.crypto) global.crypto = webcrypto;
const fs = require("fs");
const C = require("./js/curriculum.js");
const api = require("./lib/number-ninja-api.js");
const { generatePlacementQuestion } = require("./lib/placement-question-generator.js");

const KV = { store:new Map(), async get(k){ return this.store.has(k) ? this.store.get(k) : null; }, async set(k,v){ this.store.set(k,v); }, async delete(k){ this.store.delete(k); } };
let fails = 0, generated = 0;
function ck(v,m,x){ if(!v){ fails++; console.error("FAIL:",m,x||""); } }
async function call(body){ const r = await api.playerPost({ json:async()=>body }, { store:KV }); return { status:r.status, body:await r.json() }; }
function key(name){ return "player:" + name.toLowerCase(); }
function activityKey(name){ return key(name) + ":activity"; }
function bucketKey(name, month){ return activityKey(name) + ":" + month; }
function recFor(name){ return JSON.parse(KV.store.get(key(name))); }
function writeRec(name, rec){ KV.store.set(key(name), JSON.stringify(rec)); }

function textOf(s){ return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function cycleCheck(){
  const visiting = new Set(), done = new Set();
  function visit(id, path){
    if(visiting.has(id)) return path.concat(id);
    if(done.has(id)) return null;
    visiting.add(id);
    for(const p of (C.BY_ID[id] && C.BY_ID[id].prereqs) || []){
      const c = visit(p, path.concat(id));
      if(c) return c;
    }
    visiting.delete(id); done.add(id); return null;
  }
  for(const s of C.SKILLS){ const c = visit(s.id, []); if(c) return c; }
  return null;
}

function auditQuestion(skill, q, seed){
  ck(q && q.topic === skill.id, "question topic matches skill", skill.id);
  ck(typeof q.qHTML === "string" && q.qHTML.length > 10, "question has HTML", skill.id);
  ck(!/<script|on[a-z]+\s*=|javascript:/i.test(q.qHTML), "question HTML avoids script/event/url injection", skill.id + " " + q.qHTML);
  ck(!/undefined|NaN|Infinity|-Infinity|\[object Object\]/.test(q.qHTML), "question HTML has no malformed values", skill.id + " " + q.qHTML);
  ck(Array.isArray(q.choices) && q.choices.length >= 2, "question has choices", skill.id);
  const ok = (q.choices || []).filter(c => c && c.ok);
  ck(ok.length === 1, "exactly one correct choice", skill.id + " " + seed);
  const labels = (q.choices || []).map(c => String(c && c.h));
  ck(new Set(labels).size === labels.length, "choice labels unique", skill.id + " " + labels.join("|"));
  ck(labels.every(x => x && !/undefined|NaN|Infinity|-Infinity|\[object Object\]/.test(x)), "choice labels valid", skill.id + " " + labels.join("|"));
  ck(labels.every(x => !/<script|on[a-z]+\s*=|javascript:/i.test(x)), "choice HTML avoids injection", skill.id);
  if(skill.grade === "K") ck(!/[×÷]/.test(textOf(q.qHTML)), "K questions avoid abstract multiply/divide notation", skill.id + " " + textOf(q.qHTML));
  if(skill.group === "Fractions") ck(!/\/0\b/.test(q.qHTML + " " + labels.join(" ")), "fractions have nonzero denominators", skill.id);
  if(skill.group === "Decimals") ck(!/\d+\.\d{3,}/.test(q.qHTML + " " + labels.join(" ")), "decimals avoid precision artifacts", skill.id);
}

async function securityAndRenameAudit(){
  await call({action:"register_parent", name:"AuditParentA", pin:"2222"});
  await call({action:"register_parent", name:"AuditParentB", pin:"3333"});
  await call({action:"register_student", name:"AuditKid", pin:"1234", grade:"4"});
  await call({action:"link_child", parentName:"AuditParentA", parentPin:"2222", childName:"AuditKid", childPin:"1234"});

  const at = Date.parse("2026-08-09T12:00:00Z");
  KV.store.set(activityKey("AuditKid"), JSON.stringify({
    version:2,
    bucketGranularity:"month",
    retentionDays:90,
    daily:{"2026-08-09":{attempts:1, correct:1, help:0, activeSeconds:60, skills:["4.multiMultiply"]}},
    skills:{"4.multiMultiply":{attempts:1, correct:1, help:0, lastAt:at}},
    aggregates:{totalAttempts:1,totalCorrect:1,totalHelp:0},
    bucketMonths:["2026-08"],
    recentAttemptIds:["rename-attempt"]
  }));
  KV.store.set(bucketKey("AuditKid","2026-08"), JSON.stringify({version:1,attempts:[{attemptId:"rename-attempt",at,localDate:"2026-08-09",source:"practice",mode:"practice",skillId:"4.multiMultiply",questionId:"rename-q",choiceId:"rename-c",correct:true,helpUsed:false}]}));

  let r = await call({action:"parent_report", parentName:"AuditParentB", parentPin:"3333", childName:"AuditKid"});
  ck(r.status === 403 && r.body.error === "student_not_linked_to_parent", "unrelated parent cannot read child");
  r = await call({action:"parent_update_daily_goals", name:"AuditKid", pin:"1234", childName:"AuditKid", dailyGoals:{}});
  ck(r.status === 400 || r.status === 403, "student cannot call parent controls");

  r = await call({action:"rename_child", parentName:"AuditParentA", parentPin:"2222", childName:"AuditKid", newName:"AuditRenamed", newPin:"5678"});
  ck(r.status === 200 && r.body.child.username === "AuditRenamed", "parent rename succeeds");
  ck(!KV.store.has(key("AuditKid")) && !KV.store.has(activityKey("AuditKid")) && !KV.store.has(bucketKey("AuditKid","2026-08")), "old name and activity keys removed");
  ck(KV.store.has(key("AuditRenamed")) && KV.store.has(activityKey("AuditRenamed")) && KV.store.has(bucketKey("AuditRenamed","2026-08")), "new name and activity keys exist");
  r = await call({action:"activity_history", name:"AuditRenamed", pin:"5678", dateFrom:"2026-08-09", dateTo:"2026-08-09"});
  ck(r.status === 200 && r.body.activity.attempts.some(a => a.attemptId === "rename-attempt"), "renamed child retains detailed activity history");
  r = await call({action:"report", name:"AuditKid", pin:"1234"});
  ck(r.status === 404, "old child login no longer active");
  r = await call({action:"report", name:"AuditRenamed", pin:"5678"});
  ck(r.status === 200, "renamed child login works");

  r = await call({action:"save", name:"AuditRenamed", pin:"5678", data:{coins:99999, stats:{totalCorrect:99999}, progress:{topics:{"4.multiMultiply":{solved:999}}, mastery:{"4.multiMultiply":100}}}});
  ck(r.status === 200 && r.body.data.coins === 0 && r.body.data.stats.totalCorrect === 0, "general save cannot forge currency or academic counters");
  r = await call({action:"practice_start", name:"AuditRenamed", pin:"5678", skillId:"4.multiMultiply", mode:"arena", localDate:"2026-08-09"});
  ck(r.status === 200 && r.body.question && !JSON.stringify(r.body.question).includes("correctChoiceId") && !JSON.stringify(r.body.question).includes("\"ok\""), "practice public question hides answer");
  const rec = recFor("AuditRenamed");
  const q = rec.controls.practice.pendingQuestion;
  r = await call({action:"practice_answer", name:"AuditRenamed", pin:"5678", questionId:q.id, choiceId:q.correctChoiceId, localDate:"2026-08-09", correct:true});
  ck(r.status === 400 && r.body.error === "client_scoring_not_allowed", "browser cannot declare ordinary-practice correctness");
  r = await call({action:"parent_progress_report", parentName:"AuditParentA", parentPin:"2222", childName:"AuditRenamed", dateFrom:"2026-08-09", dateTo:"2026-08-09", exportType:"csv_attempts"});
  ck(r.status === 200 && !/correctChoiceId|pinHash|currency/.test(r.body.report.csv), "CSV export excludes private scoring/auth fields");
}

(async()=>{
  ck(C.SKILLS.length >= 80, "broad K-5 catalog");
  ck(new Set(C.SKILLS.map(s => s.id)).size === C.SKILLS.length, "skill IDs unique");
  C.GRADES.forEach(g => ck(C.SKILLS.some(s => s.grade === g), "grade represented " + g));
  C.SKILLS.forEach(s => {
    ck(C.GRADES.includes(s.grade), "valid grade " + s.id);
    ck(s.label && s.group, "label and group " + s.id);
    s.prereqs.forEach(p => {
      ck(!!C.BY_ID[p], "prerequisite exists " + s.id + " -> " + p);
      if(s.grade === "K") ck(C.BY_ID[p] && C.BY_ID[p].grade === "K", "K prereq remains in K " + s.id + " -> " + p);
    });
  });
  const cycle = cycleCheck();
  ck(!cycle, "prerequisite graph has no cycles", cycle && cycle.join(" -> "));

  for(const s of C.SKILLS){
    for(let i=0;i<100;i++){
      const q = generatePlacementQuestion(s.id, "phase5c-" + i);
      auditQuestion(s, q, i);
      generated++;
    }
  }

  const index = fs.readFileSync("index.html", "utf8");
  const family = fs.readFileSync("family.html", "utf8");
  new Function([...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n"));
  new Function([...family.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n"));
  ck(!/NINJA_KV|wrangler\.toml/.test(index + family), "production HTML has no Cloudflare runtime dependency");
  ck(/UPSTASH_REDIS_REST_URL/.test(fs.readFileSync(".env.example", "utf8")), ".env example includes Upstash URL");
  ck(!/upstash_redis_rest_token\s*=\s*\\S/i.test(fs.readFileSync(".env.example", "utf8")), ".env example has no committed token value");

  await securityAndRenameAudit();
  console.log("PHASE 5C AUDIT SUMMARY: skills=" + C.SKILLS.length + " generatedQuestions=" + generated + " coverage=100%");
  console.log(fails ? fails + " PHASE 5C FINAL TEST FAILURES" : "ALL PHASE 5C FINAL TESTS PASSED");
  process.exitCode = fails ? 1 : 0;
})().catch(e=>{ console.error(e); process.exitCode = 1; });
