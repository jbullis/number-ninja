/* K-5 integration layer for the original single-file game.
 * Loaded after index.html by Pages middleware so the existing game remains untouched.
 */
(function(){
  'use strict';
  if(!window.NINJA_CURRICULUM) return;
  const C=window.NINJA_CURRICULUM;
  const PROFILE={controls:{homeGrade:'4',allowAboveGrade:true,audioInstructions:false,skillOverrides:{}},accountType:'student'};
  window.NINJA_PROFILE=PROFILE;

  function gradeLabel(g){return g==='K'?'Kindergarten':'Grade '+g}
  function controls(){return PROFILE.controls||{homeGrade:'4',allowAboveGrade:true,skillOverrides:{}}}
  function dots(n,emoji){emoji=emoji||'●';return '<div style="font-size:30px;line-height:1.5;letter-spacing:5px;max-width:420px;margin:auto">'+Array.from({length:n},()=>emoji).join(' ')+'</div>'}
  function q(topic,html,ans,alts,tip){return {topic,qHTML:html,choices:numChoices(ans,alts||[]),tip:tip||'Take your time and use what you already know.'}}
  function pickN(max,min){return ri(min==null?0:min,max)}
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

  // Register skill generators so tutorials/fresh-question logic can safely revisit them.
  C.SKILLS.forEach(s=>{
    if(!GENS[s.id]) GENS[s.id]=()=>genSkill(s.id);
    if(!TOPICNAMES[s.id]) TOPICNAMES[s.id]=s.label;
    if(!TOPICCOLORS[s.id]) TOPICCOLORS[s.id]=['#ff5c8a','#ffb020','#22d3ee','#a78bfa','#4ade80','#60a5fa'][C.GRADE_INDEX[s.grade]||0];
  });

  // Keep old Mega Mix from accidentally choosing the newly registered skill graph.
  const OLD_WORLD_IDS=['ops','machine','equation','fraction','factor','shape','multiply','angle','compare'];
  GENS.mix=(tier)=>GENS[pick(OLD_WORLD_IDS)](tier);

  // Capture grade/parent-owned controls from login while preserving legacy student signup.
  const oldCloudLogin=cloudLogin;
  cloudLogin=async function(name,pin){
    try{
      const gradeEl=document.getElementById('gradeInp');
      const r=await apiPost({action:'login',name,pin,grade:gradeEl?gradeEl.value:'4'});
      if(r.data&&r.data.ok){
        if(r.data.accountType==='parent') return {ok:false,error:'parent_account'};
        SYNC.name=name;SYNC.pin=pin;SYNC.online=true;applySave(r.data.data);
        PROFILE.accountType='student';PROFILE.controls=r.data.controls||PROFILE.controls;
        return {ok:true,created:r.data.created};
      }
      return {ok:false,error:(r.data&&r.data.error)||'error',status:r.status};
    }catch(e){return oldCloudLogin(name,pin)}
  };

  // Grade-aware practice arena: show unlocked skill recommendations instead of one fixed difficulty ladder.
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

  // Make the belt strip understand curriculum skill ids as well as legacy topics.
  beltPanelHTML=function(mastery,forKid){
    const topics=Object.keys(mastery||{}).filter(t=>(mastery[t]||0)>0);
    if(!topics.length)return '<div class="parEmpty">'+(forKid?'Answer questions to start earning belts! 🥋':'No belts earned yet.')+'</div>';
    topics.sort((a,b)=>(mastery[b]||0)-(mastery[a]||0));let html='';
    topics.slice(0,12).forEach(t=>{const v=mastery[t]||0,L=masteryLevel(v);html+='<div class="beltRow"><div class="mTop"><span class="mName">'+(TOPICNAMES[t]||t)+'</span><span class="mLvl" style="color:'+L.color+'">'+L.name+'</span></div>'+beltLadder(v)+'</div>'});
    return html+'<div class="beltKey">Belts show mastery of each skill, not grade level.</div>';
  };

  // Inject grade choice for first-time standalone students.
  const pinField=document.getElementById('pinInp')&&document.getElementById('pinInp').closest('.field');
  if(pinField&&!document.getElementById('gradeInp')){
    const f=document.createElement('div');f.className='field';f.innerHTML='<label for="gradeInp">Home grade (used when creating a new student)</label><select class="inp" id="gradeInp"><option value="K">Kindergarten</option><option value="1">Grade 1</option><option value="2">Grade 2</option><option value="3">Grade 3</option><option value="4" selected>Grade 4</option><option value="5">Grade 5</option></select>';
    pinField.after(f);
  }

  // Parent controls now live only in the dedicated parent account dashboard.
  const oldParent=document.getElementById('btnParentMode');
  if(oldParent){const b=oldParent.cloneNode(true);b.textContent='Parent account / family dashboard';b.onclick=()=>{location.href='/family.html'};oldParent.replaceWith(b)}

  // Home-grade indicator.
  const profile=document.querySelector('.profile');
  if(profile&&!document.getElementById('homeGradeBadge')){const d=document.createElement('div');d.id='homeGradeBadge';d.style.cssText='font-size:11px;font-weight:900;color:#22d3ee;border:1px solid #2c3577;border-radius:999px;padding:5px 9px;white-space:nowrap';profile.appendChild(d)}
  const oldRenderHome=renderHome;
  renderHome=function(){oldRenderHome();const e=document.getElementById('homeGradeBadge');if(e)e.textContent=gradeLabel(controls().homeGrade||'4')};

  // If Remember Me logged in before this script loaded, fetch controls and redraw.
  if(typeof S!=='undefined'&&S.name&&SYNC&&SYNC.online){
    apiPost({action:'report',name:SYNC.name,pin:SYNC.pin}).then(r=>{if(r.data&&r.data.ok){PROFILE.controls=r.data.controls||PROFILE.controls;buildWorlds();renderHome()}}).catch(()=>{});
  }
})();
