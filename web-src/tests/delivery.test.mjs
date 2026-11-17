import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real delivery + API retry modules together. Faults are injected
// at the HTTP boundary, separately before mutation and after a durable receipt.
function setup(origin='https://school.example'){
 const cache={},receipts=new Map(),calls=[];let commits=0,mode='normal';
 const original={id:'attempt',version:4,data:{challenge_id:'challenge',status:'working',code:'print(2)',language:'python'}};
 let canonical=structuredClone(original);
 const fetch=async(url,options)=>{
  assert.equal(options.headers['X-WP-Nonce'],'fixture-nonce');
  const p=options.body?JSON.parse(options.body):{},route=url.split('/v1/')[1].split('?')[0];calls.push({...p,route});
  const response=body=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(body)});
  if(route==='health')return response({retry_receipts:1});
  if(mode==='offline' || mode==='before-commit' && p.action==='submit')throw Error('network');
  if(route==='attempt/read'){assert.equal(options.method,'GET');assert.ok(url.includes('id=attempt'));return response(canonical);}
  if(mode==='forbidden')return {ok:false,status:403,headers:{get:()=>null},text:async()=>JSON.stringify({code:'sc_code_error',message:'Acesso negado.'})};
  if(mode==='edge-forbidden')return {ok:false,status:403,headers:{get:()=>null},text:async()=>'<h1>403</h1>'};
  if(!receipts.has(p._request_id)){
   canonical={...canonical,version:5,data:{...canonical.data,code:p.code,language:p.language,status:'submitted',submitted_at:123}};
   receipts.set(p._request_id,{body:JSON.stringify(p),result:structuredClone(canonical)});commits++;
  }
  assert.equal(receipts.get(p._request_id).body,JSON.stringify(p),'manual and automatic retries must freeze all evidence');
  if(mode==='after-commit')throw Error('response lost');
  if(mode==='invalid-receipt')return response({ok:true});
  return response(receipts.get(p._request_id).result);
 };
 function load(name){
  if(cache[name])return cache[name];const exports={};cache[name]=exports;
  const require=n=>n==='expo-constants'?{default:{expoConfig:{extra:{}}}}:n==='./poll'?{beginRequest(){},endRequest(){},deferRefresh(){}}:n==='./request-url'?{requestUrl:u=>u}:n==='./retry'?{receiptRoutes:new Set(['attempt']),readRoutes:new Set(),transient:s=>[0,408,429].includes(s)||s>=500,retryDelay:()=>0,waitRetry:async()=>{},retryWaiting(){}}:load(n.slice(2));
  const source=fs.readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,fetch,URL,URLSearchParams,window:{location:{origin}},
    SC_CODE_PUBLIC:{restUrl:origin+'/campus/wp-json/sc-code-public/v1/',nonce:'fixture-nonce'},
    AbortController,setTimeout,clearTimeout,Math,Date,JSON,Error,Set});return exports;
 }
 const delivery=load('delivery');return {...delivery,...load('api'),original,calls,commits:()=>commits,mode:m=>mode=m,canonical:()=>canonical,setCanonical:a=>canonical=a};
}
test('all four submission responses lost after COMMIT recover the exact canonical submission without a second commit',async()=>{
 const s=setup(),d=s.deliveryFor(s.original,'print(2)','python',[{output:'2',exit_code:0,engine:'browser'}]);s.mode('after-commit');
 const result=await s.sendDelivery('account-token',d);assert.equal(result.data.status,'submitted');assert.equal(s.commits(),1);
 assert.equal(s.calls.filter(p=>p.action==='submit').length,4);assert.equal(s.calls.filter(p=>p.route==='attempt/read').length,1);
});
test('extended outage retains one operation; manual recovery replays it without reexecuting or changing evidence',async()=>{
 const s=setup(),d=s.deliveryFor(s.original,'print(2)','python',[{output:'2',exit_code:0,engine:'browser'}]);s.mode('offline');
 await assert.rejects(s.sendDelivery('t',d),s.DeliveryUnconfirmed);assert.equal(s.commits(),0);
 const restored=JSON.parse(JSON.stringify(d));s.mode('normal');await s.sendDelivery('t',restored);await s.sendDelivery('t',restored);assert.equal(s.commits(),1);
});
test('request failure before mutation never fabricates a saved delivery; a later retry succeeds',async()=>{
 const s=setup(),d=s.deliveryFor(s.original,'print(2)','python');s.mode('before-commit');await assert.rejects(s.sendDelivery('t',d),s.DeliveryUnconfirmed);assert.equal(s.canonical().data.status,'working');s.mode('normal');await s.sendDelivery('t',d);assert.equal(s.commits(),1);
});
test('successful HTTP with an invalid receipt is reconciled against canonical state, never treated as proof by itself',async()=>{
 const s=setup(),d=s.deliveryFor(s.original,'print(2)','python');s.mode('invalid-receipt');assert.equal((await s.sendDelivery('t',d)).data.status,'submitted');assert.equal(s.commits(),1);
});
test('permanent permission errors remain visible and do not replay writes or grant points',async()=>{
 const s=setup(),d=s.deliveryFor(s.original,'print(2)','python');s.mode('forbidden');await assert.rejects(s.sendDelivery('t',d),/Acesso negado/);assert.equal(s.commits(),0);assert.equal(s.calls.filter(p=>p.action==='submit').length,1);
});
test('generic firewall denial does not discard a frozen delivery',async()=>{
 const s=setup(),d=s.deliveryFor(s.original,'print(2)','python');s.mode('edge-forbidden');
 await assert.rejects(s.sendDelivery('t',d),s.DeliveryUnconfirmed);
 assert.equal(s.commits(),0);assert.equal(s.calls.filter(p=>p.action==='submit').length,1);
});
test('confirmation rejects different code, language, challenge, attempt, revision and unsubmitted state',()=>{
 const s=setup(),d=s.deliveryFor(s.original,'print(2)','python');const a={...s.original,version:5,data:{...s.original.data,status:'submitted',submitted_at:123}};
 assert.equal(s.deliveryConfirmed(d,a),true);for(const change of [{id:'other'},{version:4},{data:{...a.data,code:'other'}},{data:{...a.data,language:'c'}},{data:{...a.data,challenge_id:'other'}},{data:{...a.data,status:'working'}},{data:{...a.data,submitted_at:undefined}}])assert.equal(s.deliveryConfirmed(d,{...a,...change}),false);
 for(const status of ['validated','revise'])assert.equal(s.deliveryConfirmed(d,{...a,data:{...a.data,status}}),true);
});

test('plain WordPress permalinks preserve REST route and request parameters', () => {
 const s=setup();
 const url=s.endpoint('https://school.example/campus/index.php?rest_route=/sc-code-public/v1/', 'event?id=fixture');
 assert.equal(url.pathname,'/campus/index.php');
 assert.equal(url.searchParams.get('rest_route'),'/sc-code-public/v1/event');
 assert.equal(url.searchParams.get('id'),'fixture');
});
test('credentials are rejected before any HTTP request on an insecure site', async () => {
 const s=setup('http://school.example');
 await assert.rejects(s.api('ai/settings','fixture-nonce',{key:'synthetic-secret'}),/HTTPS/);
 await assert.rejects(s.api('account/delete','fixture-nonce',{password:'fixture-password'}),/HTTPS/);
 assert.equal(s.calls.length,0);
});
