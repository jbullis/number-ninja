/* K-5 integration layer for the original single-file game.
 * Loaded after index.html so the existing game remains lightweight.
 */
(function(){
  'use strict';
  if(!window.NINJA_CURRICULUM) return;
  const C=window.NINJA_CURRICULUM;
  const P=window.NINJA_PLACEMENT;
  const M=window.NINJA_MASTERY;
  const D=window.NINJA_DAILY;
  const R=window.NINJA_RECOMMENDATIONS;
  const PROFILE={controls:{homeGrade:'4',allowAboveGrade:true,audioInstructions:false,skillOverrides:{}},accountType:'student'};
  window.NINJA_PROFILE=PROFILE;
  let signupMode=false;
  let DAILY_STATUS=null, DAILY_RECS=null, lastActiveAt=Date.now(), lastHeartbeatAt=Date.now();

  function gradeLabel(g){return g==='K'?'Kindergarten':'Grade '+g}
  function controls(){return PROFILE.controls||{homeGrade:'4',allowAboveGrade:true,skillOverrides:{}}}
  function masterySummary(){return M?M.summary({progress:S.progress},controls()):{eligibleChallenges:[],dueReviews:[],bySkill:{}}}
  function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function eventId(kind){return kind+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)}
  function mergeDaily(r){if(r&&r.data&&r.data.ok){if(r.data.controls)PROFILE.controls=r.data.controls;if(r.data.dailyStatus)DAILY_STATUS=r.data.dailyStatus;if(r.data.recommendations)DAILY_RECS=r.data.recommendations;}}
  function dots(n,emoji){emoji=emoji||'●';return '<div style="font-size:30px;line-height:1.5;letter-spacing:5px;max-width:420px;margin:auto">'+Array.from({length:n},()=>emoji).join(' ')+'</div>'}
  function q(topic,html,ans,alts,tip){return {topic,qHTML:html,choices:numChoices(ans,alts||[]),tip:tip||'Take your time and use what you already know.'}}
  function seqChoices(ans,spread){return numChoices(ans,[ans-1,ans+1,ans+(spread||2),Math.max(0,ans-(spread||2))])}

  function genSkill(id){
    const s=C.BY_ID[id]||{grade:'4',label:'Math'};
    switch(id){
      case 'k.count100':{const by10=ri(0,2)===0;if(by10){const a=ri(0,7)*10,ans=a+20;return {topic:id,qHTML:'<div class="qBig">'+a+', '+(a+10)+', ?</div><div class="qSub">Count by tens</div>',choices:seqChoices(ans,10),tip:'Each number is 10 more.'}}const a=ri(0,98),ans=a+1;return {topic:id,qHTML:'<div class="qBig">'+a+', ?</div><div class="qSub">What comes next?</div>',choices:seqChoices(ans),tip:'Count one more.'}}
      case 'k.quantity10':case 'k.subitize10':{const n=ri(1,10);return q(id,dots(n,'⭐')+'<div class="qSub">How many stars?</div>',n,[n+1,Math.max(0,n-1),n+2],'You can count each star, or look for groups you recognize.')}
      case 'k.readWrite20':{const n=ri(0,20);return q(id,'<div class="qBig">'+n+'</div><div class="qSub">Which group has '+n+'?</div>',n,[Math.max(0,n-1),n+1,Math.max(0,n-2)],'Match the number to the amount.')}
      case 'k.oneMoreLess10':{const n=ri(1,9),more=ri(0,1)===1,ans=n+(more?1:-1);return q(id,'<div class="qBig">'+n+'</div><div class="qSub">What is 1 '+(more?'more':'less')+'?</div>',ans,[n,n+(more?-1:1),Math.max(0,ans+(more?1:-1))],'Move one step '+(more?'forward':'backward')+' when counting.')}
      case 'k.compare10':{let a=ri(0,10),b=ri(0,10);while(b===a)b=ri(0,10);const ans=a>b?a:b;return q(id,'<div class="qBig">'+a+' &nbsp; or &nbsp; '+b+'</div><div class="qSub">Which number is MORE?</div>',ans,[a>b?b:a,Math.max(0,ans-1),ans+1],'The number farther along when you count is greater.')}
      case 'k.compose10':case 'k.addSub10':{const add=ri(0,1)===1;let a=ri(0,5),b=ri(0,5),ans;if(add){ans=a+b;return q(id,dots(a,'🍎')+'<div class="qBig">+ '+b+' more = ?</div>',ans,[ans+1,Math.max(0,ans-1),a],'Put the two groups together.') } a=ri(3,10);b=ri(0,a);ans=a-b;return q(id,dots(a,'🍎')+'<div class="qBig">Take away '+b+'. How many left?</div>',ans,[ans+1,Math.max(0,ans-1),b],'Start with all the apples and take some away.')}
      case 'k.patterns':case 'k.logic':{const pats=[['🔴','🔵'],['⭐','⭐','🌙'],['▲','■']];const p=pick(pats),len=5,arr=[];for(let i=0;i<len;i++)arr.push(p[i%p.length]);const ans=p[len%p.length],alts=['🔴','🔵','⭐','🌙','▲','■'].filter(x=>x!==ans);return {topic:id,qHTML:'<div class="qBig">'+arr.join(' ')+' ?</div><div class="qSub">What comes next?</div>',choices:shuffle([ans,...shuffle(alts).slice(0,3)]).map(x=>({h:x,ok:x===ans})),tip:'Find the part that repeats.'}}
      case 'k.shapes':case 'k.composeShapes':{const shapes=[['▲','triangle'],['■','square'],['●','circle'],['▬','rectangle']];const z=pick(shapes),alts=shapes.filter(x=>x[1]!==z[1]).map(x=>x[1]);return {topic:id,qHTML:'<div class="qBig" style="font-size:64px">'+z[0]+'</div><div class="qSub">What shape is this?</div>',choices:shuffle([z[1],...alts]).map(x=>({h:x,ok:x===z[1]})),tip:'Look at the sides and corners.'}}
      case '1.addSub20':case '1.fluency10':case '1.missingNumber':{const max=id==='1.fluency10'?10:20,a=ri(1,max-1),b=ri(0,max-a),ans=a+b;if(id==='1.missingNumber')return q(id,'<div class="qBig">'+a+' + ? = '+ans+'</div>',b,[b+1,Math.max(0,b-1),a],'Ask what you add to '+a+' to reach '+ans+'.');return q(id,'<div class="qBig">'+a+' + '+b+' = ?</div>',ans,[ans+1,Math.max(0,ans-1),a+b+2],'Make a 10 first when it helps.')}
      case '1.placeValue100':case '1.compare100':{const n=ri(10,99),t=Math.floor(n/10),o=n%10;if(id==='1.placeValue100')return q(id,'<div class="qBig">'+n+'</div><div class="qSub">How many tens?</div>',t,[o,t+1,Math.max(0,t-1)],n+' has '+t+' tens and '+o+' ones.');let b=ri(10,99);while(b===n)b=ri(10,99);const ans=Math.max(n,b);return q(id,'<div class="qBig">'+n+' &nbsp; or &nbsp; '+b+'</div><div class="qSub">Which is greater?</div>',ans,[Math.min(n,b),ans+10,Math.max(0,ans-10)],'Compare the tens first.')}
      case '1.addWithin100':case '2.addSub100':{const a=ri(10,70),b=ri(1,Math.min(29,100-a)),ans=a+b;return q(id,'<div class="qBig">'+a+' + '+b+' = ?</div>',ans,[ans+10,ans-10,ans+1],'Add tens and ones carefully.')}
      case '2.placeValue1000':{const n=ri(100,999),h=Math.floor(n/100);return q(id,'<div class="qBig">'+n+'</div><div class="qSub">How many hundreds?</div>',h,[h+1,Math.max(0,h-1),Math.floor((n%100)/10)],'The hundreds digit is the third digit from the right.')}
      case '2.skipCount':{const step=pick([2,5,10]),a=step*ri(1,8),ans=a+step*2;return q(id,'<div class="qBig">'+a+', '+(a+step)+', ?</div><div class="qSub">Skip-count by '+step+'s</div>',ans,[ans+step,ans-step,a+1],'Add '+step+' each time.')}
      case '2.addSub1000':{const a=ri(100,700),b=ri(20,Math.min(250,999-a)),ans=a+b;return q(id,'<div class="qBig">'+a+' + '+b+' = ?</div>',ans,[ans+100,ans-100,ans+10],'Line up hundreds, tens, and ones.')}
      case '2.equalGroups':{const groups=ri(2,5),each=ri(2,5),ans=groups*each;return q(id,'<div class="qStory">'+groups+' groups have '+each+' stars each.</div><div class="qBig">How many stars?</div>',ans,[ans+groups,ans-groups,groups+each],'Repeated addition makes equal groups.')}
      case '3.multiply':case '3.fluency':{const a=ri(2,10),b=ri(2,10),ans=a*b;return q(id,'<div class="qBig">'+a+' × '+b+' = ?</div>',ans,[ans+a,ans-b,a+b],'Think in equal groups or known facts.')}
      case '3.divide':{const b=ri(2,10),ans=ri(2,10),a=b*ans;return q(id,'<div class="qBig">'+a+' ÷ '+b+' = ?</div>',ans,[ans+1,ans-1,b],'Use the matching multiplication fact.')}
      case '3.area':case '3.perimeter':{const a=ri(2,9),b=ri(2,9),ans=id==='3.area'?a*b:2*(a+b);return q(id,'<div class="qStory">Rectangle: '+a+' by '+b+'</div><div class="qBig">'+(id==='3.area'?'Area':'Perimeter')+' = ?</div>',ans,[a*b,2*(a+b),a+b].filter(x=>x!==ans),'Area fills the inside; perimeter goes around the edge.')}
      default:{
        if(s.grade==='4'||s.grade==='5'){
          const map={Fractions:'fraction',Multiplication:'multiply',Division:'multiply',Factors:'factor',Geometry:'shape',Measurement:'shape',Numbers:'compare','Algebraic Thinking':'equation','Problem Solving':'ops','Logic & Puzzles':'ops',Operations:'ops',Decimals:'fraction',Data:'compare',Probability:'compare'};
          const old=map[s.group]||'ops'; const g=GENS[old]||genOps; const z=g(s.grade==='5'?4:2); z.topic=id; return z;
        }
        const a=ri(1,20),b=ri(1,20),ans=a+b;return q(id,'<div class="qBig">'+a+' + '+b+' = ?</div>',ans,[ans+1,ans-1,ans+2],s.label);
      }
    }
  }

  function ensurePlacementUi(){
    if(!P || document.getElementById('placementOverlay')) return;
    const style=document.createElement('style');
    style.textContent='.plcOverlay{position:fixed;inset:0;z-index:80;background:rgba(5,8,30,.94);display:none;align-items:center;justify-content:center;padding:18px}.plcOverlay.on{display:flex}.plcCard{width:min(760px,100%);max-height:92vh;overflow:auto;background:#111842;border:1px solid #2c3577;border-radius:18px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.45);text-align:center}.plcGlyph{font-size:46px}.plcTitle{font-size:26px;font-weight:900;color:#ffb020;margin:5px 0}.plcSub{color:#c8d0ff;font-size:14px;line-height:1.45;margin:6px auto 14px;max-width:560px}.plcActions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}.plcBtn{border:0;border-radius:12px;padding:12px 16px;font-weight:900;background:#303b86;color:#fff}.plcBtn.good{background:#17633d}.plcBtn.ghost{background:#0d1340;border:1px solid #2c3577}.plcProgress{font-size:12px;color:#9aa3d8;font-weight:900;margin:0 0 10px}.plcQ{background:#0d1340;border:1px solid #2c3577;border-radius:15px;padding:14px;margin:12px 0}.plcAnswers{display:grid;grid-template-columns:1fr 1fr;gap:10px}.plcAns{border:1px solid #343e8f;border-radius:14px;background:#1b2258;color:#fff;font-size:20px;font-weight:900;padding:15px}.plcAns:disabled{opacity:.7}.plcDone{color:#8cf0b2;font-weight:900;margin-top:8px}';
    document.head.appendChild(style);
    const el=document.createElement('div');el.id='placementOverlay';el.className='plcOverlay';
    el.innerHTML='<div class="plcCard"><div id="plcBody"></div></div>';
    document.body.appendChild(el);
  }
  function placementState(){ return P ? P.normalizePlacement((PROFILE.controls||{}).placement, (PROFILE.controls||{}).homeGrade||'4') : null; }
  function shouldOfferPlacement(created){
    if(!P || !SYNC || !SYNC.online) return false;
    const p=placementState();
    return p && p.recommended!==false && (p.status==='not_started' || p.status==='in_progress') && (created || p.retakeRequestedAt || p.status==='in_progress');
  }
  let plcCurrent=null;
  function showPlacementOffer(){
    ensurePlacementUi();
    const o=document.getElementById('placementOverlay'), b=document.getElementById('plcBody');
    o.classList.add('on');
    const c=controls(), p=placementState();
    b.innerHTML='<div class="plcGlyph">ðŸ§­</div><div class="plcTitle">Find Your Best Starting Path</div>'+
      '<div class="plcSub">This short check looks at '+P.bands(c.homeGrade||'4').map(gradeLabel).join(', ')+'. It helps your grown-up choose just-right skills. No coins, streaks, or belts are affected.</div>'+
      '<div class="plcSub">You can skip it for now and play normally.</div>'+
      '<div class="plcActions"><button class="plcBtn good" id="plcStart">Start Placement</button><button class="plcBtn ghost" id="plcSkip">Skip for Now</button></div>';
    document.getElementById('plcStart').onclick=startPlacement;
    document.getElementById('plcSkip').onclick=skipPlacement;
  }
  async function startPlacement(){
    const r=await apiPost({action:'placement_start',name:SYNC.name,pin:SYNC.pin});
    if(r.data&&r.data.ok){ PROFILE.controls.placement=r.data.placement; renderPlacementQuestion(r.data.question); }
  }
  async function skipPlacement(){
    const r=await apiPost({action:'placement_skip',name:SYNC.name,pin:SYNC.pin});
    if(r.data&&r.data.ok) PROFILE.controls.placement=r.data.placement;
    document.getElementById('placementOverlay').classList.remove('on');
    renderHome();
  }
  function renderPlacementQuestion(question){
    ensurePlacementUi();
    const p=placementState(), skill=question&&C.BY_ID[question.skillId];
    plcCurrent={question};
    const b=document.getElementById('plcBody');
    b.innerHTML='<div class="plcProgress">Question '+((p.responses&&p.responses.total||0)+1)+' · The check stops when there is enough evidence</div>'+
      '<div class="plcTitle">'+(skill?skill.label:'Placement question')+'</div>'+
      '<div class="plcSub">'+(skill?gradeLabel(skill.grade):'')+' · No rewards or penalties here.</div>'+
      '<div class="plcQ">'+(question&&question.qHTML||'')+'</div><div class="plcAnswers" id="plcAnswers"></div><div class="plcDone" id="plcMsg"></div>';
    const wrap=document.getElementById('plcAnswers');
    (question&&question.choices||[]).forEach((c,i)=>{
      const btn=document.createElement('button');btn.className='plcAns';btn.innerHTML=c.h;btn.onclick=()=>answerPlacement(c.id,btn);wrap.appendChild(btn);
    });
  }
  async function answerPlacement(choiceId,btn){
    if(!plcCurrent||!plcCurrent.question) return;
    document.querySelectorAll('.plcAns').forEach(b=>b.disabled=true);
    const r=await apiPost({action:'placement_progress',name:SYNC.name,pin:SYNC.pin,questionId:plcCurrent.question.id,choiceId});
    if(!(r.data&&r.data.ok)){ document.getElementById('plcMsg').textContent='Could not save that answer. Try again in a moment.'; return; }
    btn.style.borderColor=r.data.correct?'#4ade80':'#ff6b7a';
    PROFILE.controls.placement=r.data.placement;
    if(r.data.stop){
      const done=await apiPost({action:'placement_complete',name:SYNC.name,pin:SYNC.pin});
      if(done.data&&done.data.ok) PROFILE.controls.placement=done.data.placement;
      showPlacementDone();
    } else {
      setTimeout(()=>renderPlacementQuestion(r.data.question),550);
    }
  }
  function showPlacementDone(){
    const b=document.getElementById('plcBody');
    b.innerHTML='<div class="plcGlyph">âœ¨</div><div class="plcTitle">Placement Complete</div>'+
      '<div class="plcSub">Nice focus. Number Ninja has enough information to help your grown-up choose a good practice path.</div>'+
      '<div class="plcSub">You can keep playing now.</div><div class="plcActions"><button class="plcBtn good" id="plcDoneBtn">Back to Dojo</button></div>';
    document.getElementById('plcDoneBtn').onclick=()=>{document.getElementById('placementOverlay').classList.remove('on');renderHome();show('home')};
  }

  async function refreshDaily(){
    if(!SYNC||!SYNC.online||!D)return;
    try{const r=await apiPost({action:'daily_status',name:SYNC.name,pin:SYNC.pin,localDate:localDate()});mergeDaily(r);renderDailyPanel();}catch(e){}
  }
  async function countDailyProblem(source){
    if(!SYNC||!SYNC.online||!D)return;
    try{const r=await apiPost({action:'daily_problem_complete',name:SYNC.name,pin:SYNC.pin,localDate:localDate(),eventId:eventId(source||'practice'),source:source||'practice'});mergeDaily(r);renderDailyPanel();}catch(e){}
  }
  async function sendActiveHeartbeat(source){
    if(!SYNC||!SYNC.online||!D||document.hidden)return;
    const now=Date.now();
    if(now-lastActiveAt>120000)return;
    const sec=Math.max(1,Math.min(30,Math.floor((now-lastHeartbeatAt)/1000)));
    if(sec<15)return;
    lastHeartbeatAt=now;
    try{const r=await apiPost({action:'daily_active_time',name:SYNC.name,pin:SYNC.pin,localDate:localDate(),eventId:eventId('time'),seconds:sec,source:source||'practice'});mergeDaily(r);renderDailyPanel();}catch(e){}
  }
  ['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{lastActiveAt=Date.now()},{passive:true}));
  document.addEventListener('visibilitychange',()=>{lastActiveAt=Date.now();lastHeartbeatAt=Date.now()});
  setInterval(()=>{if(SYNC&&SYNC.online&&(S.mode==='arena'||S.mode==='story'||masteryCurrent))sendActiveHeartbeat(masteryCurrent?masteryCurrent.kind:'practice')},30000);

  let masteryCurrent=null;
  async function startMasteryChallenge(skillId){
    ensurePlacementUi();
    const r=await apiPost({action:'mastery_challenge_start',name:SYNC.name,pin:SYNC.pin,skillId});
    if(!(r.data&&r.data.ok)){comboFlash('Practice a little more first.');return;}
    renderMasteryQuestion('challenge',r.data.question);
  }
  async function startMasteryReview(skillId){
    ensurePlacementUi();
    const r=await apiPost({action:'mastery_review_start',name:SYNC.name,pin:SYNC.pin,skillId});
    if(!(r.data&&r.data.ok)){comboFlash('Review is not ready yet.');return;}
    renderMasteryQuestion('review',r.data.question);
  }
  function renderMasteryQuestion(kind,question){
    ensurePlacementUi();
    const o=document.getElementById('placementOverlay'), b=document.getElementById('plcBody');
    o.classList.add('on');
    masteryCurrent={kind,question};
    const skill=question&&C.BY_ID[question.skillId], title=kind==='review'?'Black Belt Review':'Black Belt Challenge';
    b.innerHTML='<div class="plcProgress">Question '+(question&&question.questionNumber||1)+' of '+(question&&question.totalQuestions||'')+'</div>'+
      '<div class="plcTitle">'+title+'</div>'+
      '<div class="plcSub">'+(skill?skill.label:'Skill check')+' Â· No coins, streaks, or belts change while this is being scored.</div>'+
      '<div class="plcQ">'+(question&&question.qHTML||'')+'</div><div class="plcAnswers" id="masteryAnswers"></div><div class="plcDone" id="masteryMsg"></div>';
    const wrap=document.getElementById('masteryAnswers');
    (question&&question.choices||[]).forEach(c=>{
      const btn=document.createElement('button');btn.className='plcAns';btn.innerHTML=c.h;btn.onclick=()=>answerMastery(c.id,btn);wrap.appendChild(btn);
    });
  }
  async function answerMastery(choiceId,btn){
    if(!masteryCurrent||!masteryCurrent.question) return;
    document.querySelectorAll('.plcAns').forEach(b=>b.disabled=true);
    const action=masteryCurrent.kind==='review'?'mastery_review_answer':'mastery_challenge_answer';
    const r=await apiPost({action,name:SYNC.name,pin:SYNC.pin,questionId:masteryCurrent.question.id,choiceId});
    if(!(r.data&&r.data.ok)){document.getElementById('masteryMsg').textContent='Could not save that answer. Try again in a moment.';return;}
    btn.style.borderColor=r.data.correct?'#4ade80':'#ff6b7a';
    countDailyProblem(masteryCurrent.kind==='review'?'mastery_review':'mastery_challenge');
    if(!r.data.complete){setTimeout(()=>renderMasteryQuestion(masteryCurrent.kind,r.data.question),550);return;}
    const doneAction=masteryCurrent.kind==='review'?'mastery_review_complete':'mastery_challenge_complete';
    const done=await apiPost({action:doneAction,name:SYNC.name,pin:SYNC.pin});
    if(done.data&&done.data.ok){
      PROFILE.controls.skillMastery=done.data.skillMastery||PROFILE.controls.skillMastery;
      await refreshDaily();
      showMasteryDone(masteryCurrent.kind,done.data.result);
    }else{
      document.getElementById('masteryMsg').textContent='Almost done. Try again in a moment.';
    }
  }
  function showMasteryDone(kind,result){
    const b=document.getElementById('plcBody'), passed=result&&result.passed, review=kind==='review';
    b.innerHTML='<div class="plcGlyph">'+(passed?'â˜…':'âœ“')+'</div><div class="plcTitle">'+(review?'Review Complete':(passed?'Black Belt Certified':'Challenge Complete'))+'</div>'+
      '<div class="plcSub">'+(review?(passed?'That skill is staying sharp.':'That Black Belt stays earned. This skill will show up for extra review.'):passed?'You certified this skill as a Black Belt.':'Good work finishing the challenge. Practice a bit more and you can retry soon.')+'</div>'+
      '<div class="plcActions"><button class="plcBtn good" id="masteryDoneBtn">Back to Dojo</button></div>';
    document.getElementById('masteryDoneBtn').onclick=()=>{document.getElementById('placementOverlay').classList.remove('on');buildWorlds();renderHome();show('home')};
  }

  C.SKILLS.forEach(s=>{
    if(!GENS[s.id]) GENS[s.id]=()=>genSkill(s.id);
    if(!TOPICNAMES[s.id]) TOPICNAMES[s.id]=s.label;
    if(!TOPICCOLORS[s.id]) TOPICCOLORS[s.id]=['#ff5c8a','#ffb020','#22d3ee','#a78bfa','#4ade80','#60a5fa'][C.GRADE_INDEX[s.grade]||0];
  });

  const OLD_WORLD_IDS=['ops','machine','equation','fraction','factor','shape','multiply','angle','compare'];
  GENS.mix=(tier)=>GENS[pick(OLD_WORLD_IDS)](tier);

  const oldRecordSolve=recordSolve;
  recordSolve=function(topic,wrongs,tutors){
    oldRecordSolve(topic,wrongs,tutors);
    countDailyProblem('practice');
  };

  // Student login is now explicit: returning students cannot silently create an account.
  // New students use register_student and must choose a home grade.
  cloudLogin=async function(name,pin){
    try{
      const gradeEl=document.getElementById('gradeInp');
      const payload=signupMode
        ? {action:'register_student',name,pin,grade:gradeEl?gradeEl.value:'4'}
        : {action:'report',name,pin,localDate:localDate()};
      const r=await apiPost(payload);
      if(r.data&&r.data.ok){
        SYNC.name=name;SYNC.pin=pin;SYNC.online=true;applySave(r.data.data);
        PROFILE.accountType='student';PROFILE.controls=r.data.controls||PROFILE.controls;
        DAILY_STATUS=r.data.dailyStatus||DAILY_STATUS;DAILY_RECS=r.data.recommendations||DAILY_RECS;
        return {ok:true,created:signupMode||!!r.data.created};
      }
      let err=(r.data&&r.data.error)||'error';
      if(!signupMode&&err==='no_such_account') err='no_such_player';
      return {ok:false,error:err,status:r.status};
    }catch(e){
      // Local/offline play is still available, but cloud account creation requires the server.
      if(signupMode)return {ok:false,error:'offline_signup'};
      SYNC.name=name;SYNC.pin=pin;SYNC.online=false;
      return {ok:true,created:false,offline:true};
    }
  };

  // Grade-aware practice arena.
  const oldBuildWorlds=buildWorlds;
  function renderDailyPanel(){
    if(!D)return;
    const grid=document.getElementById('worldGrid'); if(!grid||!grid.parentNode)return;
    let panel=document.getElementById('dailyPanel');
    if(!panel){panel=document.createElement('div');panel.id='dailyPanel';panel.className='profile';panel.style.cssText='max-width:560px;display:block;margin-bottom:12px';grid.parentNode.insertBefore(panel,grid)}
    const st=DAILY_STATUS, recs=DAILY_RECS||(R?R.primaryAndAlternates({progress:S.progress},controls()):null);
    if(!st){panel.innerHTML='<div class="rank">Today&apos;s Goal</div><div class="lvlline">Loading your daily path...</div>';return;}
    const goal=st.goal||{}, prog=st.progress||{}, streak=st.streak||{}, value=goal.type==='minutes'?Math.floor((prog.activeSeconds||0)/60):(prog.problemsCompleted||0), target=Number(goal.target||1);
    const pct=Math.max(0,Math.min(100,Math.round(value/target*100)));
    const label=goal.type==='minutes'?value+' / '+target+' minutes':value+' / '+target+' problems';
    const status=st.vacation?'Streak paused for vacation':(!st.scheduled?'No goal scheduled today':(prog.completed?'Goal complete':'Keep going'));
    const primary=recs&&recs.primary;
    panel.innerHTML='<div class="rank">Today&apos;s Goal</div><div class="lvlline">'+label+' - '+status+'</div><div class="xpTrack"><div class="xpFill" style="width:'+pct+'%"></div></div>'+
      '<div class="lvlline">Streak: '+Number(streak.currentStreak||0)+' day'+(Number(streak.currentStreak||0)===1?'':'s')+' · Grace days: '+Number(streak.graceBalance||0)+'</div>'+
      (primary?'<div class="callout" style="margin-top:8px"><b>'+primary.badge+':</b> '+primary.skillLabel+'<br><span class="muted">'+primary.reason+'</span></div>':'');
  }
  buildWorlds=function(){
    const g=document.getElementById('worldGrid'); if(!g)return;
    const c=controls(),home=c.homeGrade||'4';
    if(home==='4' && !Object.keys(S.progress.mastery||{}).some(k=>k.includes('.'))){oldBuildWorlds();renderDailyPanel();return;}
    const recPack=R?R.primaryAndAlternates({progress:S.progress},c):null;
    DAILY_RECS=recPack||DAILY_RECS;
    const summary=masterySummary();
    const needs=M?M.needsReviewSet(c):{};
    const specialIds=new Set();
    const rec=(recPack&&recPack.recommendations||[]).map(r=>C.BY_ID[r.skillId]).filter(Boolean);
    g.innerHTML='';
    (summary.dueReviews||[]).slice(0,2).forEach(s=>{
      specialIds.add(s.skillId);
      const b=document.createElement('button');b.className='wcard';b.style.setProperty('--wc','#ffb020');
      b.innerHTML='<div class="wicon">*</div><div class="wname">'+s.skillLabel+'</div><div class="wdesc">'+(s.needsReview?'Needs Review':'Black Belt Review')+' - keep it sharp</div>';
      b.onclick=()=>startMasteryReview(s.skillId);g.appendChild(b);
    });
    (summary.eligibleChallenges||[]).slice(0,2).forEach(s=>{
      if(specialIds.has(s.skillId))return;
      specialIds.add(s.skillId);
      const b=document.createElement('button');b.className='wcard';b.style.setProperty('--wc','#7c83ff');
      b.innerHTML='<div class="wicon">BB</div><div class="wname">'+s.skillLabel+'</div><div class="wdesc">Black Belt Challenge Ready - short skill check</div>';
      b.onclick=()=>startMasteryChallenge(s.skillId);g.appendChild(b);
    });
    rec.forEach(s=>{
      if(specialIds.has(s.id))return;
      const b=document.createElement('button');b.className='wcard';b.style.setProperty('--wc',TOPICCOLORS[s.id]);
      const m=(S.progress.mastery||{})[s.id]||0,visual=C.visualSupport(s.id,m);
      b.innerHTML='<div class="wicon">'+(s.grade==='K'?'🌟':s.grade==='1'?'🥋':s.grade==='2'?'⚡':s.grade==='3'?'🧠':'🎯')+'</div><div class="wname">'+s.label+'</div><div class="wdesc">'+gradeLabel(s.grade)+' · '+visual+' visual support</div>';
      b.onclick=()=>{sClick();startRun({id:s.id,name:s.label,gen:()=>genSkill(s.id),color:TOPICCOLORS[s.id]})};g.appendChild(b);
    });
    if(!rec.length) oldBuildWorlds();
    renderDailyPanel();
  };

  beltPanelHTML=function(mastery,forKid){
    const topics=Object.keys(mastery||{}).filter(t=>(mastery[t]||0)>0);
    if(!topics.length)return '<div class="parEmpty">'+(forKid?'Answer questions to start earning belts! 🥋':'No belts earned yet.')+'</div>';
    topics.sort((a,b)=>(mastery[b]||0)-(mastery[a]||0));let html='';
    const sm=(controls().skillMastery&&controls().skillMastery.bySkill)||{};
    topics.slice(0,12).forEach(t=>{const v=mastery[t]||0,st=sm[t]||{},cert=!!st.certified,ready=!!st.challengeEligible,display=cert?100:Math.min(v,80),L=cert?BELTS[5]:masteryLevel(display);html+='<div class="beltRow"><div class="mTop"><span class="mName">'+(TOPICNAMES[t]||t)+'</span><span class="mLvl" style="color:'+L.color+'">'+(cert?'Black Belt':L.name)+(st.needsReview?' - Needs Review':ready?' - Challenge Ready':'')+'</span></div>'+beltLadder(display)+'</div>'});
    return html+'<div class="beltKey">Black Belt means certified by a mastery challenge. Review never removes certification.</div>';
  };

  // Phase 1 onboarding controls.
  const loginCard=document.querySelector('#login .loginCard');
  const nameField=document.getElementById('nameInp')&&document.getElementById('nameInp').closest('.field');
  const pinField=document.getElementById('pinInp')&&document.getElementById('pinInp').closest('.field');
  const loginNote=document.getElementById('loginNote');
  const loginBtn=document.getElementById('btnLogin');
  if(loginCard&&nameField&&!document.getElementById('accountRoleChooser')){
    const style=document.createElement('style');
    style.textContent='.nnRole{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin:8px 0 14px}.nnRole button,.nnMode button{border:1px solid #2c3577;background:#0d1340;border-radius:12px;padding:10px;color:#9aa3d8;font-weight:900}.nnRole button.on,.nnMode button.on{color:#f4f6ff;border-color:#ffb020;box-shadow:0 0 12px rgba(255,176,32,.22)}.nnMode{display:flex;gap:8px;width:100%;margin:0 0 10px}.nnMode button{flex:1;font-size:12px;padding:8px}.nnGradeNote{font-size:11px;color:#9aa3d8;font-weight:700;line-height:1.4;margin-top:4px}';
    document.head.appendChild(style);
    const role=document.createElement('div');role.id='accountRoleChooser';role.className='nnRole';role.innerHTML='<button type="button" class="on">🎮 Student</button><button type="button">👨‍👩‍👧 Parent</button>';
    nameField.before(role);
    role.children[1].onclick=()=>{location.href='/family.html'};

    const mode=document.createElement('div');mode.id='studentModeChooser';mode.className='nnMode';mode.innerHTML='<button type="button" class="on">Returning Student</button><button type="button">Create Student</button>';
    nameField.before(mode);

    const f=document.createElement('div');f.className='field';f.id='gradeField';f.style.display='none';f.innerHTML='<label for="gradeInp">Home grade</label><select class="inp" id="gradeInp"><option value="K">Kindergarten</option><option value="1">Grade 1</option><option value="2">Grade 2</option><option value="3">Grade 3</option><option value="4" selected>Grade 4</option><option value="5">Grade 5</option></select><div class="nnGradeNote">This sets where Number Ninja starts. Progress can unlock individual skills above grade level as prerequisites are mastered.</div>';
    pinField.after(f);

    function setSignup(on){
      signupMode=on;mode.children[0].classList.toggle('on',!on);mode.children[1].classList.toggle('on',on);f.style.display=on?'':'none';
      loginBtn.textContent=on?'🥷 CREATE & START':'⚡ LOG IN';
      loginNote.textContent=on?'Choose a globally unique student username, a 4-digit PIN, and the student’s current grade.':'Returning student? Enter the same username and PIN used before.';
      const err=document.getElementById('loginErr');if(err)err.classList.remove('on');
    }
    mode.children[0].onclick=()=>setSignup(false);
    mode.children[1].onclick=()=>setSignup(true);
    setSignup(false);
  }

  const oldParent=document.getElementById('btnParentMode');
  if(oldParent){const b=oldParent.cloneNode(true);b.textContent='👨‍👩‍👧 Parent account / family dashboard';b.onclick=()=>{location.href='/family.html'};oldParent.replaceWith(b)}

  const profile=document.querySelector('.profile');
  if(profile&&!document.getElementById('homeGradeBadge')){const d=document.createElement('div');d.id='homeGradeBadge';d.style.cssText='font-size:11px;font-weight:900;color:#22d3ee;border:1px solid #2c3577;border-radius:999px;padding:5px 9px;white-space:nowrap';profile.appendChild(d)}
  const oldRenderHome=renderHome;
  renderHome=function(){oldRenderHome();const e=document.getElementById('homeGradeBadge');if(e)e.textContent=gradeLabel(controls().homeGrade||'4');renderDailyPanel()};

  const oldEnterDojo=enterDojo;
  enterDojo=function(created,offline){
    oldEnterDojo(created,offline);
    refreshDaily();
    if(shouldOfferPlacement(created)) setTimeout(showPlacementOffer, created?2100:500);
  };

  // Improve Phase 1 login errors without rewriting the original screen.
  const originalLoginClick=loginBtn&&loginBtn.onclick;
  if(loginBtn){
    loginBtn.onclick=async()=>{
      await doLogin();
      const err=document.getElementById('loginErr');
      if(err&&err.classList.contains('on')){
        if(err.textContent.includes('Could not sign in')&&signupMode)err.textContent='Could not create that student. The username may already be taken, or the connection may be unavailable.';
        if(err.textContent.includes('Could not sign in')&&!signupMode)err.textContent='Could not find that student login. Check the username and PIN, or choose Create Student.';
      }
    };
  }

  if(typeof S!=='undefined'&&S.name&&SYNC&&SYNC.online){
    apiPost({action:'report',name:SYNC.name,pin:SYNC.pin,localDate:localDate()}).then(r=>{if(r.data&&r.data.ok){PROFILE.controls=r.data.controls||PROFILE.controls;DAILY_STATUS=r.data.dailyStatus||DAILY_STATUS;DAILY_RECS=r.data.recommendations||DAILY_RECS;buildWorlds();renderHome()}}).catch(()=>{});
  }
})();
