const { webcrypto }=require('crypto'); if(!global.crypto) global.crypto=webcrypto;
const api=require('./lib/number-ninja-api.js');

const KV={
  store:new Map(),
  async get(k){return this.store.has(k)?this.store.get(k):null},
  async set(k,v){this.store.set(k,v)},
  async delete(k){this.store.delete(k)}
};
let fails=0;
function ck(v,m,x){if(!v){fails++;console.error('FAIL:',m,x||'')}}
async function call(body){
  const r=await api.playerPost({json:async()=>body},{store:KV});
  return {status:r.status,body:await r.json()};
}

(async()=>{
  let r;
  r=await call({action:'register_parent',name:'MomNinja',pin:'1111'});
  ck(r.status===200&&r.body.accountType==='parent','create parent',JSON.stringify(r));

  // Standalone child signup remains supported.
  r=await call({action:'login',name:'NovaKid',pin:'2222',grade:'1'});
  ck(r.body.created&&r.body.accountType==='student'&&r.body.controls.homeGrade==='1','standalone student signup');

  r=await call({action:'link_child',parentName:'MomNinja',parentPin:'1111',childName:'NovaKid',childPin:'9999'});
  ck(r.status===403&&r.body.error==='wrong_child_pin','link requires child PIN');
  r=await call({action:'link_child',parentName:'MomNinja',parentPin:'1111',childName:'NovaKid',childPin:'2222'});
  ck(r.status===200&&r.body.child.linked,'link existing student');

  r=await call({action:'register_parent',name:'DadNinja',pin:'3333'});
  ck(r.status===200,'create second parent');
  r=await call({action:'link_child',parentName:'DadNinja',parentPin:'3333',childName:'NovaKid',childPin:'2222'});
  ck(r.status===409&&r.body.error==='student_already_linked','one parent at a time');

  r=await call({action:'list_children',parentName:'MomNinja',parentPin:'1111'});
  ck(r.body.children.length===1&&r.body.children[0].username==='NovaKid','parent child roster');

  r=await call({action:'update_child_controls',parentName:'MomNinja',parentPin:'1111',childName:'NovaKid',controls:{homeGrade:'1',allowAboveGrade:false,audioInstructions:true}});
  ck(r.body.controls.allowAboveGrade===false&&r.body.controls.audioInstructions===true,'parent controls update');

  // A child save must not overwrite parent controls.
  r=await call({action:'save',name:'NovaKid',pin:'2222',data:{level:7,coins:321,progress:{mastery:{ops:80}}}});
  ck(r.status===200,'child save');
  r=await call({action:'parent_report',parentName:'MomNinja',parentPin:'1111',childName:'NovaKid'});
  ck(r.body.data.level===7&&r.body.controls.allowAboveGrade===false,'controls survive child save');

  // Parent-only reset changes login PIN without touching progress.
  r=await call({action:'reset_child_pin',parentName:'MomNinja',parentPin:'1111',childName:'NovaKid',newPin:'4444'});
  ck(r.status===200,'reset child pin');
  r=await call({action:'login',name:'NovaKid',pin:'2222'});
  ck(r.status===403,'old PIN rejected');
  r=await call({action:'login',name:'NovaKid',pin:'4444'});
  ck(r.status===200&&r.body.data.level===7,'new PIN works and progress remains');

  // Unlink leaves the child standalone and intact, then a different parent can link.
  r=await call({action:'unlink_child',parentName:'MomNinja',parentPin:'1111',childName:'NovaKid'});
  ck(r.status===200&&!r.body.child.linked,'unlink child');
  r=await call({action:'login',name:'NovaKid',pin:'4444'});
  ck(r.status===200&&r.body.data.level===7&&r.body.data.coins===0&&!r.body.linkedParent,'unlinked child remains playable without minted coins');
  r=await call({action:'link_child',parentName:'DadNinja',parentPin:'3333',childName:'NovaKid',childPin:'4444'});
  ck(r.status===200,'different parent may link after unlink');

  // Parent-created child uses selected grade and globally unique username.
  r=await call({action:'create_child',parentName:'MomNinja',parentPin:'1111',childName:'TinyNinja',childPin:'5555',grade:'K'});
  ck(r.status===200&&r.body.child.homeGrade==='K','parent creates Kindergarten child');
  r=await call({action:'create_child',parentName:'DadNinja',parentPin:'3333',childName:'TinyNinja',childPin:'6666',grade:'2'});
  ck(r.status===409&&r.body.error==='name_taken','usernames globally unique');

  // Legacy student records migrate softly to Grade 4 and preserve data.
  const legacyHash=JSON.parse(KV.store.get('player:tinyninja')).pinHash; // just obtain valid hash shape
  KV.store.set('player:legacykid',JSON.stringify({pinHash:legacyHash,data:{level:9,coins:88},created:1,updated:1}));
  // Hash is name-salted, so construct a real legacy account through login then strip schema fields.
  await call({action:'login',name:'LegacyReal',pin:'7777'});
  const lr=JSON.parse(KV.store.get('player:legacyreal'));
  KV.store.set('player:legacyreal',JSON.stringify({pinHash:lr.pinHash,data:{level:9,coins:88},created:1,updated:1}));
  r=await call({action:'login',name:'LegacyReal',pin:'7777'});
  ck(r.status===200&&r.body.accountType==='student'&&r.body.controls.homeGrade==='4'&&r.body.data.level===9,'legacy migration to Grade 4 preserves progress');

  console.log(fails?fails+' FAMILY TEST FAILURES':'ALL FAMILY TESTS PASSED');
  process.exitCode=fails?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
