<?php
// New-event contract: web-src/spec/code-public.md.
trait SC_Code_Public_Classroom {
    private function classroom(array $e): bool {return ($e['data']['classroom_version'] ?? 0)===1;}
    private function classroom_visible(array $e,array $c): bool {
        if(!$this->classroom($e))return true;
        $warm=in_array($c['id'],$e['data']['warmup_ids'] ?? [],true);
        return ($e['data']['phase'] ?? 'warmup')==='warmup' ? $warm : (!$warm && !in_array($c['id'],$e['data']['hidden_ids'] ?? [],true) && !in_array($c['data']['level'],$e['data']['hidden_levels'] ?? [],true));
    }
    private function classroom_guard(array $e,array $c,int $uid): void {
        if(!$this->classroom($e))return;
        if(!$this->classroom_visible($e,$c))throw new RuntimeException('Este desafio não está disponível nesta fase.',409);
        $t=$this->require_record($this->game_team($e,$uid),'team');
        if(($e['data']['phase'] ?? 'warmup')==='official' && empty($t['data']['approved']))throw new RuntimeException('Aguarde o professor conferir e liberar sua equipe.',409);
    }
    private function classroom_ops(array $e,int $uid,array $v): array {
        $action=$v['action'];$editor=$this->event_editor($e,$uid);
        if(!$this->classroom($e))throw new RuntimeException('Este evento mantém o formato anterior.',409);
        if($action==='program'){
            if(!$editor)throw new RuntimeException('Somente professores podem configurar a atividade.',403);
            if($e['version']!==(int)($v['version'] ?? 0))throw new RuntimeException('O evento mudou. Atualize antes de salvar.',409);
            $d=$e['data'];$ids=array_column(SC_Code_Public_Store::list('challenge',$e['id']),'id');
            foreach(['warmup_ids','hidden_ids'] as $field)if(isset($v[$field])){
                if(!is_array($v[$field]) || array_diff($v[$field],$ids))throw new InvalidArgumentException('Selecione desafios deste evento.');
                if($field==='warmup_ids' && ($d['phase'] ?? 'warmup')!=='warmup')throw new RuntimeException('O aquecimento já terminou.',409);
                $d[$field]=array_values(array_unique($v[$field]));
            }
            if(isset($v['level_labels']))$d['level_labels']=$this->category_labels($v['level_labels']);
            if(isset($v['hidden_levels'])){if(!is_array($v['hidden_levels']) || array_diff($v['hidden_levels'],['easy','medium','hard']))throw new InvalidArgumentException('Escolha categorias válidas.');$d['hidden_levels']=array_values(array_unique($v['hidden_levels']));}
            if(!empty($v['end_warmup'])){$d['phase']='official';$d['warmup_ended_at']=time();}
            return SC_Code_Public_Store::save($e,$d,$e['version']);
        }
        $t=$this->require_record((string)($v['team_id'] ?? ''),'team');
        if($t['parent']!==$e['id'] || (!$editor && $t['owner']!==$uid))throw new RuntimeException('Sem acesso a esta equipe.',403);
        $d=$t['data'];
        if($action==='claim_team'){
            // Explicit recovery for teams created by teacher accounts before this fix.
            if($t['owner']!==$uid)throw new RuntimeException('Você só pode retomar uma equipe criada pela sua conta.',403);
            $m=$this->require_record($this->member_id($e['id'],$uid),'member');
            if(($m['data']['team_id'] ?? '')===$t['id'])return $m;
            if(!empty($m['data']['team_id']))throw new RuntimeException('Sua conta já participa de outra equipe neste evento.',409);
            foreach(SC_Code_Public_Store::list('member',$e['id']) as $other)if(($other['data']['team_id'] ?? '')===$t['id'] && $other['owner']!==$uid)throw new RuntimeException('Esta equipe já está vinculada a outra conta. Peça ajuda ao professor.',409);
            foreach(SC_Code_Public_Store::list('attempt',$e['id'],$uid) as $a)if(!empty($a['data']['team_id']) && $a['data']['team_id']!==$t['id'])throw new RuntimeException('Há tentativas vinculadas a outra equipe. Peça ajuda ao professor.',409);
            $md=$m['data'];$md['team_id']=$t['id'];
            return SC_Code_Public_Store::save($m,$md,$m['version']);
        }
        if($action==='approve_team'){
            if(!$editor || !is_bool($v['approved'] ?? null))throw new RuntimeException('Somente o professor pode conferir a equipe.',403);
            if($v['approved'])$this->team_ready($e,$t['id']);
            $d['approved']=$v['approved'];
        }else{
            $names=$v['roster'] ?? null;if(!is_array($names))throw new InvalidArgumentException('Informe os nomes dos integrantes.');
            $names=array_map(fn($n)=>trim(sanitize_text_field(is_string($n)?$n:'')),$names);
            if(!$names || count(array_filter($names,fn($n)=>!$n || mb_strlen($n)>100)) || count($names)!==count(array_unique($names)))throw new InvalidArgumentException('Informe nomes distintos, de até 100 caracteres.');
            $account=get_user_by('id',$t['owner']);if(!$account || $names[0]!==$account->display_name)throw new InvalidArgumentException('O primeiro integrante deve ser a conta responsável.');
            if(($e['data']['team_max'] ?? null)!==null && count($names)>$e['data']['team_max'])throw new InvalidArgumentException('O time ultrapassa o limite de integrantes.');
            if($names!==($d['roster'] ?? []))$d['approved']=false;$d['roster']=$names;
        }
        $d['history'][]=['action'=>$action,'by'=>$uid,'at'=>time()];
        return SC_Code_Public_Store::save($t,$d,(int)($v['version'] ?? 0));
    }
}
