<?php
require __DIR__.'/wp-stubs.php';
$wpdb=new TestDB();(new SC_Code_Public_REST())->register();$checks=0;
function check($value,$label){global $checks;if(!$value)throw new RuntimeException($label);$checks++;}
$GLOBALS['test_caps'][3]=['sc_code_public_teach'=>true];
$r=test_call('teachers/request',2,['action'=>'submit']);check($r['status']==='pending','Student can request');
$r=test_call('teachers/request',2,['action'=>'submit']);check($r['status']==='pending' && count(SC_Code_Public_Store::list('teacher_req'))===1,'Duplicate request is idempotent');
foreach([2,3] as $uid){$r=test_call('teachers/review',$uid,['action'=>'list']);check($r instanceof WP_Error && $r->data['status']===403,'Students and teachers cannot review');}
$list=test_call('teachers/review',1,['action'=>'list']);check(count($list['requests'])===1 && $list['requests'][0]['name']==='Ana','Administrator sees request');$req=$list['requests'][0];
$r=test_call('teachers/review',3,['action'=>'approve','id'=>$req['id'],'version'=>$req['version']]);check($r instanceof WP_Error && !user_can(2,'sc_code_public_teach'),'Teacher cannot promote');
$r=test_call('teachers/review',1,['action'=>'approve','id'=>$req['id'],'version'=>$req['version']]);check($r['status']==='approved' && user_can(2,'sc_code_public_teach'),'Administrator approves');check(!user_can(2,'manage_options'),'Approval never grants WordPress admin');
$r=test_call('teachers/review',1,['action'=>'approve','id'=>$req['id'],'version'=>$req['version']]);check($r instanceof WP_Error && $r->data['status']===409,'Duplicate decision rejected');
$r=test_call('auth/me',2,[],'GET');check($r['user']['can_teach'] && !$r['user']['can_manage_teachers'],'Role is returned independently');
$e=test_free_event(2,['title'=>'Evento']);check(is_array($e) && $e['owner']===2,'Approved teacher can create event');
$r=test_call('teachers/request',4,['action'=>'submit']);$req2=SC_Code_Public_Store::list('teacher_req',null,4)[0];$r=test_call('teachers/review',1,['action'=>'deny','id'=>$req2['id'],'version'=>$req2['version']]);check($r['status']==='denied'&&!user_can(4,'sc_code_public_teach'),'Deny does not grant');
$r=test_call('teachers/request',4,['action'=>'submit']);check($r['status']==='pending','Denied applicant may apply again');
$list=test_call('teachers/review',1,['action'=>'teachers','search'=>'ana']);check(count($list['teachers'])===1 && $list['teachers'][0]['id']===2 && $list['teachers'][0]['revocable'],'Admin finds approved teacher');
foreach([2,3] as $who){$r=test_call('teachers/review',$who,['action'=>'teachers']);check($r instanceof WP_Error && $r->data['status']===403,'Only admin lists teachers');$r=test_call('teachers/review',$who,['action'=>'revoke','user_id'=>2]);check($r instanceof WP_Error && user_can(2,'sc_code_public_teach'),'Only admin revokes teacher');}
$r=test_call('teachers/review',1,['action'=>'revoke','user_id'=>1]);check($r instanceof WP_Error && user_can(1,'manage_options'),'WordPress admin protected');
$r=test_call('teachers/review',1,['action'=>'revoke','user_id'=>2]);check($r['ok'] && !user_can(2,'sc_code_public_teach'),'Admin revokes teacher access');check(SC_Code_Public_Store::get($e['id'])!==null,'Event preserved after revocation');
$list=test_call('events/read',2);check(!array_filter($list['events'],fn($event)=>$event['id']===$e['id']),'Revoked event is not presented as accessible');$detail=test_call('event/read',2,['id'=>$e['id']]);check($detail instanceof WP_Error && $detail->data['status']===403,'Revoked teacher cannot manage preserved event');
$r=test_free_event(2,['title'=>'Sem acesso']);check($r instanceof WP_Error && $r->data['status']===403,'Revoked account cannot create event');
$r=test_call('teachers/request',2,['action'=>'submit']);check($r['status']==='pending','Revoked account may request again');
echo "Teacher requests: $checks checks passed.\n";
