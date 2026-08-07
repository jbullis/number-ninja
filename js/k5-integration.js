/* K-5 integration layer for the original single-file game.
 * Loaded after index.html by Pages middleware so the existing game remains untouched.
 */
(function(){
  'use strict';
  if(!window.NINJA_CURRICULUM) return;
  const C=window.NINJA_CURRICULUM;
  const PROFILE={controls:{homeGrade:'4',allowAboveGrade:true,audioInstructions:false,skillOverrides:{}},accountType:'student'};
  window.NINJA_PROFILE=PROFILE;
  let signupMode=false;

  function gradeLabel(g){return g==='K'?'Kindergarten':'Grade '+g}
  function controls(){return PROFILE.controls||{homeGrade:'4',allowAboveGrade:true,skillOverrides:{}}}
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

  C.SKILLS.forEach(s=>{
    if(!GENS[s.id]) GENS[s.id]=()=>genSkill(s.id);
    if(!TOPICNAMES[s.id]) TOPICNAMES[s.id]=s.label;
    if(!TOPICCOLORS[s.id]) TOPICCOLORS[s.id]=['#ff5c8a','#ffb020','#22d3ee','#a78bfa','#4ade80','#60a5fa'][C.GRADE_INDEX[s.grade]||0];
  });

  const OLD_WORLD_IDS=['ops','machine','equation','fraction','factor','shape','multiply','angle','compare'];
  GENS.mix=(tier)=>GENS[pick(OLD_WORLD_IDS)](tier);

  // Student login is now explicit: returning students cannot silently create an account.
  // New students use register_student and must choose a home grade.
  cloudLogin=async function(name,pin){
    try{
      const gradeEl=document.getElementById('gradeInp');
      const payload=signupMode
        ? {action:'register_student',name,pin,grade:gradeEl?gradeEl.value:'4'}
        : {action:'report',name,pin};
      const r=await apiPost(payload);
      if(r.data&&r.data.ok){
        SYNC.name=name;SYNC.pin=pin;SYNC.online=true;applySave(r.data.data);
        PROFILE.accountType='student';PROFILE.controls=r.data.controls||PROFILE.controls;
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
  buildWorlds=function(){
    const g=document.getElementById('worldGrid'); if(!g)return;
    const c=controls(),home=c.homeGrade||'4';
    if(home==='4' && !Object.keys(S.progress.mastery||{}).some(k=>k.includes('.'))){oldBuildWorlds();return;}
    const rec=C.nextRecommendations(S.progress.mastery||{},c.skillOverrides||{},c,8);
    g.innerHTML='';
    rec.forEach(s=>{
      const b=document.createElement('button');b.className='wcard';b.style.setProperty('--wc',TOPICCOLORS[s.id]);
      const m=(S.progress.mastery||{})[s.id]||0,visual=C.visualSupport(s.id,m);
      b.innerHTML='<div class="wicon">'+(s.grade==='K'?'🌟':s.grade==='1'?'🥋':s.grade==='2'?'⚡':s.grade==='3'?'🧠':'🎯')+'</div><div class="wname">'+s.label+'</div><div class="wdesc">'+gradeLabel(s.grade)+' · '+visual+' visual support</div>';
      b.onclick=()=>{sClick();startRun({id:s.id,name:s.label,gen:()=>genSkill(s.id),color:TOPICCOLORS[s.id]})};g.appendChild(b);
    });
    if(!rec.length) oldBuildWorlds();
  };

  beltPanelHTML=function(mastery,forKid){
    const topics=Object.keys(mastery||{}).filter(t=>(mastery[t]||0)>0);
    if(!topics.length)return '<div class="parEmpty">'+(forKid?'Answer questions to start earning belts! 🥋':'No belts earned yet.')+'</div>';
    topics.sort((a,b)=>(mastery[b]||0)-(mastery[a]||0));let html='';
    topics.slice(0,12).forEach(t=>{const v=mastery[t]||0,L=masteryLevel(v);html+='<div class="beltRow"><div class="mTop"><span class="mName">'+(TOPICNAMES[t]||t)+'</span><span class="mLvl" style="color:'+L.color+'">'+L.name+'</span></div>'+beltLadder(v)+'</div>'});
    return html+'<div class="beltKey">Belts show mastery of each skill, not grade level.</div>';
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
  renderHome=function(){oldRenderHome();const e=document.getElementById('homeGradeBadge');if(e)e.textContent=gradeLabel(controls().homeGrade||'4')};

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
    apiPost({action:'report',name:SYNC.name,pin:SYNC.pin}).then(r=>{if(r.data&&r.data.ok){PROFILE.controls=r.data.controls||PROFILE.controls;buildWorlds();renderHome()}}).catch(()=>{});
  }
})();
