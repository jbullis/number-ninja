/* Compatibility guard: curriculum skills use their world generator but do not live in
 * the legacy GENS table, because legacy Workbook Challenge levels intentionally draw
 * only from the original advanced generator pool.
 */
(function(){
  if(!window.NINJA_CURRICULUM || typeof GENS==='undefined') return;
  const C=window.NINJA_CURRICULUM;
  C.SKILLS.forEach(s=>{ if(Object.prototype.hasOwnProperty.call(GENS,s.id)) delete GENS[s.id]; });
  const legacyFresh=freshQuestion;
  freshQuestion=function(topic){
    if(C.BY_ID[topic] && S.world && S.world.id===topic && typeof S.world.gen==='function'){
      $('tipbar').classList.remove('on','trick');
      renderQuestion(S.world.gen(tierNow()));
      return;
    }
    legacyFresh(topic);
  };
})();
