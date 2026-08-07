const { webcrypto }=require('crypto'); if(!global.crypto) global.crypto=webcrypto;
const player=require('./functions/api/player.js');
const parentLogin=require('./functions/api/parent-login.js');
const fs=require('fs');

const KV={
  store:new Map(),
  async get(k){return this.store.has(k)?this.store.get(k):null},
  async put(k,v){this.store.set(k,v)},
  async delete(k){this.store.delete(k)}
};
let fails=0;
function ck(v,m,x){if(!v){fails++;console.error('FAIL:',m,x||'')}}
async function pcall(body){
  const r=await player.onRequestPost({request:{json:async()=>body},env:{NINJA_KV:KV}});
  return {status:r.status,body:await r.json()};
}
async function parentCall(body){
  const r=await parentLogin.onRequestPost({request:{json:async()=>body},env:{NINJA_KV:KV}});
  return {status:r.status,body:await r.json()};
}

(async()=>{
  let r;

  // Explicit standalone student creation carries the selected grade.
  r=await pcall({action:'register_student',name:'KindKid',pin:'1234',grade:'K'});
  ck(r.status===200&&r.body.accountType==='student'&&r.body.controls.homeGrade==='K','K student signup',JSON.stringify(r));
  ck(r.body.controls.audioInstructions===true,'K audio defaults on');

  r=await pcall({action:'register_student',name:'FirstKid',pin:'2345',grade:'1'});
  ck(r.status===200&&r.body.controls.homeGrade==='1'&&r.body.controls.audioInstructions===true,'Grade 1 signup defaults audio on');

  r=await pcall({action:'register_student',name:'SecondKid',pin:'3456',grade:'2'});
  ck(r.status===200&&r.body.controls.homeGrade==='2'&&r.body.controls.audioInstructions===false,'Grade 2 audio defaults off');

  // Global username namespace prevents parent/student collisions.
  r=await pcall({action:'register_parent',name:'KindKid',pin:'7777'});
  ck(r.status===409&&r.body.error==='name_taken','student name blocks parent duplicate');
  r=await pcall({action:'register_parent',name:'ParentOne',pin:'4567'});
  ck(r.status===200&&r.body.accountType==='parent','parent signup');
  r=await pcall({action:'register_student',name:'ParentOne',pin:'8888',grade:'3'});
  ck(r.status===409&&r.body.error==='name_taken','parent name blocks student duplicate');

  // Parent-only login does not create accounts when a name is wrong.
  const before=KV.store.size;
  r=await parentCall({name:'TypoParent',pin:'4567'});
  ck(r.status===404&&r.body.error==='no_such_account','unknown parent rejected without creation');
  ck(KV.store.size===before,'parent typo creates no record');
  r=await parentCall({name:'KindKid',pin:'1234'});
  ck(r.status===403&&r.body.error==='wrong_account_type','student cannot enter Parent Dojo');
  r=await parentCall({name:'ParentOne',pin:'0000'});
  ck(r.status===403&&r.body.error==='wrong_pin','wrong parent PIN rejected');
  r=await parentCall({name:'ParentOne',pin:'4567'});
  ck(r.status===200&&r.body.accountType==='parent','parent-only login succeeds');

  // Parent can create a linked child and link an existing standalone child.
  r=await pcall({action:'create_child',parentName:'ParentOne',parentPin:'4567',childName:'LinkedKid',childPin:'5678',grade:'3'});
  ck(r.status===200&&r.body.child.homeGrade==='3'&&r.body.child.linked,'parent creates linked child');
  r=await pcall({action:'link_child',parentName:'ParentOne',parentPin:'4567',childName:'SecondKid',childPin:'3456'});
  ck(r.status===200&&r.body.child.linked,'parent links existing standalone child');
  r=await pcall({action:'list_children',parentName:'ParentOne',parentPin:'4567'});
  ck(r.status===200&&r.body.children.length===2,'parent dashboard returns linked children',JSON.stringify(r.body.children));

  // Unlink preserves child data/account.
  await pcall({action:'save',name:'SecondKid',pin:'3456',data:{level:4,coins:44,progress:{mastery:{'2.skipCount':55}}}});
  r=await pcall({action:'unlink_child',parentName:'ParentOne',parentPin:'4567',childName:'SecondKid'});
  ck(r.status===200&&!r.body.child.linked,'parent can unlink');
  r=await pcall({action:'report',name:'SecondKid',pin:'3456'});
  ck(r.status===200&&r.body.data.level===4&&r.body.data.coins===44,'unlink preserves progress');

  // A legacy record with no controls behaves as a Grade 4 student.
  await pcall({action:'login',name:'LegacyFour',pin:'6789'});
  const legacy=JSON.parse(KV.store.get('player:legacyfour'));
  delete legacy.accountType; delete legacy.controls; delete legacy.schema; legacy.data={level:8,coins:99};
  KV.store.set('player:legacyfour',JSON.stringify(legacy));
  r=await pcall({action:'report',name:'LegacyFour',pin:'6789'});
  ck(r.status===200&&r.body.controls.homeGrade==='4'&&r.body.data.level===8,'legacy account defaults to Grade 4 without progress loss');

  // Front-end Phase 1 contract checks.
  const integration=fs.readFileSync('js/k5-integration.js','utf8');
  const family=fs.readFileSync('family.html','utf8');
  ck(integration.includes('Returning Student')&&integration.includes('Create Student'),'student onboarding modes exist');
  ck(integration.includes('register_student')&&integration.includes("action:'report'"),'signup and non-creating returning login are distinct');
  ck(integration.includes("location.href='/family.html'"),'parent entry routes to Parent Dojo');
  ck(family.includes('const IDLE_MS=2*60*1000'),'Parent Dojo uses 2-minute inactivity lock');
  ck(family.includes("PARENT_LOGIN='/api/parent-login'"),'Parent Dojo uses parent-only login endpoint');
  ck(family.includes('Create a new student')&&family.includes('Link an existing student'),'parent child onboarding options exist');

  console.log(fails?fails+' PHASE 1 TEST FAILURES':'ALL PHASE 1 TESTS PASSED');
  process.exitCode=fails?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
