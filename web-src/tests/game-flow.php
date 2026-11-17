<?php
require __DIR__.'/wp-stubs.php';
$wpdb=new TestDB();(new SC_Code_Public_REST())->register();$checks=0;
function check($c,$message) {global $checks;if(!$c)throw new RuntimeException($message);$checks++;}
function ok($v){check(!($v instanceof WP_Error),$v instanceof WP_Error?$v->message:'ok');return $v;}
function denied($v,$status){check($v instanceof WP_Error && $v->data['status']===$status,'Expected '.$status.' got '.json_encode($v));}
function fresh($a){return SC_Code_Public_Store::get($a['id']);}
function submit($a){return ok(test_legacy_submit($a['owner'],['challenge_id'=>$a['data']['challenge_id'],'version'=>$a['version'],'action'=>'submit','code'=>'print(5)','language'=>'python']));}
function evidence($a,$output='5'){return ok(test_call('assessment',$a['owner'],['attempt_id'=>$a['id'],'version'=>$a['version'],'run_id'=>$a['data']['assessment']['run_id'],'action'=>'evidence','results'=>[['output'=>$output,'exit_code'=>0,'engine'=>'browser-python','passed'=>true]]]));}
function prepare($a){return ok(test_call('ai/prepare',$a['owner'],['mode'=>'assessment','challenge_id'=>$a['data']['challenge_id'],'run_id'=>$a['data']['assessment']['run_id']]));}
function judge($prepared,$uid=2){
    $args=['ticket'=>$prepared['ticket'],'round'=>0];
    $response=test_call('ai/request',$uid,$args);
    if($response instanceof WP_Error)return $response;
    if(empty($response['ready']))return new WP_Error('test','Provider job incomplete',['status'=>409]);
    return test_call('ai/complete',$uid,$args);
}
$e=ok(test_free_event(1,['title'=>'Corrida']));$eid=$e['id'];
check($e['data']['points']===['easy'=>1,'medium'=>3,'hard'=>5] && $e['data']['validation']==='ai_local','Default event contract');
$c=ok(test_call('challenges',1,['event_id'=>$eid,'title'=>'Soma','statement'=>'Some dois números','level'=>'hard','tests'=>[['input'=>'2 3','output'=>'5']]]))['challenges'][0];$cid=$c['id'];
denied(test_call('event',1,['id'=>$eid,'version'=>$e['version']]),400);
$t=ok(test_call('teams',1,['event_id'=>$eid,'name'=>'Aurora']));$t2=ok(test_call('teams',1,['event_id'=>$eid,'name'=>'Órbita']));
denied(test_call('teams',2,['event_id'=>$eid,'name'=>'Inválida']),403);
denied(test_call('teams',1,['event_id'=>$eid,'name'=>'aurora']),400);
$e=ok(test_call('event',1,['id'=>$eid,'version'=>$e['version']]));
foreach([2,4] as $uid)ok(test_call('events/join',$uid,['code'=>$e['data']['invite']]));
denied(test_call('attempt',2,['challenge_id'=>$cid,'action'=>'start']),409);
foreach([2,4] as $uid)ok(test_call('teams/join',$uid,['event_id'=>$eid,'team_id'=>$t['id']]));
$a=ok(test_call('attempt',2,['challenge_id'=>$cid,'action'=>'start']));
denied(test_call('attempt',4,['challenge_id'=>$cid,'action'=>'start']),409);
$view=ok(test_call('event',4,[],'GET',['id'=>$eid]));check($view['claims'][0]['data']['name']==='Ana' && !$view['attempts'],'Teammate visible without code');
denied(test_call('teams/join',2,['event_id'=>$eid,'team_id'=>$t2['id']]),409);
$wpdb->fail='DELETE';denied(test_call('attempt',2,['challenge_id'=>$cid,'version'=>$a['version'],'action'=>'pass','code'=>'preserve']),503);
check(fresh($a)['data']['status']==='working' && fresh($a)['data']['code']==='' && count(SC_Code_Public_Store::list('claim',$eid))===1,'Pass rollback preserves reservation and code');
$a=ok(test_call('attempt',2,['challenge_id'=>$cid,'version'=>$a['version'],'action'=>'pass','code'=>'preserve']));
check($a['data']['status']==='paused' && !$wpdb->last_error,'Pass paused');
$b=ok(test_call('attempt',4,['challenge_id'=>$cid,'action'=>'start']));
denied(test_call('attempt',2,['challenge_id'=>$cid,'version'=>$a['version'],'action'=>'save','code'=>'late']),409);
$claim=SC_Code_Public_Store::list('claim',$eid)[0];
ok(test_call('claims/release',1,['event_id'=>$eid,'claim_id'=>$claim['id'],'confirmation'=>$claim['id']]));
$a=ok(test_call('attempt',2,['challenge_id'=>$cid,'action'=>'start']));check($a['data']['code']==='preserve','Paused draft restored');
$wpdb->fail='INSERT';denied(test_legacy_submit(2,['challenge_id'=>$cid,'version'=>$a['version'],'action'=>'submit','code'=>'print(5)','language'=>'python']),503);
check(fresh($a)['data']['status']==='working' && !SC_Code_Public_Store::list('race_mark',$eid),'Failure to create historical marker rolls back submission');
$a=submit($a);
$pendingRank=ok(test_call('ranking',2,[],'GET',['event_id'=>$eid,'include_marks'=>'1']));$firstMark=$pendingRank['marks'][0];check($firstMark['type']==='submission' && $firstMark['anchor']===0 && $firstMark['possible']===5 && $firstMark['awarded']===0 && $firstMark['status']==='submitted','Submission creates a fixed pending marker with possible points');
denied(test_call('assessment',4,['attempt_id'=>$a['id'],'version'=>$a['version'],'action'=>'resume']),403);
$a=evidence($a,'wrong');check($a['data']['results']['items'][0]['passed']===false,'Server recomputes comparison instead of trusting passed');
ok(test_call('ai/settings',2,['provider'=>'nvidia','model'=>'fixture-model','transport'=>'direct','key'=>'fake-student-key-1234']));
$r=ok(judge(prepare($a)));$a=$r['attempt'];
check($a['data']['status']==='rejected' && (float)$a['data']['grade']===0.0,'Binary rejection overrides model approval when tests fail');
check(!str_contains(json_encode($a),'NUNCA EXIBIR'),'No free model text');
check(!SC_Code_Public_Store::list('credit',$eid),'No points for failed tests');
$failRank=ok(test_call('ranking',2,[],'GET',['event_id'=>$eid,'include_marks'=>'1']));check($failRank['marks'][0]['status']==='rejected' && $failRank['marks'][0]['awarded']===0 && $failRank['marks'][0]['anchor']===0,'Rejected submission retains its anchor and grants no points');
denied(test_call('attempt',2,['challenge_id'=>$cid,'version'=>$a['version'],'action'=>'reopen']),409);
$a=ok(test_call('review',1,['attempt_id'=>$a['id'],'version'=>$a['version'],'decision'=>'revise','feedback'=>'Pode tentar novamente']));check($a['data']['status']==='revise','Only teacher returns rejected submission');
$a=ok(test_call('attempt',2,['challenge_id'=>$cid,'version'=>$a['version'],'action'=>'reopen']));$a=submit($a);$a=evidence($a);
$p=prepare($a);
ok(test_call('ai/request',2,['ticket'=>$p['ticket'],'round'=>0]));
foreach(['INSERT','UPDATE','COMMIT'] as $failure){$wpdb->fail=$failure;$res=judge($p);check($res instanceof WP_Error,'Failure '.$failure.' reaches UI');check(fresh($a)['data']['status']==='submitted' && !SC_Code_Public_Store::list('boost',$eid) && !SC_Code_Public_Store::list('credit',$eid),'All score effects roll back '.$failure);}
$a=ok(judge($p))['attempt'];check($a['data']['status']==='validated','Initial AI approval without teacher');
denied(judge($p),409);
$rank=ok(test_call('ranking',2,[],'GET',['event_id'=>$eid,'include_marks'=>'1']));check($rank['rows'][0]['points']===5 && $rank['teams'][0]['points']===5 && $rank['cursor']===1,'Single team and individual credit');
$approvedMark=array_values(array_filter($rank['marks'],fn($m)=>$m['status']==='validated'))[0];check($approvedMark['awarded']===5 && $approvedMark['anchor']===0 && $approvedMark['number']===1,'Approved submission earns points without moving original marker');
denied(test_call('attempt',4,['challenge_id'=>$cid,'action'=>'start']),409);
denied(test_call('review',1,['attempt_id'=>$a['id'],'version'=>$a['version'],'decision'=>'approve','grade'=>9,'feedback'=>'']),400);
$original=$a['data']['assessment']['original'];
$a=ok(test_call('review',1,['attempt_id'=>$a['id'],'version'=>$a['version'],'decision'=>'approve','grade'=>9,'feedback'=>'Ajuste de clareza']));
check((float)$a['data']['grade']===10.0 && $a['data']['assessment']['original']===$original,'Original AI review preserved');
check(count(SC_Code_Public_Store::list('boost',$eid))===1,'Grade-only revision no boost');
$a=ok(test_call('review',1,['attempt_id'=>$a['id'],'version'=>$a['version'],'decision'=>'revise','grade'=>3,'feedback'=>'Condição esquecida']));
$rank=ok(test_call('ranking',2,[],'GET',['event_id'=>$eid,'include_marks'=>'1']));check($rank['teams'][0]['points']===0 && $rank['cursor']===2,'Revoke removes points and records negative impulse');
$revised=array_values(array_filter($rank['marks'],fn($m)=>$m['id']===$approvedMark['id']))[0];check($revised['anchor']===$approvedMark['anchor'] && $revised['awarded']===0 && $revised['status']==='revise','Teacher review updates value without moving the marker');
$a=ok(test_call('review',1,['attempt_id'=>$a['id'],'version'=>$a['version'],'decision'=>'approve','grade'=>8,'feedback'=>'Revisão do critério']));
$rank=ok(test_call('ranking',2,[],'GET',['event_id'=>$eid,'include_marks'=>'1']));check($rank['teams'][0]['points']===5 && $rank['cursor']===3 && count($a['data']['assessment']['history'])===3,'Restoration no double score');
// Same challenge remains available to a different team.
denied(test_call('teams/join',3,['event_id'=>$eid,'team_id'=>$t2['id'],'user_id'=>4]),403);
ok(test_call('events/join',5,['code'=>$e['data']['invite']]));ok(test_call('teams/join',5,['event_id'=>$eid,'team_id'=>$t2['id']]));
$other=ok(test_call('attempt',5,['challenge_id'=>$cid,'action'=>'start']));check($other['data']['team_id']===$t2['id'],'Different teams can reserve same challenge');
// Pending evaluation retry invalidates old AI responses, preserves evidence, and accepts teacher correction.
$other=submit($other);$other=evidence($other);ok(test_call('ai/settings',5,['provider'=>'nvidia','model'=>'fixture-model','transport'=>'server','key'=>'fake-caio-key-1234']));
$pending=prepare($other);
$other=ok(test_call('assessment',5,['attempt_id'=>$other['id'],'version'=>$other['version'],'run_id'=>$other['data']['assessment']['run_id'],'action'=>'fail','message'=>'Rede indisponível']));
check($other['data']['status']==='working' && !isset($other['data']['grade']) && !isset($other['data']['assessment']),'Technical failure restores editable draft without a grade');
$archived=end($other['data']['assessment_history']);
check($archived['status']==='needs_attention' && $archived['submitted_code']==='print(5)' && !empty($archived['evidence']),'Failed evaluation preserves code and evidence for audit');
denied(judge($pending,5),409);
$other=ok(test_call('attempt',5,['challenge_id'=>$cid,'version'=>$other['version'],'action'=>'save','code'=>'print(2+3)','language'=>'python']));
check($other['data']['code']==='print(2+3)','Editing after failure persists');
$other=submit($other);$other=evidence($other);$pending=prepare($other);
foreach(['UPDATE','COMMIT'] as $failure){$wpdb->fail=$failure;denied(test_call('assessment',5,['attempt_id'=>$other['id'],'version'=>$other['version'],'action'=>'withdraw']),503);check(fresh($other)['data']['status']==='submitted','Failed withdrawal rolls back '.$failure);}
$other=ok(test_call('assessment',5,['attempt_id'=>$other['id'],'version'=>$other['version'],'action'=>'withdraw']));
check($other['data']['status']==='working','Explicit return restores editing');
denied(judge($pending,5),409);
$mark=SC_Code_Public_Store::get($archived['marker_id']);check($mark['data']['status']==='interrupted' && $mark['data']['awarded']===0,'Interrupted marker grants no points');
$other=submit($other);$other=evidence($other);
$pending=prepare($other);
$other=ok(test_call('review',1,['attempt_id'=>$other['id'],'version'=>$other['version'],'decision'=>'approve','grade'=>10,'feedback'=>'Correção manual de avaliação pendente']));
denied(judge($pending,5),409);check(fresh($other)['data']['assessment']['effective']['source']==='teacher','Late AI cannot overwrite teacher');
$rank=ok(test_call('ranking',2,[],'GET',['event_id'=>$eid,'include_marks'=>'1']));check($rank['teams'][0]['position']===1 && $rank['teams'][1]['position']===1,'Tied teams share position');
denied(test_call('ranking',3,[],'GET',['event_id'=>$eid,'include_marks'=>'1']),403);
foreach(['INSERT','UPDATE','DELETE','COMMIT'] as $failure){$wpdb->fail=$failure;try{SC_Code_Public_Store::transaction(function() use($eid){$t=SC_Code_Public_Store::create('team',$eid,1,['name'=>'rollback']);SC_Code_Public_Store::save($t,['name'=>'changed'],$t['version']);SC_Code_Public_Store::remove($t['id']);});throw new RuntimeException('Missing failure');}catch(Throwable $x){check($x->getMessage()!=='Missing failure','SQL mutation failures observed');}}
$wpdb->fail='DELETE';denied(test_call('event',1,['id'=>$eid,'confirmation'=>'Corrida'],'DELETE'),503);check(SC_Code_Public_Store::get($eid)!==null && count(SC_Code_Public_Store::list('boost',$eid))===4,'Delete rollback includes boosts');
ok(test_call('event',1,['id'=>$eid,'confirmation'=>'Corrida'],'DELETE'));
foreach(['team','claim','credit','boost','race_mark','member','attempt','challenge'] as $kind)check(!SC_Code_Public_Store::list($kind,$eid),'Scoped cascade '.$kind);
$draft=ok(test_free_event(1,['title'=>'Rascunho anterior']));$data=$draft['data'];unset($data['teams_mode'],$data['validation'],$data['points']);$draft=SC_Code_Public_Store::save($draft,$data,$draft['version']);
$payload=['event_id'=>$draft['id'],'version'=>$draft['version'],'confirmation'=>$data['title'],'points'=>['easy'=>1,'medium'=>3,'hard'=>5]];
denied(test_call('event/upgrade',2,$payload),403);
denied(test_call('event/upgrade',1,array_merge($payload,['confirmation'=>'outro'])),400);
$converted=ok(test_call('event/upgrade',1,$payload));check($converted['data']['title']===$data['title'] && $converted['data']['teams_mode'],'Explicit upgrade preserves content');

$published=$converted['data'];$published['status']='published';SC_Code_Public_Store::save($converted,$published,$converted['version']);denied(test_call('event/upgrade',1,$payload),409);
echo "Game flow: $checks checks passed (SQLite adapter).\n";
