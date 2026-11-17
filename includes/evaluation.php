<?php
/** Durable queue; the WordPress server calls providers outside the SQL transaction. */
trait SC_Code_Public_Evaluation {
    private function evaluation_route(string $route,int $uid,array $v): array {
        if ($route==='evaluation/list') {
            $e=$this->event((string)($v['event_id'] ?? ''),$uid,true,true); $items=[];
            foreach(SC_Code_Public_Store::list('attempt',$e['id']) as $a) {
                if($a['data']['status']!=='submitted')continue;
                $x=$a['data']['assessment'] ?? []; $ready=!empty($x['evidence']['items']);
                $state=!$ready?'review':((int)($x['lease_until'] ?? 0)>time()?'running':((int)($x['retry_at'] ?? 0)>time()?'retry':'queued'));
                $items[]=['id'=>$a['id'],'challenge_id'=>$a['data']['challenge_id'],'state'=>$state,'message'=>$x['message'] ?? 'Aguardando revisão.','submitted_at'=>$a['data']['submitted_at'] ?? 0];
            }
            usort($items,fn($a,$b)=>$a['submitted_at']<=>$b['submitted_at']);
            return ['items'=>$items];
        }
        return SC_Code_Public_Store::transaction(function()use($route,$uid,$v){
            $a=$this->require_record((string)($v['attempt_id'] ?? ''),'attempt');
            $e=$this->event($a['parent'],$uid,true,true); $d=$a['data'];$x=$d['assessment'] ?? [];
            if($d['status']!=='submitted' || !$x)throw new RuntimeException('Esta entrega já foi avaliada ou alterada.',409);
            if($route==='evaluation/release') {
                if(($x['worker_uid'] ?? 0)!==$uid || ($x['run_id'] ?? '')!==($v['run_id'] ?? ''))throw new RuntimeException('Esta avaliação pertence a outra execução.',409);
                $message=mb_substr(sanitize_text_field($v['message'] ?? 'Avaliação interrompida.'),0,400);
                $x=$this->game_progress($x,'ai_review','needs_attention',$message);
                $x['lease_until']=0;$x['retry_at']=time()+min(900,30*(2**min(5,(int)($x['tries'] ?? 1)-1)));
                $x['error_repair']=['title'=>'Entrega preservada','summary'=>$message,'user_message'=>'A avaliação será tentada novamente; a entrega continua salva. '.$message,'blocking_issues'=>[$message],'repair_prompt'=>'Retomar esta entrega preservada após o prazo de recuperação, com nova reserva e o mesmo código e evidências.','evidence_records'=>[$a['id']],'evidence_files'=>[],'updated_at'=>gmdate('c')];
                $d['assessment']=$x;SC_Code_Public_Store::save($a,$d,$a['version']);return ['ok'=>true];
            }
            if((int)($x['lease_until'] ?? 0)>time() || (int)($x['retry_at'] ?? 0)>time())throw new RuntimeException('Esta entrega já está em avaliação ou aguardando nova tentativa.',409);
            if(empty($x['evidence']['items']))throw new RuntimeException('Esta entrega precisa de revisão do professor: faltam resultados dos testes.',409);
            $c=$this->require_record($d['challenge_id'],'challenge');
            if($c['version']!==($x['challenge_version'] ?? 0))throw new RuntimeException('O desafio mudou após a entrega. Revise esta entrega manualmente.',409);
            $this->team_ready($e,$d['team_id']);$this->game_claim($a);
            $source=SC_Code_Public_AI::config($uid);$revision=SC_Code_Public_AI::revision($source);
            $config=SC_Code_Public_AI::assessment_config($source,$x['evaluator_policy'] ?? []);
            $x['previous_run_id']=$x['run_id'];$x['run_id']=wp_generate_uuid4();$x['worker_uid']=$uid;$x['lease_until']=time()+600;$x['retry_at']=0;$x['tries']=(int)($x['tries'] ?? 0)+1;$x['queued']=true;$x['error_repair']=null;
            $x=$this->game_progress($x,'ai_review','running','Professor avaliando esta entrega.');
            $d['assessment']=$x;$a=SC_Code_Public_Store::save($a,$d,$a['version']);
            $payload=SC_Code_Public_AI::payload($config,'assessment',$c['data'],$d,1,[],'');$id=wp_generate_uuid4();
            $ticket=['uid'=>$uid,'queued'=>true,'mode'=>'assessment','event_id'=>$e['id'],'attempt'=>$a['id'],'attempt_version'=>$a['version'],'challenge'=>$c['id'],'challenge_version'=>$c['version'],'hash'=>hash('sha256',$d['code']),'language'=>$d['language'],'run_id'=>$x['run_id'],'payload'=>$payload,'revision'=>$revision,'evaluator'=>array_intersect_key($config,array_flip(['provider','model','reasoning']))];
            set_transient('scp_ai_'.$id,$ticket,900);
            return ['ticket'=>$id,'revision'=>$revision,'run_id'=>$x['run_id'],'evaluator'=>$ticket['evaluator']];
        });
    }
    private function evaluation_access(array $ticket,array $a,int $uid): bool {
        if(empty($ticket['queued']))return $a['owner']===$uid;
        $this->event($a['parent'],$uid,true,true);
        return ($a['data']['assessment']['worker_uid'] ?? 0)===$uid && (int)($a['data']['assessment']['lease_until'] ?? 0)>time();
    }
    private function evaluation_evidence(array $c,array $items,string $hash): array {
        if(!$items || count($items)!==count($c['data']['tests']) || strlen(wp_json_encode($items))>200000)throw new InvalidArgumentException('Execute todos os testes antes de entregar.');
        $out=[];
        foreach($items as $i=>$item){
            if(!is_array($item)||!empty($item['infrastructure_error'])||!is_string($item['output'] ?? null)||!is_int($item['exit_code'] ?? null)||!is_string($item['engine'] ?? null)||strlen($item['engine'])>80||(isset($item['error'])&&!is_string($item['error'])))throw new InvalidArgumentException('Não foi possível executar os testes. Seu código continua editável.');
            $out[]=['output'=>$item['output'],'error'=>mb_substr($item['error'] ?? '',0,2000),'exit_code'=>$item['exit_code'],'engine'=>$item['engine'],'passed'=>false];
        }
        foreach($out as $i=>&$result)$result=SC_Code_Public_Comparison::result($c['data'],$c['data']['tests'][$i],$result);unset($result);
        return ['source'=>'client_reported','code_hash'=>$hash,'items'=>$out,'at'=>time()];
    }
}
