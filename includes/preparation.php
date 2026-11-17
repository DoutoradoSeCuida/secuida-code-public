<?php
// Product contract: mobile_apps/secuida-code/spec/code.md. No semantic claims without AI.
class SC_Code_Public_Preparation {
    public static function issues(array $data): array {
        $issues=[];$tests=$data['tests'] ?? [];
        if (!$tests) $issues[]='Não há pares de entrada e saída disponíveis para executar a avaliação.';
        $kind=$data['import_info']['output_kind'] ?? 'exact';
        if (!SC_Code_Public_Comparison::supported($data)) $issues[]='Esta questão declara comparação especial, que ainda precisa de um corretor compatível.';
        $seen=[];
        foreach($tests as $test) {
            $key=hash('sha256',$test['input']);$output=$test['output'];
            if(isset($seen[$key]) && $seen[$key]!==$output) {$issues[]='A mesma entrada está associada a saídas diferentes nos testes fornecidos.';break;}
            $seen[$key]=$output;
        }
        return $issues;
    }
    public static function adopt(array $data,array $archive): array {
        if(empty($data['import_info']))return $data;
        $info=$data['import_info'];
        if(!$data['tests'] && !empty($data['examples'])) {
            $data['tests']=$data['examples'];$info['tests_origin']='provided_examples';unset($data['reconciliation']);
        } elseif(!isset($info['tests_origin'])) $info['tests_origin']='existing';
        if(($info['output_kind'] ?? 'unconfirmed')==='unconfirmed' && empty($info['comparison_declared'])) {
            $info['output_kind']='exact';$info['comparison_origin']='examples_default';
        } elseif(!isset($info['comparison_origin'])) $info['comparison_origin']=!empty($info['comparison_declared'])?'declared':'existing';
        $info['review_status']=($info['review_status'] ?? '')==='approved'?'approved':'provided';
        $info['preparation_version']=1;
        $info['warnings']=array_values(array_filter($info['warnings'] ?? [],fn($w)=>!in_array($w,['A fonte pede revisão antes do uso.','Defina o comparador de saída antes de publicar.'],true)));
        $data['import_info']=$info;
        $data['import_info']['preparation_issues']=self::issues($data);
        return $data;
    }
    public static function review(string $raw): array {
        $r=json_decode($raw,true);
        if(!is_array($r) || !in_array($r['status'] ?? '',['consistent','issues','uncertain'],true) || !is_string($r['summary'] ?? null) || !trim($r['summary']) || strlen($r['summary'])>4000 || !is_array($r['issues'] ?? null) || count($r['issues'])>10) throw new InvalidArgumentException('A IA não retornou uma revisão de conteúdo válida. Tente novamente quando desejar.');
        foreach($r['issues'] as $issue)if(!is_string($issue) || strlen($issue)>1500)throw new InvalidArgumentException('Alerta de revisão inválido.');
        $tests=$r['proposed_tests'] ?? [];
        if(!is_array($tests))throw new InvalidArgumentException('Proposta de testes inválida.');
        $tests=SC_Code_Public_Domain::challenge(['title'=>'Proposta','statement'=>'Proposta','tests'=>$tests])['tests'];
        return ['status'=>$r['status'],'summary'=>$r['summary'],'issues'=>array_values($r['issues']),'proposed_tests'=>$tests,'source'=>'ai_proposal','applied'=>false,'at'=>time()];
    }
}
