const { createStore, createUpstashStore, StorageConfigurationError } = require('./lib/storage.js');

let fails=0;
function ck(v,m,x){if(!v){fails++;console.error('FAIL:',m,x||'')}}

(async()=>{
  try {
    createStore({});
    ck(false,'missing Upstash env throws');
  } catch (e) {
    ck(e instanceof StorageConfigurationError,'missing Upstash env throws configuration error',e.name);
  }

  const calls=[];
  const oldFetch=global.fetch;
  global.fetch=async (url,opts)=>{
    calls.push({url,opts,body:JSON.parse(opts.body)});
    const cmd=calls[calls.length-1].body[0];
    const result=cmd==='GET'?'value':cmd==='SCAN'?['0',['player:a','player:b']]:1;
    return {ok:true,json:async()=>({result})};
  };
  try{
    const store=createUpstashStore({UPSTASH_REDIS_REST_URL:'https://redis.example/',UPSTASH_REDIS_REST_TOKEN:'token'});
    ck(await store.get('player:a')==='value','get returns value');
    await store.set('player:a','{}');
    await store.delete('player:a');
    const listed=await store.list('player:','0');
    ck(listed.complete&&listed.keys.length===2,'list maps SCAN result',JSON.stringify(listed));
    ck(calls[0].url==='https://redis.example','trims REST URL slash');
    ck(calls.every(c=>c.opts.headers.authorization==='Bearer token'),'sends bearer token');
    ck(JSON.stringify(calls.map(c=>c.body))===JSON.stringify([
      ['GET','player:a'],
      ['SET','player:a','{}'],
      ['DEL','player:a'],
      ['SCAN','0','MATCH','player:*','COUNT','100']
    ]),'commands use expected Upstash REST payload',JSON.stringify(calls.map(c=>c.body)));
  } finally {
    global.fetch=oldFetch;
  }

  console.log(fails?fails+' STORAGE TEST FAILURES':'ALL STORAGE TESTS PASSED');
  process.exitCode=fails?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
