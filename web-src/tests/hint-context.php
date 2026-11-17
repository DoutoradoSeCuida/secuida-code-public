<?php
require __DIR__.'/wp-stubs.php';
$checks=0;
function check($value,$label){global $checks;if(!$value)throw new RuntimeException($label);$checks++;}
$fixture=json_decode(file_get_contents(__DIR__.'/hint-case.json'),true,512,JSON_THROW_ON_ERROR);
$bad=$fixture['code'];$good=str_replace('int i = 1;','int i = 0;',$bad);$challenge=$fixture['challenge'];
$prior=['question'=>'Mas assim não está certo?','text'=>$fixture['misleading_hint'],'revision'=>12,'code_hash'=>hash('sha256',$good)];
foreach(['nvidia'=>'fixture-model','gemini'=>'gemini-fixture-flash','openai'=>'gpt-4o'] as $provider=>$model){
 $config=['provider'=>$provider,'model'=>$model];
 $attempt=['code'=>$bad,'language'=>'c','revisions'=>13,'hint_history'=>[$prior],
   'results'=>['source'=>'client_reported','code_hash'=>hash('sha256',$bad),'items'=>[['output'=>$fixture['reported_output'],'passed'=>false,'exit_code'=>0,'engine'=>'local']]]];
 $p=SC_Code_Public_AI::payload($config,'hint',$challenge,$attempt,1,[],'Em que devo prestar atenção?');
 $policy=$p['messages'][0]['content'];$input=json_decode(end($p['messages'])['content'],true);
 check($input['code']===$bad && $input['code_revision']===13,'Current literal C and revision reach every provider');
 check($input['context_kind']==='current_hint_context','Latest request has an explicit current context marker');
 check($input['test_context']['status']==='current','Execution is bound to current source hash');
 $o=$input['test_context']['observations'][0];
 check($o['input']==='10' && $o['expected_output']==='243' && $o['reported_output']==="81\n" && $o['reported_passed']===false,'Model receives joined input, expected and actual output, not only a failed flag');
 check($o['engine']==='local' && $o['reported_exit_code']===0 && $o['reported_error']===null,'Execution evidence is distinct from syntax/runtime errors');
 $archive=json_decode($p['messages'][1]['content'],true);$history=$archive['interactions'][0];
 check($history['advice']===$prior['text'],'Misleading old advice is retained without rewriting history');
 check(!$history['same_code_revision'] && $history['source']==='unverified_model_response','Earlier advice is explicitly historical and unverified');
 check($archive['priority']==='secondary_reference_only' && !in_array('assistant',array_column($p['messages'],'role'),true),'Old advice is lower-priority reference data, not a completion for the model to continue');
 check(str_contains($policy,'Exemplo independente') && str_contains($policy,'não um diagnóstico para o código atual'),'Tutor receives a transferable example without a closed diagnosis');
 check(str_contains($policy,'quantidade efetiva de repetições') && str_contains($policy,'não substitua uma fórmula'),'Policy verifies implementation instead of imposing a recurrence implementation');
 check(str_contains($policy,'Respeite estritamente o intervalo') && str_contains($policy,'região ou o comportamento específico'),'Tutor is instructed to use valid inputs and focus advice on observed behavior');
 check(str_contains($policy,'não fatos') && str_contains($policy,'sem defender'),'History cannot be used to defend an obsolete diagnosis');
 check(str_contains($policy,'Não tenho mais sugestões a dar neste momento.') && str_contains($policy,'não emite veredito'),'No-verdict and abstention policy preserved');
 check(!isset($input['provided_reference']) && !str_contains(json_encode($p),'expected_hint_target'),'No private solution or fixture diagnosis is sent');
 check(!isset($input['topics']) && str_contains($input['statement'],'min('),'Tutor sees actual recurrence requirements without didactic algorithm tags');
 // Reverting/fixing code must not carry a previous failure into the new request.
 $attempt['code']=$good;$attempt['revisions']=14;
 $p=SC_Code_Public_AI::payload($config,'hint',$challenge,$attempt,1);$input=json_decode(end($p['messages'])['content'],true);
 check($input['code']===$good && $input['test_context']['status']==='stale','Changed current code makes old test evidence stale');
 check($input['reported_tests']===[] && $input['test_context']['observations']===[],'Stale actual output is excluded from usable evidence');
 $attempt['results']=[];
 $hidden=$attempt;$hidden['hint_history'][0]['hidden']=true;$fresh=SC_Code_Public_AI::payload($config,'hint',$challenge,$hidden,1,[],'Considerando o histórico');check(count($fresh['messages'])===2,'Hidden advice is excluded from future model requests');
 $p=SC_Code_Public_AI::payload($config,'hint',$challenge,$attempt,1);$input=json_decode(end($p['messages'])['content'],true);
 check($input['test_context']['status']==='not_run' && $input['test_context']['observations']===[],'No run never implies current failure or success');
 $attempt['results']=['code_hash'=>hash('sha256',$good),'items'=>[['output'=>"243\n",'passed'=>true,'engine'=>'local']]];
 $attempt['hint_history'][0]['revision']=14;
 $p=SC_Code_Public_AI::payload($config,'hint',$challenge,$attempt,1,[],'A dica anterior ainda se aplica?');$input=json_decode(end($p['messages'])['content'],true);
 check($input['test_context']['observations'][0]['reported_passed']===true && json_decode($p['messages'][1]['content'],true)['interactions'][0]['same_code_revision'],'Matching current evidence and same-version history remain distinguishable');
 // An infrastructure error remains evidence about execution availability, not a bug.
 $attempt['results']['items'][0]=['output'=>'','error'=>'Executor indisponível','infrastructure_error'=>true,'engine'=>'local'];
 $p=SC_Code_Public_AI::payload($config,'hint',$challenge,$attempt,1);$input=json_decode(end($p['messages'])['content'],true);
 check($input['test_context']['observations'][0]['infrastructure_error']===true && str_contains($policy,'falha de infraestrutura não demonstra defeito'),'Infrastructure failure cannot require an algorithm rewrite');
}
$structured=SC_Code_Public_Domain::hint('{"analise_interna":"não exibir diagnóstico","dica":"Confira seu laço."}',1);check($structured['text']==='Confira seu laço.','Only student-facing hint is persisted');
try{SC_Code_Public_Domain::hint('{"analise_interna":"não exibir diagnóstico"}',1);throw new RuntimeException('Invalid structured reply should fail');}catch(InvalidArgumentException $e){check(true,'Incomplete JSON does not leak analysis');}
echo "Hint context: $checks checks passed (payload contract, not real-model accuracy).\n";
$judgment=['verdict'=>'approved','grade'=>10,'criteria'=>['correctness'=>10,'efficiency'=>10,'clarity'=>10],'rubric_version'=>1,'category'=>'coherent'];
check(SC_Code_Public_Domain::assessment("```json\n".json_encode($judgment)."\n```")['grade']===10.0,'Markdown JSON wrappers preserve strict assessment validation');
try{SC_Code_Public_Domain::assessment('```json'.json_encode(['verdict'=>'approved']).'```');throw new RuntimeException('Missing rubric accepted');}catch(InvalidArgumentException $e){check(true,'Malformed assessment remains rejected');}
