<?php
// Canonical product contract: web-src/spec/code-public.md.
trait SC_Code_Public_Event_Ops {
    private function collab_route(string $route,int $uid,array $v): array {
        if (!$this->teacher($uid)) throw new RuntimeException('Somente contas autorizadas como professor podem aceitar ou gerenciar convites de professor.',403);
        if ($route==='collab/accept') {
            $this->rate('collab_accept:'.$uid,20,300);
            $code=strtoupper(trim((string)($v['code'] ?? '')));$hash=hash('sha256',$code);$found=null;
            foreach(SC_Code_Public_Store::list('collab_inv') as $i) if(hash_equals($i['data']['code_hash'],$hash)){$found=$i;break;}
            if(!$found || !empty($found['data']['revoked']) || $found['data']['expires']<=time())throw new RuntimeException('Convite inválido, expirado ou revogado.',404);
            $event=$this->require_record($found['parent'],'event');
            if(!empty($found['data']['accepted_by']) && $found['data']['accepted_by']!==$uid)throw new RuntimeException('Este convite já foi usado.',409);
            if(empty($v['confirm']))return ['event_id'=>$event['id'],'event_title'=>$event['data']['title'],'role'=>$found['data']['role']];
            $this->may_switch_event($uid,$event['id']);
            return SC_Code_Public_Store::transaction(function()use($uid,$found,$event){
                global $wpdb; $wpdb->get_var($wpdb->prepare('SELECT rid FROM '.SC_Code_Public_Store::table().' WHERE rid=%s FOR UPDATE',$event['id']));if($wpdb->last_error)throw new RuntimeException('Não foi possível confirmar o convite.',503);
                $i=$this->require_record($found['id'],'collab_inv');if(!empty($i['data']['revoked']) || $i['data']['expires']<=time() || (!empty($i['data']['accepted_by']) && $i['data']['accepted_by']!==$uid))throw new RuntimeException('Convite indisponível.',409);
                $id=hash('sha256','collab:'.$event['id'].':'.$uid);$old=SC_Code_Public_Store::get($id);$data=['invitation_id'=>$i['id'],'accepted_at'=>time()];
                if($old)SC_Code_Public_Store::save($old,$data,$old['version']);else SC_Code_Public_Store::create('collab',$event['id'],$uid,$data,$id);
                $data=$i['data'];$data['accepted_by']=$uid;SC_Code_Public_Store::save($i,$data,$i['version']);
                return ['event_id'=>$event['id'],'role'=>$data['role']];
            });
        }
        $event=$this->event((string)($v['event_id'] ?? ''),$uid,true);
        if(!$this->event_admin($event,$uid))throw new RuntimeException('Somente quem administra o evento pode gerenciar professores convidados.',403);
        if($route==='collab/list') {
            $items=[];foreach(SC_Code_Public_Store::list('collab_inv',$event['id']) as $i){unset($i['data']['code_hash']);$person=!empty($i['data']['accepted_by'])?get_user_by('id',$i['data']['accepted_by']):null;$i['data']['accepted_name']=$person?$person->display_name:null;$items[]=$i;}return ['invitations'=>$items];
        }
        if($route==='collab/invite') {
            $role=(string)($v['role'] ?? '');if(!in_array($role,['monitor','editor','admin'],true))throw new InvalidArgumentException('Escolha um nível de acesso válido.');
            $code=strtoupper(bin2hex(random_bytes(6)));$i=SC_Code_Public_Store::create('collab_inv',$event['id'],$uid,['role'=>$role,'code_hash'=>hash('sha256',$code),'expires'=>time()+7*DAY_IN_SECONDS,'accepted_by'=>null,'revoked'=>false]);return ['id'=>$i['id'],'code'=>$code,'role'=>$role];
        }
        if($route==='collab/revoke') {
            $i=$this->require_record((string)($v['id'] ?? ''),'collab_inv');if($i['parent']!==$event['id'])throw new RuntimeException('Convite de outro evento.',403);
            $data=$i['data'];$data['revoked']=true;unset($data['code_hash']); // hash must remain to reject old code without revealing it
            $data['code_hash']=$i['data']['code_hash'];$saved=SC_Code_Public_Store::save($i,$data,(int)($v['version'] ?? 0));unset($saved['data']['code_hash']);return ['ok'=>true];
        }
        throw new RuntimeException('Ação indisponível.',404);
    }
    private function focus_policy(array $e): array {
        return $e['data']['focus_policy'] ?? ['enabled'=>true,'grace_seconds'=>5,'warning_count'=>1,'points_per_exit'=>1,'max_penalty'=>5,'version'=>3,'fullscreen_exits'=>true,'focus_exits'=>true];
    }
    private function ops_settings(array $v): array {
        $min=$v['team_min'] ?? 1;$max=$v['team_max'] ?? null;
        if (!is_int($min) || $min<1 || $min>10000 || ($max!==null && (!is_int($max) || $max<$min || $max>10000))) throw new InvalidArgumentException('Mínimo deve ser pelo menos 1. Máximo vazio significa sem limite e, se definido, precisa ser maior ou igual ao mínimo.');
        $out=['team_min'=>$min,'team_max'=>$max,'self_teams'=>true,'policy_version'=>2];
        $out=array_merge($out,$this->event_schedule($v));
        if(array_key_exists('level_labels',$v))$out['level_labels']=$this->category_labels($v['level_labels']);
        $p=$v['focus_policy'] ?? ['enabled'=>true,'grace_seconds'=>5,'warning_count'=>1,'points_per_exit'=>1,'max_penalty'=>5];
        if(!is_array($p) || !is_bool($p['enabled'] ?? null))throw new InvalidArgumentException('Escolha se o evento acompanha saídas da tela.');
        foreach(['grace_seconds'=>[1,120],'warning_count'=>[0,10],'points_per_exit'=>[1,100],'max_penalty'=>[1,1000]] as $k=>$range) if(!is_int($p[$k] ?? null) || $p[$k]<$range[0] || $p[$k]>$range[1])throw new InvalidArgumentException('Confira os valores inteiros das regras de saída da tela.');
        $out['focus_policy']=array_intersect_key($p,array_flip(['enabled','grace_seconds','warning_count','points_per_exit','max_penalty']));$out['focus_policy']['version']=3;$out['focus_policy']['fullscreen_exits']=true;$out['focus_policy']['focus_exits']=true;
        $n=$v['integrity_penalty'] ?? 1;if(!is_int($n)||$n<0||$n>100)throw new InvalidArgumentException('Desconto por resposta pronta: inteiro entre 0 e 100.');$out['integrity_penalty']=$n;
        return $out;
    }
    private function category_labels($value): array {
        if(!is_array($value))throw new InvalidArgumentException('Informe os nomes das três categorias.');
        $labels=[];foreach(['easy','medium','hard'] as $level){$label=trim(sanitize_text_field($value[$level] ?? ''));if(!$label || mb_strlen($label)>30)throw new InvalidArgumentException('Cada categoria precisa de um nome de até 30 caracteres.');$labels[$level]=$label;}
        return $labels;
    }
    private function event_schedule(array $v,array $previous=[]): array {
        $out=[];
        foreach(['starts_at','ends_at'] as $k) {
            $s=(string)($v[$k] ?? $previous[$k] ?? '');
            if($s!=='' && (!preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/',$s) || strtotime($s)===false)) throw new InvalidArgumentException('Escolha uma data e hora válidas, com fuso horário, ou deixe o campo vazio.');
            $out[$k]=$s;
        }
        if($out['starts_at'] && $out['ends_at'] && strtotime($out['starts_at'])>=strtotime($out['ends_at'])) throw new InvalidArgumentException('O término precisa ser depois do início.');
        return $out;
    }
    private function focus_stage_ready(array $e,int $uid): bool {
        if(!$this->classroom($e))return true;
        if(($e['data']['phase'] ?? 'warmup')!=='official')return false;
        $m=SC_Code_Public_Store::get($this->member_id($e['id'],$uid));$t=SC_Code_Public_Store::get($m['data']['team_id'] ?? '');
        return $t && !empty($t['data']['approved']) && empty($t['data']['suspended']);
    }
    private function focus_session_current(array $e,?array $s): bool {
        return $s && (!$this->classroom($e) || (($e['data']['phase'] ?? 'warmup')==='official' && ($s['data']['official_started_at'] ?? null)===($e['data']['warmup_ended_at'] ?? 0)));
    }
    private function focus_id(string $event,int $uid): string {return hash('sha256','focus:'.$event.':'.$uid);}
    private function watch_access(string $event,int $uid): array {
        $e=$this->require_record($event,'event');
        if($this->event_role($e,$uid))return $e;
        $w=SC_Code_Public_Store::get(hash('sha256','watch:'.$event.':'.$uid));
        $i=$w ? SC_Code_Public_Store::get($w['data']['invitation_id']) : null;
        if(!$w || !$i || $i['kind']!=='watch_inv' || $i['parent']!==$event || !empty($i['data']['revoked']) || $i['data']['expires']<=time())throw new RuntimeException('Seu acesso de acompanhamento expirou ou foi revogado.',403);
        return $e;
    }
    private function may_switch_event(int $uid,string $target): void {
        foreach(SC_Code_Public_Store::list('focus',null,$uid) as $s){if($s['parent']===$target || empty($s['data']['active']))continue;$e=SC_Code_Public_Store::get($s['parent']);if($e && $this->focus_session_current($e,$s) && $this->focus_stage_ready($e,$uid) && !empty($e['data']['ends_at']) && strtotime($e['data']['ends_at'])>time())throw new RuntimeException('Sua participação acompanhada está ativa em outro evento. Aguarde o término para trocar de evento.',409);}
    }
    private function focus_signout(int $uid): void {
        foreach(SC_Code_Public_Store::list('focus',null,$uid) as $old){
            $e=SC_Code_Public_Store::get($old['parent']);if(!$e || !$this->focus_stage_ready($e,$uid) || !$this->focus_session_current($e,$old) || empty($old['data']['active']) || (!empty($e['data']['ends_at']) && strtotime($e['data']['ends_at'])<=time()))continue;
            $this->event($e['id'],$uid,false,true);$s=$this->require_record($old['id'],'focus');$d=$s['data'];
            if(empty($d['hidden_at'])){$d['hidden_at']=time();$d['hidden_seq']=++$d['seq'];$d['hidden_source']='signout_server_event';SC_Code_Public_Store::save($s,$d,$s['version']);}
        }
    }
    private function team_ready(array $e,string $team): void {
        $t=SC_Code_Public_Store::get($team);if(!empty($t['data']['suspended']))throw new RuntimeException('Equipe suspensa. Proponha outro nome em Minha equipe e peça reativação ao professor.',409);
        $count=count(array_filter(SC_Code_Public_Store::list('member',$e['id']),fn($m)=>($m['data']['team_id'] ?? '')===$team));
        if($this->classroom($e))$count=count($t['data']['roster'] ?? []);
        if($count<(int)($e['data']['team_min'] ?? 1))throw new RuntimeException('Seu time ainda não atingiu o mínimo de integrantes. Confira Minha equipe.',409);
    }
    private function focus_required(array $e,int $uid): void {
        if(empty($this->focus_policy($e)['enabled']) || ($this->classroom($e) && ($e['data']['phase'] ?? 'warmup')!=='official'))return;
        $s=SC_Code_Public_Store::get($this->focus_id($e['id'],$uid));
        if(!$this->focus_stage_ready($e,$uid) || !$this->focus_session_current($e,$s) || empty($s['data']['active']) || ($s['data']['accepted_version'] ?? 0)!==$this->focus_policy($e)['version'] || !empty($s['data']['hidden_at']))throw new RuntimeException('Abra Regras e inicie sua participação acompanhada antes de resolver.',409);
    }
    private function focus_exits(string $event,?int $uid=null): array {
        $rows=SC_Code_Public_Store::list('focus_exit',$event,$uid);
        usort($rows,fn($a,$b)=>($a['data']['started_at']<=>$b['data']['started_at']) ?: strcmp($a['id'],$b['id']));return $rows;
    }
    private function focus_public(array $e,?array $s,int $uid): array {
        $rows=$this->focus_exits($e['id'],$uid);$penalty=0;if(!$this->focus_stage_ready($e,$uid) || !$this->focus_session_current($e,$s))$s=null;
        foreach($rows as $r)if(empty($r['data']['waived']))$penalty+=(int)$r['data']['points'];
        return ['policy'=>$this->focus_policy($e),'session'=>$s ? ['id'=>$s['data']['session_id'],'client_id'=>$s['data']['client_id'],'seq'=>$s['data']['seq'],'active'=>$s['data']['active'],'hidden'=>!empty($s['data']['hidden_at']),'started_at'=>$s['data']['started_at']] : null,'exits'=>$rows,'penalty'=>$penalty,'server_now'=>time()];
    }
    private function settle_focus(array $e,array $s): array {
        $d=$s['data'];if(!$this->focus_session_current($e,$s)){$d['active']=false;$d['hidden_at']=null;$d['hidden_seq']=null;unset($d['hidden_source']);return SC_Code_Public_Store::save($s,$d,$s['version']);}if(empty($d['hidden_at']))return $s;
        $end=min(time(),empty($e['data']['ends_at']) ? time() : strtotime($e['data']['ends_at']));
        $seconds=max(0,$end-$d['hidden_at']);$p=$this->focus_policy($e);$prior=$this->focus_exits($e['id'],$s['owner']);
        $qualified=array_filter($prior,fn($x)=>$x['data']['seconds']>$p['grace_seconds'] && empty($x['data']['waived']));
        $used=array_sum(array_map(fn($x)=>(int)$x['data']['points'],$prior));
        $points=$seconds>$p['grace_seconds'] && count($qualified)>=$p['warning_count'] ? min($p['points_per_exit'],max(0,$p['max_penalty']-$used)) : 0;
        $status=$seconds<=$p['grace_seconds'] ? 'tolerance' : ($points ? 'penalty' : (count($qualified)<$p['warning_count']?'warning':'cap'));
        $id=hash('sha256','exit:'.$d['session_id'].':'.$d['hidden_seq']);
        if(!SC_Code_Public_Store::get($id)){
            SC_Code_Public_Store::create('focus_exit',$e['id'],$s['owner'],['session_id'=>$d['session_id'],'team_id'=>$d['team_id'],'started_at'=>$d['hidden_at'],'returned_at'=>time(),'seconds'=>$seconds,'status'=>$status,'points'=>$points,'waived'=>false,'source'=>$d['hidden_source'] ?? 'page_visibility_client_reported','history'=>[]],$id);
            if($points>0 && !empty($d['team_id']))SC_Code_Public_Store::create('race_mark',$e['id'],$s['owner'],['type'=>'penalty','team_id'=>$d['team_id'],'exit_id'=>$id,'at'=>time(),'anchor'=>$this->race_team_points($e['id'],$d['team_id']),'points'=>$points],hash('sha256','race:penalty:'.$id));
        }
        $d['hidden_at']=null;$d['hidden_seq']=null;unset($d['hidden_source']);
        return SC_Code_Public_Store::save($s,$d,$s['version']);
    }
    private function ops_route(string $route,int $uid,array $v) {
        if($route==='monitor/accept') {
            $this->rate('watch:'.$uid,20,300);
            return SC_Code_Public_Store::transaction(function()use($uid,$v){
                $hash=hash('sha256',strtoupper(trim((string)($v['code'] ?? ''))));$found=null;
                foreach(SC_Code_Public_Store::list('watch_inv') as $i)if(hash_equals($i['data']['code_hash'],$hash)){$found=$i;break;}
                if(!$found || $found['data']['expires']<=time() || !empty($found['data']['revoked']))throw new RuntimeException('Convite de monitor inválido, expirado ou revogado.',404);
                $e=$this->event($found['parent'],SC_Code_Public_Store::get($found['parent'])['owner'],true,true);
                $found=$this->require_record($found['id'],'watch_inv');
                if(empty($found['data']['multi_use']) && !empty($found['data']['accepted_by']) && $found['data']['accepted_by']!==$uid)throw new RuntimeException('Este convite individual já foi usado por outra pessoa.',409);
                if(empty($v['confirm']))return ['event_title'=>$e['data']['title'],'event_id'=>$e['id'],'expires'=>$found['data']['expires']];
                $wd=['invitation_id'=>$found['id'],'accepted_at'=>time()];$key=hash('sha256','watch:'.$e['id'].':'.$uid);$old=SC_Code_Public_Store::get($key);
                if($old)SC_Code_Public_Store::save($old,$wd,$old['version']);else SC_Code_Public_Store::create('watch',$e['id'],$uid,$wd,$key);
                if(empty($found['data']['multi_use'])){$d=$found['data'];$d['accepted_by']=$uid;SC_Code_Public_Store::save($found,$d,$found['version']);}return ['event_id'=>$e['id']];
            });
        }
        if($route==='monitor/read' || $route==='monitor/attempt') {
            $e=$this->watch_access((string)($v['event_id'] ?? ''),$uid);
            if($route==='monitor/attempt'){$a=$this->require_record((string)($v['attempt_id'] ?? ''),'attempt');if($a['parent']!==$e['id'])throw new RuntimeException('Tentativa de outro evento.',403);return ['attempt'=>$a,'tests'=>$this->require_record($a['data']['challenge_id'],'challenge')['data']['tests']];}
            $members=$this->named_members($e['id']);$attempts=SC_Code_Public_Store::list('attempt',$e['id']);$exits=$this->focus_exits($e['id']);$students=[];
            foreach($members as $m){$mine=array_filter($attempts,fn($a)=>$a['owner']===$m['owner']);$s=SC_Code_Public_Store::get($this->focus_id($e['id'],$m['owner']));$myexits=array_values(array_filter($exits,fn($x)=>$x['owner']===$m['owner']));
                $students[]=['user_id'=>$m['owner'],'name'=>$m['name'],'team_id'=>$m['data']['team_id'] ?? '', 'joined_at'=>$m['data']['joined_at'],'started_at'=>$s['data']['started_at'] ?? (count($mine)?min(array_column(array_column($mine,'data'),'started_at')):null),'last_seen'=>$s['data']['last_seen'] ?? null,'hidden'=>!empty($s['data']['hidden_at']),'exits'=>$myexits,'attempts'=>array_values(array_map(fn($a)=>['id'=>$a['id'],'challenge_id'=>$a['data']['challenge_id'],'status'=>$a['data']['status'],'grade'=>$a['data']['grade'] ?? null,'started_at'=>$a['data']['started_at'],'submitted_at'=>$a['data']['submitted_at'] ?? null,'assessment_status'=>$a['data']['assessment']['status'] ?? null],$mine))];
            }
            $challenges=SC_Code_Public_Store::list('challenge',$e['id']);
            $out=['event'=>['id'=>$e['id'],'title'=>$e['data']['title'],'starts_at'=>$e['data']['starts_at'],'ends_at'=>$e['data']['ends_at'],'status'=>$e['data']['status'],'classroom_version'=>$e['data']['classroom_version'] ?? null],'teams'=>array_map(fn($t)=>['id'=>$t['id'],'name'=>$t['data']['name'],'roster'=>$t['data']['roster'] ?? []],SC_Code_Public_Store::list('team',$e['id'])),'challenges'=>array_map(fn($c)=>['id'=>$c['id'],'title'=>$c['data']['title']],$challenges),'students'=>$students,'server_now'=>time(),'can_manage'=>$this->event_editor($e,$uid),'can_invite'=>$this->event_admin($e,$uid)];
            if($this->event_admin($e,$uid)){$watches=SC_Code_Public_Store::list('watch',$e['id']);$out['invitations']=array_map(function($i)use($watches){unset($i['data']['code_hash']);$u=!empty($i['data']['accepted_by'])?get_user_by('id',$i['data']['accepted_by']):null;$i['data']['accepted_name']=$u?$u->display_name:null;$i['data']['accepted_names']=array_values(array_map(function($w){$p=get_user_by('id',$w['owner']);return $p?$p->display_name:'Monitor';},array_filter($watches,fn($w)=>($w['data']['invitation_id'] ?? '')===$i['id'])));return $i;},SC_Code_Public_Store::list('watch_inv',$e['id']));}
            return $out;
        }
        if($route==='focus/update')$this->rate('focus:'.$uid,120,60);
        if($route==='focus/ping')$this->rate('focusping:'.$uid,12,60);
        if($route==='focus/read'){$e=$this->event((string)($v['event_id'] ?? ''),$uid);$this->require_record($this->member_id($e['id'],$uid),'member');return $this->focus_public($e,SC_Code_Public_Store::get($this->focus_id($e['id'],$uid)),$uid);}
        $apply=function()use($route,$uid,$v){
            $owner=in_array($route,['event/settings','monitor/invite','monitor/revoke','focus/review'],true);
            $e=$this->event((string)($v['event_id'] ?? ''),$uid,$owner,$route!=='focus/ping');
            if(in_array($route,['monitor/invite','monitor/revoke'],true) && !$this->event_admin($e,$uid)) throw new RuntimeException('Somente quem administra o evento pode gerenciar convites.',403);
            if($route==='event/settings'){
                if(array_key_exists('finish_now',$v)){
                    if($v['finish_now']!==true)throw new InvalidArgumentException('Confirme o encerramento do evento.');
                    if($e['data']['status']!=='published')throw new RuntimeException('Somente eventos publicados podem ser encerrados.',409);
                    $now=time();$d=$e['data'];
                    if(!empty($d['starts_at']) && strtotime($d['starts_at'])>$now)throw new RuntimeException('O evento ainda não começou.',409);
                    if(!empty($d['ends_at']) && strtotime($d['ends_at'])<=$now)throw new RuntimeException('O evento já está encerrado.',409);
                    $end=gmdate('c',$now);$d['settings_history'][]=['by'=>$uid,'at'=>$now,'action'=>'finish_now','previous_end'=>$d['ends_at'] ?? '','ends_at'=>$end];
                    $d['ends_at']=$end;$d['schedule_updated_at']=$now;
                    $saved=SC_Code_Public_Store::save($e,$d,(int)($v['version'] ?? 0));
                    SC_Code_Public_Store::create('audit',$e['id'],$uid,['message'=>'Evento encerrado pelo professor. Novas entregas estão encerradas; as avaliações pendentes continuam disponíveis.','at'=>$now]);return $saved;
                }
                if(array_key_exists('evaluators',$v)){
                    $policy=SC_Code_Public_AI::evaluator_policy($v['evaluators']);$d=$e['data'];
                    $d['settings_history'][]=['by'=>$uid,'at'=>time(),'previous_evaluators'=>$d['evaluators'] ?? null,'evaluators'=>$policy];
                    $d['evaluators']=$policy;
                    $saved=SC_Code_Public_Store::save($e,$d,(int)($v['version'] ?? 0));
                    SC_Code_Public_Store::create('audit',$e['id'],$uid,['message'=>'Modelos de avaliação atualizados. A mudança vale para novas entregas; as dicas continuam usando o modelo escolhido pelo aluno.','at'=>time()]);return $saved;
                }
                if(array_key_exists('monitoring_enabled',$v)){
                    if(!is_bool($v['monitoring_enabled']))throw new InvalidArgumentException('Escolha ativar ou desativar o acompanhamento.');
                    $previous=$this->focus_policy($e);$d=$e['data'];$next=$previous;$next['enabled']=$v['monitoring_enabled'];
                    if($next['enabled'] && !$previous['enabled']){$next['version']=3;$next['fullscreen_exits']=true;$next['focus_exits']=true;}
                    if($next!==$previous){
                        foreach(SC_Code_Public_Store::list('focus',$e['id']) as $session){
                            if(empty($session['data']['active']))continue;
                            $session=$this->settle_focus($e,$session);$sd=$session['data'];$sd['active']=false;SC_Code_Public_Store::save($session,$sd,$session['version']);
                        }
                        $d['settings_history'][]=['by'=>$uid,'at'=>time(),'monitoring_before'=>$previous['enabled'],'monitoring_enabled'=>$next['enabled']];
                    }
                    $d['focus_policy']=$next;$saved=SC_Code_Public_Store::save($e,$d,(int)($v['version'] ?? 0));
                    SC_Code_Public_Store::create('audit',$e['id'],$uid,['message'=>$next['enabled']?'Acompanhamento de saídas ativado. Leia e aceite as regras antes de participar.':'Acompanhamento de saídas desativado pelo professor. Registros anteriores preservados.','at'=>time()]);return $saved;
                }

                if($e['data']['status']!=='draft'){
                    $d=$e['data'];$title=trim(sanitize_text_field($v['title'] ?? $d['title']));if(!$title || mb_strlen($title)>200)throw new InvalidArgumentException('Confira o título do evento.');
                    $schedule=$this->event_schedule($v,$d);
                    $changed=$schedule['starts_at']!==($d['starts_at'] ?? '') || $schedule['ends_at']!==($d['ends_at'] ?? '');
                    $d['title']=$title;$d['description']=sanitize_textarea_field($v['description'] ?? $d['description']);
                    $d['settings_history'][]=['by'=>$uid,'at'=>time(),'previous_start'=>$d['starts_at'] ?? '','previous_end'=>$d['ends_at'] ?? '']+$schedule;
                    $d=array_merge($d,$schedule);if(array_key_exists('level_labels',$v))$d['level_labels']=$this->category_labels($v['level_labels']);if($changed)$d['schedule_updated_at']=time();
                    $saved=SC_Code_Public_Store::save($e,$d,(int)($v['version'] ?? 0));SC_Code_Public_Store::create('audit',$e['id'],$uid,['message'=>$changed?($schedule['ends_at']?'Horários do evento atualizados pelo professor. Confira o novo término no contador do evento.':'Horários do evento atualizados pelo professor. O evento está sem prazo de término.'):'Dados do evento atualizados pelo professor.','at'=>time()]);return $saved;
                }
                $d=array_merge($e['data'],$this->ops_settings($v));if(isset($v['points'])){foreach(['easy','medium','hard'] as $k)if(!is_int($v['points'][$k] ?? null)||$v['points'][$k]<1||$v['points'][$k]>100)throw new InvalidArgumentException('Pontos de 1 a 100.');$d['points']=$v['points'];}$d['title']=trim(sanitize_text_field($v['title'] ?? $d['title']));if(!$d['title'])throw new InvalidArgumentException('Informe o título.');$d['description']=sanitize_textarea_field($v['description'] ?? $d['description']);return SC_Code_Public_Store::save($e,$d,(int)($v['version'] ?? 0));
            }
            if($route==='monitor/invite'){$code=strtoupper(bin2hex(random_bytes(6)));$i=SC_Code_Public_Store::create('watch_inv',$e['id'],$uid,['code_hash'=>hash('sha256',$code),'expires'=>time()+7*DAY_IN_SECONDS,'accepted_by'=>null,'multi_use'=>true,'revoked'=>false]);return ['code'=>$code,'id'=>$i['id'],'expires'=>$i['data']['expires']];}
            if($route==='monitor/revoke'){$i=$this->require_record((string)($v['id'] ?? ''),'watch_inv');if($i['parent']!==$e['id'])throw new RuntimeException('Convite de outro evento.',403);$d=$i['data'];$d['revoked']=true;return SC_Code_Public_Store::save($i,$d,(int)($v['version'] ?? 0));}
            if($route==='focus/review'){
                $x=$this->require_record((string)($v['id'] ?? ''),'focus_exit');$reason=trim(sanitize_textarea_field($v['reason'] ?? ''));
                if($x['parent']!==$e['id'] || !$reason || !is_bool($v['waived'] ?? null))throw new InvalidArgumentException('Escolha a ocorrência deste evento e explique o motivo da revisão.');
                if($x['data']['waived']===$v['waived'])return $x;
                $d=$x['data'];$d['waived']=$v['waived'];$d['history'][]=['by'=>$uid,'at'=>time(),'reason'=>mb_substr($reason,0,1000),'waived'=>$d['waived']];return SC_Code_Public_Store::save($x,$d,(int)($v['version'] ?? 0));
            }
            $this->require_record($this->member_id($e['id'],$uid),'member');$p=$this->focus_policy($e);$s=SC_Code_Public_Store::get($this->focus_id($e['id'],$uid));
            if($route==='focus/begin'){
                $this->open($e);if(!$this->focus_stage_ready($e,$uid))throw new RuntimeException('O acompanhamento começa na fase oficial, após o professor encerrar o aquecimento e liberar sua equipe.',409);$team=$this->game_team($e,$uid);$this->team_ready($e,$team);
                if(!$p['enabled'])return $this->focus_public($e,null,$uid);
                if(($v['accepted_version'] ?? null)!==$p['version'] || ($v['platform'] ?? '')!=='web')throw new InvalidArgumentException('Leia e aceite as regras no navegador do computador para começar.');
                $client=(string)($v['client_id'] ?? '');if(!preg_match('/^[a-zA-Z0-9-]{12,80}$/',$client))throw new InvalidArgumentException('Reabra a página para iniciar uma sessão válida.');
                if($s && !$this->focus_session_current($e,$s)){$sd=$s['data'];$sd['active']=false;$sd['hidden_at']=null;$sd['hidden_seq']=null;unset($sd['hidden_source']);$s=SC_Code_Public_Store::save($s,$sd,$s['version']);}
                if($s && $s['data']['active'] && $s['data']['client_id']!==$client && empty($v['takeover']))throw new RuntimeException('Sua participação está aberta em outra aba ou navegador. Use Retomar aqui para encerrar a sessão anterior.',409);
                if($s && !empty($s['data']['hidden_at']))$s=$this->settle_focus($e,$s);
                $d=$s ? $s['data'] : ['started_at'=>time(),'accepted_version'=>$p['version'],'accepted_at'=>time(),'team_id'=>$team];
                if(!$s || $d['client_id']!==$client || !$d['active'] || ($d['accepted_version'] ?? 0)!==$p['version']){$d['session_id']=wp_generate_uuid4();$d['seq']=0;}
                $d['official_started_at']=$e['data']['warmup_ended_at'] ?? 0;$d['accepted_version']=$p['version'];$d['accepted_at']=time();$d['client_id']=$client;$d['active']=true;$d['hidden_at']=null;$d['last_seen']=time();
                $s=$s ? SC_Code_Public_Store::save($s,$d,$s['version']) : SC_Code_Public_Store::create('focus',$e['id'],$uid,$d,$this->focus_id($e['id'],$uid));return $this->focus_public($e,$s,$uid);
            }
            if(!$this->focus_stage_ready($e,$uid) || !$this->focus_session_current($e,$s))throw new RuntimeException('O acompanhamento está disponível apenas na fase oficial para equipes liberadas. Atualize o evento.',409);
            if(!$p['enabled'])throw new RuntimeException('O acompanhamento foi desativado pelo professor. Atualize o evento.',409);
            if(!$s || ($s['data']['accepted_version'] ?? 0)!==$p['version'] || !hash_equals($s['data']['session_id'],(string)($v['session_id'] ?? '')) || !$s['data']['active'])throw new RuntimeException('Esta sessão foi encerrada ou substituída. Volte às Regras para retomar.',409);
            $d=$s['data'];$action=$v['action'] ?? '';
            if($route==='focus/ping'){
                $now=time();
                if($now-(int)($d['last_seen'] ?? 0)>=45){
                    global $wpdb;
                    // Touch presence only. A concurrent focus change wins and already records its own time.
                    $updated=$wpdb->query($wpdb->prepare(
                        "UPDATE ".SC_Code_Public_Store::table()." SET data=JSON_SET(data,'$.last_seen',%d) WHERE rid=%s AND version=%d",
                        $now,$s['id'],$s['version']
                    ));
                    if($updated===false)throw new RuntimeException('Não foi possível atualizar a presença.',503);
                }
                return ['server_now'=>$now];
            }
            if($route==='focus/end'){if(empty($e['data']['ends_at']) || time()<strtotime($e['data']['ends_at']))throw new RuntimeException('O acompanhamento permanece ativo. O professor pode definir o término ou desativar o acompanhamento.',409);$s=$this->settle_focus($e,$s);$d=$s['data'];$d['active']=false;$s=SC_Code_Public_Store::save($s,$d,$s['version']);return $this->focus_public($e,$s,$uid);}
            if($route!=='focus/update' || !in_array($action,['hidden','visible'],true) || !is_int($v['seq'] ?? null))throw new InvalidArgumentException('Ocorrência de visibilidade inválida.');
            if($v['seq']<=$d['seq'])return $this->focus_public($e,$s,$uid);
            if($v['seq']!==$d['seq']+1)throw new RuntimeException('Aguardando o registro anterior. Use Sincronizar ocorrências.',409);
            $source=$v['source'] ?? 'page_visibility_client_reported';
            if(!in_array($source,['page_visibility_client_reported','fullscreen_client_reported','window_focus_client_reported'],true))throw new InvalidArgumentException('Origem de saída inválida.');
            if($action==='hidden' && $source==='fullscreen_client_reported' && empty($p['fullscreen_exits']))throw new InvalidArgumentException('Este evento acompanha apenas a visibilidade da página.');
            if($action==='hidden' && $source==='window_focus_client_reported' && empty($p['focus_exits']))throw new InvalidArgumentException('Este evento não acompanha perda de foco isolada.');
            if($action==='hidden' && empty($d['hidden_at']) && (empty($e['data']['ends_at']) || time()<strtotime($e['data']['ends_at']))) {$d['hidden_at']=time();$d['hidden_seq']=$v['seq'];$d['hidden_source']=$source;}
            if($action==='visible'){$s=$this->settle_focus($e,$s);$d=$s['data'];}
            $d['seq']=$v['seq'];$d['last_seen']=time();$s=SC_Code_Public_Store::save($s,$d,$s['version']);return $this->focus_public($e,$s,$uid);
        };
        return $route==='focus/ping' ? $apply() : SC_Code_Public_Store::transaction($apply);
    }
}
