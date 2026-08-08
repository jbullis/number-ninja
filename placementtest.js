const { webcrypto }=require('crypto'); if(!global.crypto) global.crypto=webcrypto;
const C=require('./js/curriculum.js');
const P=require('./js/placement.js');
const api=require('./lib/number-ninja-api.js');

const KV={store:new Map(),async get(k){return this.store.has(k)?this.store.get(k):null},async set(k,v){this.store.set(k,v)},async delete(k){this.store.delete(k)}};
let fails=0;
function ck(v,m,x){if(!v){fails++;console.error('FAIL:',m,x||'')}}
async function call(body){const r=await api.playerPost({json:async()=>body},{store:KV});return {status:r.status,body:await r.json()}}
function recFor(name){ return JSON.parse(KV.store.get('player:'+name.toLowerCase())); }
function rightChoice(name){ return recFor(name).controls.placement.pendingQuestion.correctChoiceId; }

(async()=>{
  ck(P.bands('K').join(',')==='K,1','Kindergarten samples K and 1');
  ck(P.bands('5').join(',')==='4,5','Grade 5 samples 4 and 5');
  ck(P.bands('3').join(',')==='2,3,4','middle grades sample below/current/above');
  ck(P.representativeSkills('3').length<=12&&P.representativeSkills('3').some(s=>s.grade==='2')&&P.representativeSkills('3').some(s=>s.grade==='4'),'representative pool spans bands');

  let controls={homeGrade:'4',allowAboveGrade:true,skillOverrides:{},placement:P.newPlacementState('4',0)};
  let pl=P.startAttempt(controls,1000);
  ck(pl.status==='in_progress'&&pl.homeGradeAtStart==='4'&&pl.attempt===1,'start attempt structure');
  ['4.multiMultiply','4.longDivision','3.multiply','5.operations','3.divide','5.placeValueDecimals','4.fractionEquiv','3.area'].forEach(id=>{pl=P.recordResponse(pl,id,true)});
  ck(P.shouldStop(pl),'early stop after enough strong evidence');
  pl=P.completeAttempt(pl,controls,{'4.multiMultiply':90},2000);
  ck(pl.status==='completed'&&pl.lastTaken===2000,'complete attempt');
  ck(pl.recommendations.some(r=>r.skillGrade==='5'&&r.recommendedOverride==='unlocked'),'strong performance can recommend above-grade unlock');
  ck(!pl.homeGradeRecommendation&&pl.homeGradeAtStart==='4','no home-grade auto-change');

  let weak=P.startAttempt({homeGrade:'2',skillOverrides:{}},1);
  ['1.addSub20','1.addSub20','2.addSub100','2.addSub100','1.placeValue100','1.placeValue100'].forEach((id,i)=>{weak=P.recordResponse(weak,id,i===4)});
  weak=P.completeAttempt(weak,{homeGrade:'2',skillOverrides:{}},{'1.addSub20':70},2);
  ck(weak.recommendations.some(r=>r.action==='recommend_lower_skill_reinforcement'||r.action==='strengthen_prerequisite'),'weak prerequisite yields reinforcement');

  const beforeControls={homeGrade:'4',skillOverrides:{'4.logic':'unlocked'},placement:pl};
  const applied=P.applyRecommendations(beforeControls,pl.recommendations.filter(r=>r.recommendedOverride).slice(0,1).map(r=>r.id),3000);
  ck(applied.controls.homeGrade==='4','apply does not change home grade');
  ck(applied.controls.skillOverrides['4.logic']==='unlocked','existing unlocked state preserved');
  const undone=P.undoLastApply(applied.controls,4000);
  ck(undone.restored.length===applied.applied.length,'undo restores last placement apply');
  ck(undone.controls.skillOverrides['4.logic']==='unlocked','undo does not remove unrelated parent setting');

  const skipped=P.skipPlacement(P.newPlacementState('1',0),'1',5000);
  ck(skipped.status==='skipped'&&skipped.recommended===false,'skip behavior');
  const retake=P.resetForRetake(skipped,'1',6000);
  ck(retake.status==='not_started'&&retake.recommended&&retake.attempt===1&&retake.history.length===1,'retake preserves history');

  let r=await call({action:'register_student',name:'PlaceKid',pin:'1234',grade:'3'});
  ck(r.status===200&&r.body.controls.placement.status==='not_started','student has placement state');
  r=await call({action:'placement_skip',name:'PlaceKid',pin:'1234'});
  ck(r.body.placement.status==='skipped','API skip');
  r=await call({action:'placement_start',name:'PlaceKid',pin:'1234'});
  ck(r.body.placement.status==='in_progress'&&r.body.question&&r.body.nextSkill,'API start placement');
  ck(!JSON.stringify(r.body).includes('correctChoiceId'),'public placement response does not expose answer key');
  const firstQuestion=r.body.question;
  const resumed=await call({action:'placement_start',name:'PlaceKid',pin:'1234'});
  ck(resumed.body.question.id===firstQuestion.id&&resumed.body.placement.responses.total===0,'repeated placement_start resumes active run');
  let forged=await call({action:'placement_progress',name:'PlaceKid',pin:'1234',skillId:'5.logic',correct:true});
  ck(forged.status===400&&forged.body.error==='question_required','client cannot fake correct boolean');
  forged=await call({action:'placement_progress',name:'PlaceKid',pin:'1234',questionId:firstQuestion.id,choiceId:firstQuestion.choices[0].id,skillId:'5.logic'});
  ck(forged.status===409&&forged.body.error==='different_skill','arbitrary skill ID is rejected');
  forged=await call({action:'placement_progress',name:'PlaceKid',pin:'1234',questionId:firstQuestion.id,choiceId:'fake-choice'});
  ck(forged.status===400&&forged.body.error==='invalid_choice','arbitrary choice rejected');
  const wrongChoice=firstQuestion.choices.find(c=>c.id!==rightChoice('PlaceKid')).id;
  r=await call({action:'placement_progress',name:'PlaceKid',pin:'1234',questionId:firstQuestion.id,choiceId:wrongChoice});
  ck(r.status===200&&r.body.correct===false&&r.body.placement.responses.correct===0,'server scores incorrect selected answer');
  forged=await call({action:'placement_progress',name:'PlaceKid',pin:'1234',questionId:firstQuestion.id,choiceId:wrongChoice});
  ck(forged.status===409&&forged.body.error==='stale_question','stale duplicate response rejected');
  forged=await call({action:'placement_complete',name:'PlaceKid',pin:'1234'});
  ck(forged.status===409&&forged.body.error==='pending_question_unanswered','cannot complete with pending question');
  for(let i=0;i<12;i++){
    const q=r.body.question;
    r=await call({action:'placement_progress',name:'PlaceKid',pin:'1234',questionId:q.id,choiceId:rightChoice('PlaceKid')});
    if(r.body.stop)break;
  }
  r=await call({action:'placement_complete',name:'PlaceKid',pin:'1234'});
  ck(r.body.placement.status==='completed'&&r.body.placement.recommendations.length>0,'API complete recommendations');

  r=await call({action:'register_student',name:'EarlyKid',pin:'3333',grade:'4'});
  r=await call({action:'placement_start',name:'EarlyKid',pin:'3333'});
  r=await call({action:'placement_progress',name:'EarlyKid',pin:'3333',questionId:r.body.question.id,choiceId:rightChoice('EarlyKid')});
  r=await call({action:'placement_complete',name:'EarlyKid',pin:'3333'});
  ck(r.status===409&&r.body.error==='pending_question_unanswered','early completion rejected before minimum evidence');

  r=await call({action:'register_student',name:'MaxKid',pin:'4444',grade:'4'});
  r=await call({action:'placement_start',name:'MaxKid',pin:'4444'});
  let last;
  for(let i=0;i<12;i++){
    const q=r.body.question;
    last=await call({action:'placement_progress',name:'MaxKid',pin:'4444',questionId:q.id,choiceId:rightChoice('MaxKid')});
    r=last;
    if(r.body.stop)break;
  }
  ck(last.body.stop===true&&last.body.placement.responses.total<=12,'maximum 12-question stop still works');

  r=await call({action:'apply_placement_recommendations',name:'PlaceKid',pin:'1234',childName:'PlaceKid'});
  ck(r.status===403&&r.body.error==='wrong_account_type','child cannot apply placement recommendations');
  await call({action:'register_parent',name:'PlaceParent',pin:'2222'});
  r=await call({action:'link_child',parentName:'PlaceParent',parentPin:'2222',childName:'PlaceKid',childPin:'1234'});
  ck(r.status===200,'link child for parent placement actions');
  r=await call({action:'parent_report',parentName:'PlaceParent',parentPin:'2222',childName:'PlaceKid'});
  const recIds=(r.body.controls.placement.recommendations||[]).filter(x=>x.recommendedOverride).slice(0,1).map(x=>x.id);
  r=await call({action:'apply_placement_recommendations',parentName:'PlaceParent',parentPin:'2222',childName:'PlaceKid',recommendationIds:recIds});
  ck(r.status===200&&Array.isArray(r.body.applied),'parent selected apply');
  r=await call({action:'undo_placement_recommendations',parentName:'PlaceParent',parentPin:'2222',childName:'PlaceKid'});
  ck(r.status===200&&Array.isArray(r.body.restored),'parent undo');
  r=await call({action:'reset_placement',parentName:'PlaceParent',parentPin:'2222',childName:'PlaceKid'});
  ck(r.status===200&&r.body.controls.placement.status==='not_started'&&r.body.controls.placement.history.length>0,'parent retake preserves history');

  console.log(fails?fails+' PLACEMENT TEST FAILURES':'ALL PLACEMENT TESTS PASSED');
  process.exitCode=fails?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
