import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/lib/draft-gate.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {flushPendingDraft}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('Navigation awaits an in-flight write then saves the newer edit and language before leaving',async()=>{
 let release;const waiting=new Promise(resolve=>release=resolve);let saves=0;
 const state={saved:{code:'old',language:'python',status:'working'},code:'newest',language:'javascript',flight:waiting};
 const run=flushPendingDraft(()=>state,async()=>{saves++;state.saved={code:state.code,language:state.language,status:'working'};});
 assert.equal(saves,0);state.saved.code='intermediate';state.flight=null;release();await run;
 assert.equal(saves,1);assert.equal(state.saved.code,'newest');assert.equal(state.saved.language,'javascript');
});
test('A failed save refuses departure, preserves code and can be retried without discarding',async()=>{
 const state={saved:{code:'saved',language:'python',status:'working'},code:'unsaved',language:'python',flight:null};let left=false;
 await assert.rejects(async()=>{await flushPendingDraft(()=>state,async()=>{throw Error('offline');});left=true;},/offline/);
 assert.equal(left,false);assert.equal(state.code,'unsaved');assert.equal(state.saved.code,'saved');
 await flushPendingDraft(()=>state,async()=>{state.saved.code=state.code;});assert.equal(state.saved.code,'unsaved');
});
test('An edit arriving during a save is flushed again; frozen deliveries never get rewritten',async()=>{
 const state={saved:{code:'a',language:'python',status:'working'},code:'b',language:'python',flight:null};let writes=0;
 await flushPendingDraft(()=>state,async()=>{writes++;const sent=state.code;state.saved.code=sent;if(writes===1)state.code='c';});
 assert.equal(writes,2);assert.equal(state.saved.code,'c');state.saved.status='validated';state.code='other';
 await flushPendingDraft(()=>state,async()=>assert.fail('Frozen answer must not be overwritten'));
});
