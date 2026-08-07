const C = require('./js/curriculum.js');
let fails=0;
function ck(v,m){if(!v){fails++;console.error('FAIL:',m)}}

ck(C.GRADES.join(',')==='K,1,2,3,4,5','K-5 grade order');
ck(C.SKILLS.length>=70,'broad K-5 skill catalog');
ck(new Set(C.SKILLS.map(s=>s.id)).size===C.SKILLS.length,'skill ids unique');
for(const s of C.SKILLS){
  ck(C.GRADES.includes(s.grade),'valid grade '+s.id);
  ck(s.label && s.group,'label/group '+s.id);
  ck(Number.isInteger(s.evidence) && s.evidence>0,'evidence '+s.id);
  for(const p of s.prereqs) ck(!!C.BY_ID[p],'prerequisite exists '+s.id+' -> '+p);
}

// Kindergarten starts accessible and visual.
ck(C.skillState('k.count100',{}, {}, {homeGrade:'K',allowAboveGrade:true}).state==='unlocked','K counting unlocked');
ck(C.visualSupport('k.count100',90)==='high','K visuals remain high');

// Grade 1 visual support fades automatically with mastery.
ck(C.visualSupport('1.addSub20',10)==='high','early grade 1 high visual');
ck(C.visualSupport('1.addSub20',50)==='medium','mid grade 1 medium visual');
ck(C.visualSupport('1.addSub20',85)==='low','mastered grade 1 fades visual');

// Above-grade content is prerequisite-driven, not whole-grade driven.
const masteredK={'k.addSub10':90};
ck(C.skillState('1.addSub20',masteredK,{}, {homeGrade:'K',allowAboveGrade:true}).state==='unlocked','above-grade unlock after prereq');
ck(C.skillState('1.addSub20',masteredK,{}, {homeGrade:'K',allowAboveGrade:false}).state==='locked','parent can disable above-grade unlocking');

// Parent overrides win.
ck(C.skillState('5.logic',{}, {'5.logic':'unlocked'}, {homeGrade:'K',allowAboveGrade:false}).state==='unlocked','parent unlock override');
ck(C.skillState('k.count100',{}, {'k.count100':'locked'}, {homeGrade:'K',allowAboveGrade:true}).state==='locked','parent lock override');

// Placement samples one grade below/home/one above when available.
ck(C.placementBands('K').join(',')==='K,1','K placement band');
ck(C.placementBands('3').join(',')==='2,3,4','grade 3 placement band');
ck(C.placementBands('5').join(',')==='4,5','grade 5 placement band');

console.log(fails?fails+' CURRICULUM TEST FAILURES':'ALL CURRICULUM TESTS PASSED');
process.exitCode=fails?1:0;
