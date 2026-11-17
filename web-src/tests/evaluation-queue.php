<?php
require __DIR__.'/wp-stubs.php';
$wpdb=new TestDB();(new SC_Code_Public_REST())->register();$checks=0;
function ck($v,$m){global $checks;if(!$v)throw new Exception($m);$checks++;}
function ok($v){ck(!($v instanceof WP_Error),$v instanceof WP_Error?$v->message:'ok');return $v;}
function no($v,$status){ck($v instanceof WP_Error && $v->data['status']===$status,'Expected '.$status.' got '.json_encode($v));}
$e=ok(test_free_event(1,['title'=>'Professor queue']));$eid=$e['id'];
$c=ok(test_call('challenges',1,['event_id'=>$eid,'title'=>'Sum','statement'=>'Sum two integers','level'=>'hard','tests'=>[['input'=>'2 3','output'=>'5']]]))['challenges'][0];
$c2=ok(test_call('challenges',1,['event_id'=>$eid,'title'=>'Other','statement'=>'Sum','tests'=>[['input'=>'1 1','output'=>'2']]]))['challenges'][0];
$t=ok(test_call('teams',1,['event_id'=>$eid,'name'=>'Team']));$e=ok(test_call('event',1,['id'=>$eid,'version'=>$e['version']]));
foreach([2,4] as $uid){ok(test_call('events/join',$uid,['code'=>$e['data']['invite']]));ok(test_call('teams/join',$uid,['event_id'=>$eid,'team_id'=>$t['id']]));}
$a=ok(test_call('attempt',2,['challenge_id'=>$c['id'],'action'=>'start']));
$v=['challenge_id'=>$c['id'],'version'=>$a['version'],'action'=>'submit','code'=>'print(sum(map(int,input().split())))','language'=>'python'];
no(test_call('attempt',2,$v),400);ck(SC_Code_Public_Store::get($a['id'])['data']['status']==='working','No evidence preserves draft');
$v['results']=[['output'=>'5','exit_code'=>0,'engine'=>'fixture','infrastructure_error'=>true]];no(test_call('attempt',2,$v),400);
$v['results'][0]['infrastructure_error']=false;$v['_request_id']='queue-delivery-1234';
$a=ok(test_call('attempt',2,$v));ck($a===ok(test_call('attempt',2,$v)),'Lost delivery receipt');
ck($a['data']['assessment']['status']==='queued' && $a['data']['assessment']['evidence']['items'][0]['passed'],'Evidence and queue saved together');
ck(empty($GLOBALS['remote_calls']),'Student delivery never calls provider');
ok(test_call('attempt',2,['challenge_id'=>$c2['id'],'action'=>'start']));
no(test_call('evaluation/list',2,['event_id'=>$eid]),403);no(test_call('evaluation/prepare',2,['attempt_id'=>$a['id']]),403);
no(test_call('assessment',2,['attempt_id'=>$a['id'],'version'=>$a['version'],'action'=>'withdraw']),409);
no(test_call('ai/prepare',2,['mode'=>'assessment','challenge_id'=>$c['id'],'run_id'=>$a['data']['assessment']['run_id']]),403);
ok(test_call('ai/settings',1,['provider'=>'gemini','model'=>'gemini-fixture-flash','transport'=>'direct','key'=>'fake-teacher-secret']));
$q=ok(test_call('evaluation/list',1,['event_id'=>$eid]));ck(count($q['items'])===1&&$q['items'][0]['state']==='queued','Queue ready');
$p=ok(test_call('evaluation/prepare',1,['_request_id'=>'queue-claim-1234','attempt_id'=>$a['id']]));ck($p===ok(test_call('evaluation/prepare',1,['_request_id'=>'queue-claim-1234','attempt_id'=>$a['id']])),'Claim replay');
no(test_call('evaluation/prepare',1,['attempt_id'=>$a['id']]),409);
ck(ok(test_call('evaluation/list',1,['event_id'=>$eid]))['items'][0]['state']==='running','Reserved queue visible');
no(test_call('evaluation/release',2,['attempt_id'=>$a['id'],'run_id'=>$p['run_id']]),403);
no(test_call('ai/complete',2,['ticket'=>$p['ticket'],'raw'=>'{}']),409);
no(test_call('ai/complete',1,['ticket'=>$p['ticket'],'raw'=>'{}']),400);
ok(test_call('evaluation/release',1,['attempt_id'=>$a['id'],'run_id'=>$p['run_id'],'message'=>'Timeout']));
$a=SC_Code_Public_Store::get($a['id']);ck($a['data']['status']==='submitted'&&!isset($a['data']['grade'])&&$a['data']['assessment']['status']==='needs_attention','Failure preserves submitted code without grade');
ck(ok(test_call('evaluation/list',1,['event_id'=>$eid]))['items'][0]['state']==='retry','Backoff visible');
no(test_call('evaluation/prepare',1,['attempt_id'=>$a['id']]),409);
$d=$a['data'];$d['assessment']['retry_at']=time()-1;$a=SC_Code_Public_Store::save($a,$d,$a['version']);
$p2=ok(test_call('evaluation/prepare',1,['attempt_id'=>$a['id']]));
$raw='{"verdict":"approved","rubric_version":2,"reason":"","integrity":{"suspected":false,"reason":""}}';
no(test_call('ai/complete',1,['ticket'=>$p['ticket'],'round'=>0,'raw'=>$raw]),409);
// Expired reservation is reclaimable, its late completion cannot score.
$a=SC_Code_Public_Store::get($a['id']);$d=$a['data'];$d['assessment']['lease_until']=time()-1;$a=SC_Code_Public_Store::save($a,$d,$a['version']);
$p3=ok(test_call('evaluation/prepare',1,['attempt_id'=>$a['id']]));no(test_call('ai/complete',1,['ticket'=>$p2['ticket'],'round'=>0,'raw'=>$raw]),409);
$finish=['_request_id'=>'queue-finish-1234','ticket'=>$p3['ticket'],'round'=>0];
no(test_call('ai/complete',1,$finish+['raw'=>$raw]),409);
ck(ok(test_call('ai/request',1,['ticket'=>$p3['ticket'],'round'=>0]))===['ready'=>true],'Provider response stays in the job');
$finish['raw']='{"verdict":"revise","rubric_version":2}';
$r=ok(test_call('ai/complete',1,$finish));ck($r===ok(test_call('ai/complete',1,$finish)),'Completion receipt replay');
$credits=SC_Code_Public_Store::list('credit',$eid);ck(count($credits)===1&&$credits[0]['owner']===2&&$credits[0]['data']['points']===5,'Student receives single credit, not professor');
ck(count(SC_Code_Public_Store::list('boost',$eid))===1,'Single rocket boost');
no(test_call('evaluation/release',1,['attempt_id'=>$a['id'],'run_id'=>$p3['run_id'],'message'=>'Late error']),409);
ck(!ok(test_call('evaluation/list',1,['event_id'=>$eid]))['items'],'Completed leaves queue');
echo "Evaluation queue: $checks checks passed\n";
