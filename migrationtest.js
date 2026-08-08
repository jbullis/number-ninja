const { migratePlayerRecords, createCloudflareKvSource, MigrationConfigurationError } = require('./lib/kv-migration.js');

let fails=0;
function ck(v,m,x){if(!v){fails++;console.error('FAIL:',m,x||'')}}

function mapStore(seed){
  const store=new Map(Object.entries(seed||{}));
  return {
    store,
    writes:0,
    async listPlayerKeys(){return [...store.keys()].filter(k=>k.startsWith('player:'))},
    async get(k){return store.has(k)?store.get(k):null},
    async set(k,v){this.writes++;store.set(k,v)}
  };
}

(async()=>{
  const source=mapStore({
    'player:newkid':'{"pinHash":"a","data":{"level":1},"updated":1}',
    'player:samekid':'{"pinHash":"b","data":{"level":2},"updated":2}',
    'player:conflictkid':'{"pinHash":"c","data":{"level":3},"updated":3}',
    'other:key':'ignored'
  });
  const destination=mapStore({
    'player:samekid':'{"pinHash":"b","data":{"level":2},"updated":2}',
    'player:conflictkid':'{"pinHash":"DIFFERENT","data":{"level":99},"updated":99}'
  });
  let summary=await migratePlayerRecords(source,destination,{logger:{log(){},error(){}}});
  ck(summary.totalFound===3,'counts only player keys',JSON.stringify(summary));
  ck(summary.copied===1,'copies missing destination key',JSON.stringify(summary));
  ck(summary.alreadyIdentical===1,'skips identical destination key',JSON.stringify(summary));
  ck(summary.conflicts===1&&summary.conflictKeys[0]==='player:conflictkid','reports conflict without overwrite',JSON.stringify(summary));
  ck(destination.store.get('player:newkid')===source.store.get('player:newkid'),'preserves exact JSON value');
  ck(destination.store.get('player:conflictkid')==='{"pinHash":"DIFFERENT","data":{"level":99},"updated":99}','does not overwrite conflict');

  const dryDest=mapStore({});
  summary=await migratePlayerRecords(source,dryDest,{dryRun:true,logger:{log(){},error(){}}});
  ck(summary.copied===0&&summary.wouldCopy===3,'dry-run counts would-copy but copies none',JSON.stringify(summary));
  ck(dryDest.writes===0&&dryDest.store.size===0,'dry-run performs no writes');

  const badDest=mapStore({});
  let badDestWritten=false;
  badDest.get=async()=>badDestWritten?'not the copied value':null;
  badDest.set=async()=>{badDestWritten=true;badDest.writes++};
  summary=await migratePlayerRecords(mapStore({'player:newkid':'exact'}),badDest,{logger:{log(){},error(){}}});
  ck(summary.failures===1&&summary.failureKeys[0].error==='verification_failed','verification failure is reported',JSON.stringify(summary));

  try{
    createCloudflareKvSource({});
    ck(false,'missing Cloudflare env throws');
  }catch(e){
    ck(e instanceof MigrationConfigurationError,'missing Cloudflare env throws configuration error',e.name);
  }

  console.log(fails?fails+' MIGRATION TEST FAILURES':'ALL MIGRATION TESTS PASSED');
  process.exitCode=fails?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
