import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const load=async name=>import('data:text/javascript;base64,'+Buffer.from(ts.transpile((await fs.readFile(new URL('../src/lib/'+name,import.meta.url),'utf8')), {module:ts.ModuleKind.ESNext})).toString('base64'));
const {deadlineWindow,crossedTimeCuts}=await load('event-time.ts');
test('Only a defined end enables time warnings; deadline assigned later uses server change baseline',()=>{
 const now=1000000;assert.equal(deadlineWindow({},now),null);
 const end=new Date(now+10000).toISOString();
 assert.deepEqual(deadlineWindow({ends_at:end,schedule_updated_at:1000,published_at:500},now+3000),{start:now,end:now+10000});
 assert.deepEqual(deadlineWindow({ends_at:end,starts_at:new Date(900000).toISOString(),schedule_updated_at:1000},now),{start:900000,end:now+10000});
 assert.deepEqual(deadlineWindow({ends_at:end,published_at:500},now),{start:500000,end:now+10000});
});
test('Warnings cross 50/25/10 percent once, with no late warning after end; changed deadline has new thresholds',()=>{
 assert.deepEqual(crossedTimeCuts(0,500,0,1000),[.5]);
 assert.deepEqual(crossedTimeCuts(500,750,0,1000),[.25]);
 assert.deepEqual(crossedTimeCuts(750,900,0,1000),[.1]);
 assert.deepEqual(crossedTimeCuts(900,901,0,1000),[]);
 assert.deepEqual(crossedTimeCuts(900,1000,0,1000),[]);
 assert.deepEqual(crossedTimeCuts(100,100,0,1000),[]);
 assert.deepEqual(crossedTimeCuts(100,950,0,1000),[.5,.25,.1]);
 assert.deepEqual(crossedTimeCuts(900,1100,0,2000),[.5]);
});
