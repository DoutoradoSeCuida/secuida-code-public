<?php
require __DIR__.'/wp-stubs.php';
class ImportTestDB extends TestDB { public bool $fail_challenge=false;public function insert($table,$data,$format=null){if($this->fail_challenge && ($data['kind'] ?? '')==='challenge'){$this->fail_challenge=false;return false;}return parent::insert($table,$data,$format);} }
$wpdb=new ImportTestDB();(new SC_Code_Public_REST())->register();$checks=0;
function check($c,$m){global $checks;if(!$c)throw new RuntimeException($m);$checks++;}
function ok($v){check(!($v instanceof WP_Error),$v instanceof WP_Error?$v->message:'response');return $v;}
function denied($v,$status){check($v instanceof WP_Error && $v->data['status']===$status,'Expected '.$status);}
$fixture=['challenge'=>['title'=>'Questão de importação','statement'=>'Leia dois inteiros e escreva a soma.','level'=>'hard','tests'=>[['input'=>'2 3','output'=>'5']],'examples'=>[['input'=>" 02 3\n",'output'=>"05\n"]]],'source'=>['external_id'=>'TEST-001','file_name'=>'base.xlsx','archive'=>['Catalogo'=>[['id'=>'TEST-001','nivel'=>2,'dificuldade'=>'Básico','tipo_saida'=>'exata','solucao'=>'PRIVATE_REFERENCE_MARKER','pendencias'=>'Conferir limites','permitir_geracao_sem_revisao'=>false]],'Solucoes'=>[['id'=>'TEST-001','explicacao_pseudocodigo'=>'PRIVATE_REFERENCE_MARKER']],'Exemplos'=>[['id'=>'TEST-001','numero_exemplo'=>1]],'Dicas'=>[['id'=>'TEST-001','texto_dica'=>'PRIVATE_HINT_MARKER']]]],'media'=>[]];
$event=ok(test_free_event(1,['title'=>'Import QA']));$eid=$event['id'];
denied(test_call('challenges/import',2,['event_id'=>$eid,'item'=>$fixture]),403);denied(test_call('challenges/import',3,['event_id'=>$eid,'item'=>$fixture]),403);
$first=ok(test_call('challenges/import',1,['event_id'=>$eid,'item'=>$fixture]));check($first['status']==='created','Imported once');
$id=$first['id'];$c=SC_Code_Public_Store::get($id);$refid=SC_Code_Public_Import::reference_id($id);
$before=$wpdb->get_results('SELECT * FROM '.SC_Code_Public_Store::table().' ORDER BY rid');
$snapshot=ok(test_call('event/read',1,['id'=>$eid]));
check($snapshot===ok(test_call('event',1,[],'GET',['id'=>$eid])) && count($snapshot['challenges'])===1,'POST read returns the same canonical challenge snapshot');
check(ok(test_call('events/read',1,[]))===ok(test_free_event(1,[],'GET')),'POST list preserves authorized events and active selection');
check($wpdb->get_results('SELECT * FROM '.SC_Code_Public_Store::table().' ORDER BY rid')===$before,'Read endpoints never mutate or publish');
denied(test_call('event/read',3,['id'=>$eid]),403);denied(test_call('event/read',2,['id'=>$eid]),403);

check($c['data']['level']==='easy' && $c['data']['import_info']['source_level']===2,'Five-level mapping and original preserved');
check($c['data']['tests']===$c['data']['examples'] && $c['data']['import_info']['review_status']==='provided','Provided examples become initial tests without redigitizing');
check($c['data']['examples'][0]['input']===" 02 3\n" && $c['data']['examples'][0]['output']==="05\n",'I/O whitespace and leading zero preserved');
$again=ok(test_call('challenges/import',1,['event_id'=>$eid,'item'=>$fixture]));check($again['status']==='existing' && SC_Code_Public_Store::get($id)['version']===1,'Resume never duplicates or overwrites');
check(count(SC_Code_Public_Store::list('reference',$eid))===1,'One private canonical reference');
$source=ok(test_call('challenge/source',1,[],'GET',['challenge_id'=>$id]));check($source['source']['archive']['Catalogo'][0]['solucao']==='PRIVATE_REFERENCE_MARKER','Teacher reference available');
denied(test_call('challenge/source',2,[],'GET',['challenge_id'=>$id]),403);
denied(test_call('imports/audit',2,[],'GET',['event_id'=>$eid]),403);
denied(test_call('event',1,['id'=>$eid,'version'=>$event['version']]),400);
$edit=['event_id'=>$eid,'id'=>$id,'version'=>$c['version']]+$c['data'];$edit['tests']=[['input'=>'2 3','output'=>'5']];$edit['confirm_import_review']=true;
$c=ok(test_call('challenges',1,$edit))['challenges'][0];check($c['data']['import_info']['review_status']==='approved','Explicit professor review prepares imported question');
$edit['version']=$c['version'];$edit['statement']='Enunciado alterado';unset($edit['confirm_import_review']);
$c=ok(test_call('challenges',1,$edit))['challenges'][0];check($c['data']['import_info']['review_status']==='provided','Editing keeps provided-data status without claiming semantic review');
check(SC_Code_Public_Store::get($refid)['data']['source']['archive']['Catalogo'][0]['solucao']==='PRIVATE_REFERENCE_MARKER','Editing never changes original reference');
$edit['version']=$c['version'];$edit['confirm_import_review']=true;$c=ok(test_call('challenges',1,$edit))['challenges'][0];
ok(test_call('teams',1,['event_id'=>$eid,'name'=>'Equipe QA']));ok(test_call('event',1,['id'=>$eid,'version'=>$event['version']]));
ok(test_call('events/join',2,['code'=>$event['data']['invite']]));$public=ok(test_call('event',2,[],'GET',['id'=>$eid]));
check(ok(test_call('event/read',2,['id'=>$eid]))===$public,'POST student read preserves private-source filtering');
check(!str_contains(json_encode($public),'PRIVATE_REFERENCE_MARKER') && !str_contains(json_encode($public),'PRIVATE_HINT_MARKER') && !isset($public['challenges'][0]['data']['import_info']),'Student summaries never include private source or warnings');
denied(test_call('challenge/source',2,[],'GET',['challenge_id'=>$id]),403);
denied(test_call('challenges/import',1,['event_id'=>$eid,'item'=>$fixture]),409);
denied(test_call('challenge/delete',1,['challenge_id'=>$id,'version'=>$c['version'],'confirmation'=>$c['data']['title']]),409);
$export=ok(test_call('account/export',1,[],'GET'));check(str_contains(json_encode($export),'PRIVATE_REFERENCE_MARKER'),'Teacher portable export includes source');
$export=ok(test_call('account/export',2,[],'GET'));check(!str_contains(json_encode($export),'PRIVATE_REFERENCE_MARKER'),'Student export never includes teacher source');

// One transaction owns reference and challenge, including SQL and COMMIT failure recovery.
$e=ok(test_free_event(1,['title'=>'Rollback import']));$id=SC_Code_Public_Import::id($e['id'],'TEST-001');
foreach(['INSERT','challenge','COMMIT'] as $failure){if($failure==='challenge')$wpdb->fail_challenge=true;else $wpdb->fail=$failure;$r=test_call('challenges/import',1,['event_id'=>$e['id'],'item'=>$fixture]);check($r instanceof WP_Error,'SQL failure visible');check(SC_Code_Public_Store::get($id)===null && SC_Code_Public_Store::get(SC_Code_Public_Import::reference_id($id))===null,'No half-import on '.$failure);}
ok(test_call('challenges/import',1,['event_id'=>$e['id'],'item'=>$fixture]));
$numeric=$fixture;$numeric['source']['external_id']='TEST-002';$numeric['source']['archive']['Catalogo'][0]['id']='TEST-002';$numeric['source']['archive']['Catalogo'][0]['tipo_saida']='numérica com tolerância';
$r=ok(test_call('challenges/import',1,['event_id'=>$e['id'],'item'=>$numeric]));$n=SC_Code_Public_Store::get($r['id']);
denied(test_call('challenges',1,['event_id'=>$e['id'],'id'=>$n['id'],'version'=>$n['version'],'confirm_import_review'=>true]+$n['data']),400);
denied(test_call('challenge/delete',1,['challenge_id'=>$n['id'],'version'=>$n['version'],'confirmation'=>'wrong']),400);
ok(test_call('challenge/delete',1,['challenge_id'=>$n['id'],'version'=>$n['version'],'confirmation'=>$n['data']['title']]));check(!SC_Code_Public_Store::get($n['id']) && !SC_Code_Public_Store::get(SC_Code_Public_Import::reference_id($n['id'])),'Draft deletion removes only target and reference');
$unknown=$fixture;$unknown['source']['external_id']='TEST-003';$unknown['source']['archive']['Catalogo'][0]['id']='TEST-003';unset($unknown['source']['archive']['Catalogo'][0]['tipo_saida']);
$r=ok(test_call('challenges/import',1,['event_id'=>$e['id'],'item'=>$unknown]));$u=SC_Code_Public_Store::get($r['id']);check($u['data']['import_info']['output_kind']==='exact' && $u['data']['import_info']['comparison_origin']==='examples_default','Missing declared kind uses an identified comparison with provided examples');
$review=['event_id'=>$e['id'],'id'=>$u['id'],'version'=>$u['version'],'confirm_import_review'=>true]+$u['data'];$review['tests']=[['input'=>'2 3','output'=>'5']];
$review['review_output_kind']='exact';$u=ok(test_call('challenges',1,$review))['challenges'][0];check($u['data']['import_info']['review_status']==='approved','Professor explicitly defines comparator and reviews tests');
$wpdb->fail='DELETE';$failed=test_call('challenge/delete',1,['challenge_id'=>$u['id'],'version'=>$u['version'],'confirmation'=>$u['data']['title']]);check($failed instanceof WP_Error && SC_Code_Public_Store::get($u['id']) && SC_Code_Public_Store::get(SC_Code_Public_Import::reference_id($u['id'])),'Failed deletion rolls back both source and challenge');
ok(test_call('event',1,['id'=>$e['id'],'confirmation'=>$e['data']['title']],'DELETE'));check(!SC_Code_Public_Store::list('reference',$e['id']),'Event deletion cascades private references');

$dir=getenv('SC_CODE_PUBLIC_IMPORT_TEST_DIR');
if($dir){
 $e=ok(test_free_event(1,['title'=>'Real workbooks']));$count=0;$images=0;$examples=0;
 foreach(['interif.json','other.json'] as $file){$items=json_decode(file_get_contents($dir.'/'.$file),true,512,JSON_THROW_ON_ERROR);foreach($items as $item){$r=ok(test_call('challenges/import',1,['event_id'=>$e['id'],'item'=>$item]));check($r['status']==='created','Real question imported');$c=SC_Code_Public_Store::get($r['id']);$source=ok(test_call('challenge/source',1,[],'GET',['challenge_id'=>$c['id']]));check($source['source']===$item['source'],'All original reference fields preserved');$count++;$examples+=count($c['data']['examples']);foreach($item['media'] as $image){$media=ok(test_call('challenge/media',1,[],'GET',['challenge_id'=>$c['id'],'image_id'=>$image['id']]));check($media['uri']==='data:'.$image['mime'].';base64,'.$image['base64'],'Exact image bytes round trip');$images++;}}}
 check($count===147 && $images===78,'Both actual workbooks fully imported');
 $audit=ok(test_call('imports/audit',1,[],'GET',['event_id'=>$e['id']]));check(count($audit['questoes'])===147,'Audit comes from persisted SDK records');
 file_put_contents(dirname(__DIR__).'/spec/importado_sistema.json',json_encode($audit,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
 echo "Real workbooks: $count questions, $examples examples, $images images preserved.\n";
}
echo "Import: $checks checks passed.\n";
