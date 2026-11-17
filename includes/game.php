<?php
// Product contract: web-src/spec/code-public.md. SQL is canonical.
trait SC_Code_Public_Game {
    private function team_ops(int $uid,array $v): array {
        // Polling is read-only. Do not serialize every student's inbox with
        // reservations and submissions on the shared event row.
        if (($v['action'] ?? 'list')==='list') {
            $e=$this->event((string)($v['event_id'] ?? ''),$uid);$editor=$this->event_editor($e,$uid);
            return ['requests'=>array_values(array_filter(SC_Code_Public_Store::list('request',$e['id']),fn($r)=>$r['data']['status']==='pending' && ($editor || $r['data']['holder']===$uid || $r['owner']===$uid))),'penalties'=>$editor?array_map(function($p){$u=get_user_by('id',$p['owner']);$p['data']['name']=$u?$u->display_name:'Aluno';return $p;},SC_Code_Public_Store::list('integrity',$e['id'])):[],'updates'=>SC_Code_Public_Store::list('audit',$e['id'])];
        }
        return SC_Code_Public_Store::transaction(function()use($uid,$v){
            $e=$this->event((string)($v['event_id'] ?? ''),$uid,false,true);$editor=$this->event_editor($e,$uid);$action=$v['action'] ?? 'list';
            if(in_array($action,['program','roster','approve_team','claim_team'],true))return $this->classroom_ops($e,$uid,$v);
            $member=SC_Code_Public_Store::get($this->member_id($e['id'],$uid));$team=$member['data']['team_id'] ?? '';
            if($action==='penalty'){
                if(!$editor)throw new RuntimeException('Somente professor pode revisar.',403);
                $r=$this->require_record((string)($v['id'] ?? ''),'integrity');$reason=trim(sanitize_textarea_field($v['reason'] ?? ''));
                if($r['parent']!==$e['id'] || !$reason || !is_bool($v['waived'] ?? null))throw new InvalidArgumentException('Explique a revisão.');
                $d=$r['data'];$d['waived']=$v['waived'];$d['history'][]=['by'=>$uid,'at'=>time(),'reason'=>$reason,'waived'=>$d['waived']];return SC_Code_Public_Store::save($r,$d,(int)$v['version']);
            }
            if(in_array($action,['suspend','rename','reactivate'],true)){
                $t=$this->require_record((string)($v['team_id'] ?? ''),'team');if($t['parent']!==$e['id'] || (!$editor && ($action!=='rename' || $team!==$t['id'])))throw new RuntimeException('Sem acesso a esta equipe.',403);
                $d=$t['data'];if($action==='suspend'){$d['suspended']=true;$d['reason']=trim(sanitize_textarea_field($v['reason'] ?? 'Troque o nome da equipe e peça ao professor para reativar.'));}
                else {if($action==='rename'){$name=trim(sanitize_text_field($v['name'] ?? ''));if(!$name || mb_strlen($name)>60)throw new InvalidArgumentException('Nome de 1 a 60 caracteres.');foreach(SC_Code_Public_Store::list('team',$e['id']) as $other)if($other['id']!==$t['id'] && mb_strtolower($other['data']['name'])===mb_strtolower($name))throw new InvalidArgumentException('Nome já utilizado.');$d['name']=$name;$d['rename_requested']=true;}else{if(!empty($d['suspended']) && empty($d['rename_requested']))throw new RuntimeException('Peça a troca do nome antes de reativar.',409);$d['suspended']=false;$d['rename_requested']=false;}}
                $d['history'][]=['by'=>$uid,'at'=>time(),'action'=>$action];return SC_Code_Public_Store::save($t,$d,(int)$v['version']);
            }
            if($action==='peek'){
                if(!$team)throw new RuntimeException('Escolha uma equipe.',403);$cid=(string)($v['challenge_id'] ?? '');$c=SC_Code_Public_Store::get($this->claim_id($team,$cid));
                $a=$c?SC_Code_Public_Store::get($c['data']['attempt_id']):null;
                $shared=SC_Code_Public_Store::get(hash('sha256','shared:'.$team.':'.$cid));return ['code'=>$a['data']['code'] ?? $shared['data']['code'] ?? '', 'language'=>$a['data']['language'] ?? $shared['data']['language'] ?? 'python'];
            }
            if($action==='request'){
                $this->open($e);$this->team_ready($e,$team);$c=$this->require_record((string)($v['claim_id'] ?? ''),'claim');$a=$this->require_record($c['data']['attempt_id'],'attempt');
                if($c['parent']!==$e['id'] || $c['data']['team_id']!==$team || $c['owner']===$uid || $a['data']['status']!=='working')throw new RuntimeException('Esta reserva não pode ser solicitada.',409);
                $id=hash('sha256','request:'.$c['id'].':'.$a['id'].':'.($c['data']['lease'] ?? '').':'.$uid);$old=SC_Code_Public_Store::get($id);if($old)return $old;
                $u=get_user_by('id',$uid);$ch=$this->require_record($c['data']['challenge_id'],'challenge');return SC_Code_Public_Store::create('request',$e['id'],$uid,['claim_id'=>$c['id'],'attempt_id'=>$a['id'],'holder'=>$c['owner'],'lease'=>$c['data']['lease'] ?? '','team_id'=>$team,'challenge'=>$ch['data']['title'],'name'=>$u?$u->display_name:'Colega','status'=>'pending','at'=>time()],$id);
            }
            $r=$this->require_record((string)($v['id'] ?? ''),'request');if($r['parent']!==$e['id'] || (!$editor && $r['data']['holder']!==$uid))throw new RuntimeException('Sem acesso ao pedido.',403);
            if(!in_array($action,['accept','decline'],true))throw new InvalidArgumentException('Ação inválida.');if($r['data']['status']!=='pending')return $r;
            $c=SC_Code_Public_Store::get($r['data']['claim_id']);$a=$c?SC_Code_Public_Store::get($c['data']['attempt_id']):null;$rd=$r['data'];
            if(!$a || ($c['data']['lease'] ?? '')!==($rd['lease'] ?? '') || $a['id']!==$rd['attempt_id'] || $a['data']['status']!=='working')$rd['status']='obsolete';
            elseif($action==='accept'){$this->share_draft($a);$d=$a['data'];$d['status']='paused';SC_Code_Public_Store::save($a,$d,$a['version']);SC_Code_Public_Store::remove($c['id']);$rd['status']='accepted';}
            else $rd['status']='declined';$rd['by']=$uid;$rd['resolved_at']=time();return SC_Code_Public_Store::save($r,$rd,$r['version']);
        });
    }
    private function share_draft(array $a): void {
        $d=$a['data'];$id=hash('sha256','shared:'.$d['team_id'].':'.$d['challenge_id']);$old=SC_Code_Public_Store::get($id);$copy=['team_id'=>$d['team_id'],'challenge_id'=>$d['challenge_id'],'code'=>$d['code'],'language'=>$d['language'],'author'=>$a['owner'],'at'=>time()];
        if($old)SC_Code_Public_Store::save($old,$copy,$old['version']);else SC_Code_Public_Store::create('shared',$a['parent'],$a['owner'],$copy,$id);
    }
    private function named_members(string $event): array {
        $members=SC_Code_Public_Store::list('member',$event);
        if (function_exists('cache_users')) cache_users(array_map(fn($m)=>$m['owner'],$members));
        foreach ($members as &$m) { $u=get_user_by('id',$m['owner']); $m['name']=$u ? $u->display_name : 'Participante'; }
        return $members;
    }
    private function claim_id(string $team,string $challenge): string { return hash('sha256','claim:'.$team.':'.$challenge); }
    private function game_team(array $e,int $uid): string {
        $m=SC_Code_Public_Store::get($this->member_id($e['id'],$uid));
        $team=$m['data']['team_id'] ?? ''; $t=$team ? SC_Code_Public_Store::get($team) : null;
        if (!$t || $t['kind']!=='team' || $t['parent']!==$e['id']) { throw new RuntimeException('Escolha sua equipe na aba Eventos antes de resolver.',409); }
        return $team;
    }
    private function game_claim(array $a): array {
        $c=SC_Code_Public_Store::get($this->claim_id($a['data']['team_id'],$a['data']['challenge_id']));
        if (!$c || $c['data']['attempt_id']!==$a['id']) { throw new RuntimeException('A reserva foi liberada. Atualize os desafios antes de continuar.',409); }
        return $c;
    }
    private function game_detail(array $e,int $uid,bool $own): array {
        $members=$this->named_members($e['id']); $teams=SC_Code_Public_Store::list('team',$e['id']);
        $focused=SC_Code_Public_Store::owners('focus',$e['id']);
        $my=SC_Code_Public_Store::get($this->member_id($e['id'],$uid)); $team=$my['data']['team_id'] ?? '';
        foreach($teams as &$t){if(!$own && !empty($t['data']['suspended']))$t['data']['name']='Equipe suspensa';$t['data']['invite_required']=!empty($e['data']['self_teams']) || $t['owner']!==$e['owner'];if(!$own && $t['id']!==$team)unset($t['data']['invite']);}unset($t);
        $claims=SC_Code_Public_Store::list('claim',$e['id']);
        $claims=array_values(array_filter($claims,fn($c)=>$own || $c['data']['team_id']===$team));
        foreach($claims as &$c) { $u=get_user_by('id',$c['owner']); $c['data']['name']=$u ? $u->display_name : 'Participante'; $a=SC_Code_Public_Store::get($c['data']['attempt_id']); $c['data']['status']=$a['data']['status'] ?? 'working'; }
        return ['teams'=>$teams,'members'=>array_map(fn($m)=>['user_id'=>$m['owner'],'name'=>$m['name'],'team_id'=>$m['data']['team_id'] ?? '', 'team_locked'=>isset($focused[$m['owner']])],$members),'my_team_id'=>$team,'claims'=>$claims];
    }
    private function game_route(string $route,int $uid,array $v,$r) {
        if ($route==='event/upgrade') {
            return SC_Code_Public_Store::transaction(function() use($uid,$v) {
                $e=$this->event((string)($v['event_id'] ?? ''),$uid,true,true);
                if ($e['data']['status']!=='draft' || SC_Code_Public_Store::list('attempt',$e['id'])) throw new RuntimeException('Somente rascunhos sem tentativas podem mudar de formato.',409);
                if (($v['confirmation'] ?? '')!==$e['data']['title']) throw new InvalidArgumentException('Confirme o título do evento antes de mudar de formato.');
                $points=$v['points'] ?? null;
                if (!is_array($points)) throw new InvalidArgumentException('Informe os pontos das três dificuldades.');
                foreach(['easy','medium','hard'] as $level) if (!is_int($points[$level] ?? null) || $points[$level]<1 || $points[$level]>100) throw new InvalidArgumentException('Use pontos inteiros entre 1 e 100.');
                $d=$e['data']; $d['teams_mode']=true; $d['validation']='ai_local'; $d['points']=$points; $d['boost_seq']=0;
                return SC_Code_Public_Store::save($e,$d,(int)($v['version'] ?? 0));
            });
        }
        if ($route==='teams' || $route==='teams/invite' || $route==='teams/join' || $route==='claims/release') {
            return SC_Code_Public_Store::transaction(function() use($route,$uid,$v) {
                $eid=(string)($v['event_id'] ?? '');
                if($route==='teams/join' && !empty($v['code'])) {
                    $this->rate('teamjoin:'.$uid,20,300);$code=strtoupper(trim((string)$v['code']));$inviteTeam=null;
                    foreach(SC_Code_Public_Store::list('team',$eid ?: null) as $t)if(!empty($t['data']['invite']) && hash_equals($t['data']['invite'],$code)){$inviteTeam=$t;break;}
                    if(!$inviteTeam)throw new RuntimeException('Código de time inválido. Confira o convite.',404);
                    $eid=$inviteTeam['parent'];$this->may_switch_event($uid,$eid);$ev=$this->require_record($eid,'event');if($ev['data']['status']!=='published')throw new RuntimeException('Este evento ainda não está publicado.',409);
                    // A valid private invite grants enrollment only after an explicit confirmation.
                    if(empty($v['confirm']))return ['event_id'=>$eid,'event_title'=>$ev['data']['title'],'team_name'=>$inviteTeam['data']['name']];
                    $mid=$this->member_id($eid,$uid);if(!SC_Code_Public_Store::get($mid))SC_Code_Public_Store::create('member',$eid,$uid,['joined_at'=>time()],$mid);
                    $v['team_id']=$inviteTeam['id'];update_user_meta($uid,'sc_code_public_active',$eid);
                }
                $e=$this->event($eid,$uid,$route==='claims/release',true);
                if (empty($e['data']['teams_mode'])) { throw new RuntimeException('Este evento usa o formato individual anterior.',409); }
                if($this->classroom($e) && in_array($route,['teams/invite','teams/join'],true))throw new RuntimeException('Este evento usa um computador por equipe. Cadastre os nomes em Minha equipe.',409);
                if($route==='teams/invite'){
                    $team=$this->require_record((string)($v['team_id'] ?? ''),'team');
                    if($team['parent']!==$e['id'] || (!$this->event_editor($e,$uid) && $this->game_team($e,$uid)!==$team['id']))throw new RuntimeException('Somente integrantes deste time ou o professor podem obter seu convite.',403);
                    if(!empty($team['data']['suspended']))throw new RuntimeException('Equipe suspensa.',409);if(empty($team['data']['invite'])){$td=$team['data'];$td['invite']=strtoupper(bin2hex(random_bytes(6)));$team=SC_Code_Public_Store::save($team,$td,$team['version']);}return $team;
                }
                if ($route==='teams') {
                    $name=sanitize_text_field($v['name'] ?? '');
                    if (!$name || mb_strlen($name)>60) { throw new InvalidArgumentException('Informe um nome de equipe de até 60 caracteres.'); }
                    $teams=SC_Code_Public_Store::list('team',$e['id']);
                    // In classroom events even a teacher creates their own participant team.
                    $self=$this->classroom($e) || !$this->event_editor($e,$uid);
                    if($self && ($e['data']['self_teams'] ?? true)===false)throw new RuntimeException('Neste evento as equipes são organizadas pelo professor.',403);
                    $member=$self ? $this->require_record($this->member_id($e['id'],$uid),'member') : null;
                    if($self && (!empty($member['data']['team_id']) || SC_Code_Public_Store::list('attempt',$e['id'],$uid)))throw new RuntimeException('Você já tem um time ou uma tentativa neste evento.',409);
                    if(!empty($e['data']['ends_at']) && strtotime($e['data']['ends_at'])<=time())throw new RuntimeException('O evento já terminou.',409);
                    foreach($teams as $t) if(mb_strtolower($t['data']['name'])===mb_strtolower($name)) throw new InvalidArgumentException('Já existe uma equipe com esse nome.');
                    $t=SC_Code_Public_Store::create('team',$e['id'],$uid,['name'=>$name,'roster'=>[get_user_by('id',$uid)->display_name],'approved'=>false,'invite'=>strtoupper(bin2hex(random_bytes(6)))]);
                    if($member){$d=$member['data'];$d['team_id']=$t['id'];SC_Code_Public_Store::save($member,$d,$member['version']);}return $t;
                }
                if ($route==='teams/join') {
                    $target=(int)($v['user_id'] ?? $uid);
                    if ($target!==$uid) $this->event($e['id'],$uid,true);
                    $m=$this->require_record($this->member_id($e['id'],$target),'member');
                    $team=$this->require_record((string)($v['team_id'] ?? ''),'team');
                    if(!empty($team['data']['suspended']))throw new RuntimeException('Equipe suspensa.',409);if ($team['parent']!==$e['id']) throw new RuntimeException('Equipe de outro evento.',403);
                    if (($m['data']['team_id'] ?? '')===$team['id']) return $m+['event_id'=>$e['id']];
                    if(!empty($e['data']['ends_at']) && strtotime($e['data']['ends_at'])<=time())throw new RuntimeException('O evento já terminou.',409);
                    if((!empty($e['data']['self_teams']) || $team['owner']!==$e['owner']) && !$this->event_editor($e,$uid) && empty($inviteTeam))throw new RuntimeException('Use o código ou link de convite do time.',403);
                    if(!empty($inviteTeam) && !empty($m['data']['team_id']))throw new RuntimeException('Você já pertence a outro time. Peça ajuda ao professor.',409);
                    $max=$e['data']['team_max'] ?? null;$n=count(array_filter(SC_Code_Public_Store::list('member',$e['id']),fn($p)=>($p['data']['team_id'] ?? '')===$team['id']));
                    if($max!==null && $n>=$max)throw new RuntimeException('Este time atingiu o limite de integrantes.',409);
                    if (SC_Code_Public_Store::list('attempt',$e['id'],$target) || SC_Code_Public_Store::get($this->focus_id($e['id'],$target))) throw new RuntimeException('O time fica preservado depois de iniciar a participação ou a primeira tentativa.',409);
                    $d=$m['data']; $d['team_id']=$team['id']; return SC_Code_Public_Store::save($m,$d,$m['version'])+['event_id'=>$e['id']];
                }
                $claim=$this->require_record((string)($v['claim_id'] ?? ''),'claim');
                if ($claim['parent']!==$e['id'] || ($v['confirmation'] ?? '')!==$claim['id']) throw new InvalidArgumentException('Confirme a reserva que deseja liberar.');
                $a=$this->require_record($claim['data']['attempt_id'],'attempt');
                if ($a['data']['status']!=='working') throw new RuntimeException('Somente uma tentativa em andamento pode ser liberada.',409);
                $this->share_draft($a);$d=$a['data']; $d['status']='paused';
                SC_Code_Public_Store::save($a,$d,$a['version']); SC_Code_Public_Store::remove($claim['id']); return ['ok'=>true];
            });
        }
        if ($route==='assessment') {
            return SC_Code_Public_Store::transaction(function() use($uid,$v) {
                $a=$this->require_record((string)($v['attempt_id'] ?? ''),'attempt');
                $e=$this->event($a['parent'],$uid,false,true);
                if ($a['owner']!==$uid) throw new RuntimeException('Esta entrega pertence a outro aluno.',403);
                if ($a['version']!==(int)($v['version'] ?? 0) || $a['data']['status']!=='submitted') throw new RuntimeException('A entrega mudou. Atualize para continuar.',409);
                $this->team_ready($e,$a['data']['team_id']);$this->game_claim($a); $d=$a['data']; $x=$d['assessment'] ?? null;
                if (!$x) throw new RuntimeException('Esta entrega não tem avaliação automática.',409);
                if(!empty($x['queued']))throw new RuntimeException('Esta entrega está na fila do professor e permanece preservada.',409);
                $action=$v['action'] ?? '';
                if ($action==='withdraw') {
                    if (!empty($x['effective']) || ($x['status'] ?? '')==='completed') throw new RuntimeException('Esta avaliação já foi concluída. Atualize para consultar o resultado.',409);
                    return $this->game_restore_draft($a,$d,$x,'Avaliação interrompida pelo aluno.');
                } elseif ($action==='resume') {
                    $previous=$x['run_id']; $x['run_id']=wp_generate_uuid4(); $x['previous_run_id']=$previous;
                    $x['status']='running'; $x['error_repair']=null;
                    $step=!empty($x['evidence']) ? 'ai_review' : 'execute';
                    $x=$this->game_progress($x,$step,'running','Avaliação retomada.');
                } else {
                    if (($v['run_id'] ?? '')!==$x['run_id'] || $x['status']!=='running') throw new RuntimeException('Esta execução já foi substituída. Atualize a entrega.',409);
                    if ($action==='evidence') {
                        if ($x['current_step_id']!=='execute') throw new RuntimeException('Os testes desta execução já foram registrados.',409);
                        $c=$this->require_record($d['challenge_id'],'challenge'); $items=$v['results'] ?? null;
                        if (!is_array($items) || count($items)!==count($c['data']['tests']) || !$items || strlen(wp_json_encode($items))>200000) throw new InvalidArgumentException('Envie um resultado para cada teste do desafio.');
                        $out=[];
                        foreach ($items as $i=>$item) {
                            if (!is_array($item) || !is_string($item['output'] ?? null) || !is_int($item['exit_code'] ?? null) || !is_string($item['engine'] ?? null) || strlen($item['engine'])>80 || (isset($item['error']) && !is_string($item['error']))) throw new InvalidArgumentException('Resultado de teste inválido. Execute novamente.');
                            $out[]=['output'=>$item['output'],'error'=>mb_substr($item['error'] ?? '',0,2000),'exit_code'=>$item['exit_code'],'engine'=>$item['engine'],'passed'=>false];
                        }
                        foreach($out as $i=>&$result)$result=SC_Code_Public_Comparison::result($c['data'],$c['data']['tests'][$i],$result);unset($result);
                        $x['evidence']=['source'=>'client_reported','code_hash'=>$x['code_hash'],'items'=>$out,'at'=>time()];
                        $d['results']=$x['evidence']; $d['runs']++;
                        $x=$this->game_progress($x,'ai_review','running','Testes recebidos. Aguardando a análise da IA.');
                    } elseif ($action==='fail') {
                        $message=mb_substr(sanitize_text_field($v['message'] ?? 'Avaliação interrompida. Continue ou solicite revisão.'),0,400);
                        $x=$this->game_progress($x,$x['current_step_id'],'needs_attention',$message);
                        $x['error_repair']=['title'=>'Avaliação pendente','summary'=>$message,'user_message'=>$message,'blocking_issues'=>[$message],'repair_prompt'=>'Retomar a mesma entrega congelada, preservando evidências e verificando suas versões.','evidence_files'=>[],'evidence_records'=>[$a['id']],'updated_at'=>gmdate('c')];
                        return $this->game_restore_draft($a,$d,$x,$message);
                    } else throw new InvalidArgumentException('Ação de avaliação inválida.');
                }
                $d['assessment']=$x; return SC_Code_Public_Store::save($a,$d,$a['version']);
            });
        }
        throw new RuntimeException('Ação indisponível.',404);
    }
    private function game_restore_draft(array $a,array $d,array $x,string $message): array {
        $x=$this->game_progress($x,$x['current_step_id'],'needs_attention',$message);
        $x['withdrawn_at']=gmdate('c');$x['submitted_code']=$d['code'];$x['submitted_language']=$d['language'];
        $d['assessment_history'][]=$x;
        $id=$x['marker_id'] ?? '';if($id){$mark=SC_Code_Public_Store::get($id);if(!$mark || $mark['kind']!=='race_mark' || $mark['parent']!==$a['parent'] || ($mark['data']['attempt_id'] ?? '')!==$a['id'])throw new RuntimeException('Não foi possível confirmar a entrega interrompida.',409);$m=$mark['data'];$m['status']='interrupted';$m['awarded']=0;SC_Code_Public_Store::save($mark,$m,$mark['version']);}
        $d['status']='working';unset($d['assessment'],$d['submitted_at'],$d['submitted_hash'],$d['grade'],$d['feedback'],$d['validated_hash']);
        return SC_Code_Public_Store::save($a,$d,$a['version']);
    }
    private function game_progress(array $x,?string $step,string $status,string $message): array {
        $past=true;
        foreach ($x['steps'] as &$s) {
            if ($s['id']===$step) { $past=false; $s['status']=$status==='needs_attention' ? 'error' : 'active'; }
            else $s['status']=$step===null || $past ? 'done' : 'pending';
        }
        $x['current_step_id']=$step; $x['status']=$status; $x['message']=$message; $x['updated_at']=gmdate('c'); return $x;
    }
    // These markers are historical display anchors, never the scoring source.
    private function race_team_points(string $event,string $team): int {
        $earned=0;foreach(SC_Code_Public_Store::list('credit',$event) as $c)if(($c['data']['team_id'] ?? '')===$team)$earned+=(int)($c['data']['points'] ?? 0);
        $penalty=0;foreach(array_merge(SC_Code_Public_Store::list('focus_exit',$event),SC_Code_Public_Store::list('integrity',$event)) as $x)if(($x['data']['team_id'] ?? '')===$team && empty($x['data']['waived']))$penalty+=(int)($x['data']['points'] ?? 0);
        return max(0,$earned-$penalty);
    }
    private function race_submission_marker(array $e,array $a,array $c,array &$d): void {
        $run=$d['assessment']['run_id'];$id=hash('sha256','race:submission:'.$a['id'].':'.$run);
        $ids=array_column(SC_Code_Public_Store::list('challenge',$e['id']),'id');$index=array_search($c['id'],$ids,true);
        SC_Code_Public_Store::create('race_mark',$e['id'],$a['owner'],['type'=>'submission','team_id'=>$d['team_id'],'attempt_id'=>$a['id'],'challenge_id'=>$c['id'],'challenge'=>$c['data']['title'],'number'=>$index===false?null:$index+1,'at'=>time(),'anchor'=>$this->race_team_points($e['id'],$d['team_id']),'possible'=>!empty($d['warmup'])?0:(int)$e['data']['points'][$c['data']['level']],'awarded'=>0,'status'=>'submitted'],$id);
        $d['assessment']['marker_id']=$id;
    }
    private function race_update_marker(array $e,array $a,array $d,array $c,bool $approved): void {
        $id=$d['assessment']['marker_id'] ?? '';if(!$id)return;
        $mark=SC_Code_Public_Store::get($id);if(!$mark || $mark['kind']!=='race_mark' || $mark['parent']!==$e['id'] || ($mark['data']['attempt_id'] ?? '')!==$a['id'])throw new RuntimeException('Não foi possível confirmar o registro da entrega.',409);
        $m=$mark['data'];$m['status']=$approved?'validated':($d['status']==='rejected'?'rejected':'revise');$m['awarded']=$approved && empty($d['warmup'])?(int)$e['data']['points'][$c['data']['level']]:0;SC_Code_Public_Store::save($mark,$m,$mark['version']);
    }
    private function game_assessment(array $d): array {
        $steps=[];
        foreach (['freeze'=>'Preservar entrega','execute'=>'Executar testes','compare'=>'Comparar resultados','ai_review'=>'Análise da solução pela IA','record'=>'Registrar avaliação'] as $id=>$title) $steps[]=['id'=>$id,'title'=>$title,'detail'=>$title,'status'=>'pending'];
        return $this->game_progress(['id'=>wp_generate_uuid4(),'run_id'=>wp_generate_uuid4(),'previous_run_id'=>null,'objective'=>'Verificar se esta versão resolve o enunciado e passa nos testes publicados.','allowed_inputs'=>['saved_code','published_tests','rubric','local_evidence'],'code_hash'=>hash('sha256',$d['code']),'rubric_version'=>2,'steps'=>$steps,'created_at'=>gmdate('c')],'execute','running','Entrega preservada. Execute os testes para avaliação.');
    }
    private function game_attempt(array $e,array $c,int $uid,array $v,?array $a): array {
        $team=$this->game_team($e,$uid);$this->team_ready($e,$team); $action=$v['action'] ?? 'save'; $claimId=$this->claim_id($team,$c['id']); $claim=SC_Code_Public_Store::get($claimId);
        // Another student's code is never returned. Old paused work stays available only to its author.
        if ($action==='start' && $a && $a['data']['status']==='paused' && $claim && $claim['data']['attempt_id']!==$a['id']) throw new RuntimeException('Seu colega já reservou este desafio. Seu rascunho foi preservado.',409);
        if ($action==='start' && $a && $a['data']['status']!=='paused') { $this->game_claim($a); return $a; }
        if(!in_array($action,['save','pass'],true)){$this->open($e);$this->team_ready($e,$team);$this->focus_required($e,$uid);}
        if ($claim && (!$a || $claim['data']['attempt_id']!==$a['id'])) { $u=get_user_by('id',$claim['owner']); throw new RuntimeException(($u ? $u->display_name : 'Seu colega').' já está com este desafio.',409); }
        if ($action==='start') {
            if($this->classroom($e))foreach(SC_Code_Public_Store::list('attempt',$e['id'],$uid) as $other){
                $otherChallenge=SC_Code_Public_Store::get($other['data']['challenge_id']);
                if($other['id']!==($a['id'] ?? '') && $other['data']['status']==='working' && $otherChallenge && $this->classroom_visible($e,$otherChallenge))throw new RuntimeException('Pare e libere o desafio atual antes de escolher outro.',409);
            }
            if (!$a) $a=SC_Code_Public_Store::create('attempt',$e['id'],$uid,['event_id'=>$e['id'],'challenge_id'=>$c['id'],'team_id'=>$team,'code'=>'','language'=>$c['data']['languages'][0],'status'=>'working','started_at'=>time(),'revisions'=>0,'hints'=>0,'runs'=>0,'results'=>[]],$this->attempt_id($c['id'],$uid));
            elseif ($a['data']['status']==='paused') { $d=$a['data']; $d['status']='working'; $a=SC_Code_Public_Store::save($a,$d,$a['version']); }
            if(!$claim){$shared=SC_Code_Public_Store::get(hash('sha256','shared:'.$team.':'.$c['id']));if($shared && $shared['data']['author']!==$uid){$d=$a['data'];$d['prior_drafts'][]=['code'=>$d['code'],'language'=>$d['language']];$d['code']=$shared['data']['code'];$d['language']=$shared['data']['language'];$d['continued_from']=$shared['data']['author'];$d['results']=[];$a=SC_Code_Public_Store::save($a,$d,$a['version']);}}
            if (!$claim) SC_Code_Public_Store::create('claim',$e['id'],$uid,['team_id'=>$team,'challenge_id'=>$c['id'],'attempt_id'=>$a['id'],'lease'=>wp_generate_uuid4()],$claimId);
            return $a;
        }
        if (!$a) throw new RuntimeException('Reserve o desafio antes de salvar.',409);
        $this->team_ready($e,$a['data']['team_id']);$this->game_claim($a); $d=$a['data'];
        if ($action==='reopen') {
            if ($d['status']!=='revise') throw new RuntimeException('Somente uma entrega devolvida para revisão pode ser reaberta.',409);
            if (!empty($d['assessment'])) $d['assessment_history'][]=$d['assessment'];
            $d['status']='working'; unset($d['assessment'],$d['submitted_at']);
        } else {
            if ($d['status']!=='working') throw new RuntimeException('Esta versão está preservada para avaliação.',409);
            $code=(string)($v['code'] ?? $d['code']); $language=$v['language'] ?? $d['language'];
            if (strlen($code)>60000 || !in_array($language,$c['data']['languages'],true)) throw new InvalidArgumentException('Código muito grande ou linguagem não permitida.');
            if ($code!==$d['code'] || $language!==$d['language']) { $d['revisions']++; $d['results']=[]; }
            $d['code']=$code; $d['language']=$language;
            if ($action==='pass') {
                if (empty($v['local_draft'])) {
                    $copy=$a;
                    $copy['data']=$d;
                    $this->share_draft($copy);
                }
                $d['status']='paused'; $saved=SC_Code_Public_Store::save($a,$d,(int)($v['version'] ?? 0)); SC_Code_Public_Store::remove($claimId); return $saved;
            }
            if ($action==='submit') {
                if (!trim($code)) throw new InvalidArgumentException('Escreva sua tentativa antes de entregar.');
                $d['warmup']=$this->classroom($e) && ($e['data']['phase'] ?? '')==='warmup';$d['status']='submitted'; $d['submitted_at']=time(); $d['submitted_hash']=hash('sha256',$code); $d['assessment']=$this->game_assessment($d);
                $d['assessment']['challenge_version']=$c['version'];
                $d['assessment']['evaluator_policy']=$e['data']['evaluators'] ?? [];
                $d['assessment']['queued']=true;
                $d['assessment']['evidence']=$this->evaluation_evidence($c,$v['results'] ?? [],$d['submitted_hash']);
                $d['results']=$d['assessment']['evidence'];$d['runs']++;
                $d['assessment']=$this->game_progress($d['assessment'],'ai_review','queued','Entrega salva. Aguardando avaliação do professor. Você pode resolver outro desafio.');
                $this->race_submission_marker($e,$a,$c,$d);
            } elseif ($action==='run') {
                if (!is_array($v['results'] ?? null) || strlen(wp_json_encode($v['results']))>50000) throw new InvalidArgumentException('Resultados inválidos.');
                $d['results']=$this->evaluation_evidence($c,$v['results'],hash('sha256',$d['code'])); $d['runs']++;
            } elseif ($action!=='save') throw new InvalidArgumentException('Ação inválida.');
        }
        return SC_Code_Public_Store::save($a,$d,(int)($v['version'] ?? 0));
    }
    private function game_credit(array $e,array $a,array $c,bool $approve,string $source): void {
        $key=hash('sha256','credit:'.$a['data']['team_id'].':'.$c['id']); $old=SC_Code_Public_Store::get($key);
        $oldPoints=(int)($old['data']['points'] ?? 0); $points=$approve && empty($a['data']['warmup']) ? (int)$e['data']['points'][$c['data']['level']] : 0;
        if ($old && $old['data']['attempt_id']!==$a['id']) { if ($oldPoints>0) { if ($approve) throw new RuntimeException('Este desafio já pontuou para a equipe.',409); return; } SC_Code_Public_Store::remove($key); $old=null; }
        if ($oldPoints===$points) return;
        $data=['team_id'=>$a['data']['team_id'],'challenge_id'=>$c['id'],'attempt_id'=>$a['id'],'points'=>$points,'level'=>$c['data']['level']];
        if ($old) SC_Code_Public_Store::save($old,$data,$old['version']); else SC_Code_Public_Store::create('credit',$e['id'],$a['owner'],$data,$key);
        $ed=$e['data']; $ed['boost_seq']=(int)($ed['boost_seq'] ?? 0)+1;
        SC_Code_Public_Store::save($e,$ed,$e['version']);
        $u=get_user_by('id',$a['owner']);
        SC_Code_Public_Store::create('boost',$e['id'],$a['owner'],['seq'=>$ed['boost_seq'],'team_id'=>$a['data']['team_id'],'name'=>$u ? $u->display_name : 'Participante','challenge'=>$c['data']['title'],'level'=>$c['data']['level'],'delta'=>$points-$oldPoints,'source'=>$source,'at'=>time()]);
    }
    private function game_complete(int $uid,array $ticket,array $v): array {
        return SC_Code_Public_Store::transaction(function() use($uid,$ticket,$v) {
            $e=$this->event($ticket['event_id'],$uid,false,true); $a=$this->require_record($ticket['attempt'],'attempt'); $c=$this->require_record($a['data']['challenge_id'],'challenge'); $d=$a['data']; $x=$d['assessment'] ?? [];
            if (!$this->evaluation_access($ticket,$a,$uid) || $a['version']!==$ticket['attempt_version'] || $d['status']!=='submitted' || ($x['run_id'] ?? '')!==$ticket['run_id'] || ($x['status'] ?? '')!=='running' || $c['version']!==$ticket['challenge_version']) throw new RuntimeException('A avaliação mudou. Atualize a entrega antes de continuar.',409);
            $this->team_ready($e,$a['data']['team_id']);$this->game_claim($a); $judgment=SC_Code_Public_Domain::assessment((string)($v['raw'] ?? ''));
            $x['evaluator']=$ticket['evaluator'] ?? null;
            if ($judgment['verdict']==='inconclusive') throw new RuntimeException('A IA não conseguiu concluir. Continue a avaliação ou peça revisão ao professor.',422);
            $passed=SC_Code_Public_Comparison::accepted($c['data'],$x['evidence']['items'] ?? [],$judgment);
            if(SC_Code_Public_Comparison::kind($c['data'])==='constructive'){foreach($x['evidence']['items'] as $i=>&$item){$item['passed']=empty($item['error'])&&$item['exit_code']===0&&$judgment['output_checks'][$i]['passed'];$item['comparison']='constructive';$item['verification_source']='ai';}unset($item);$d['results']=$x['evidence'];}
            $suspected=!empty($judgment['integrity']['suspected']);$approve=$passed && $judgment['verdict']==='approved' && !$suspected;if($suspected){$judgment['grade']=0;$judgment['verdict']='revise';}
            if($suspected){$id=hash('sha256','integrity:'.$a['id']);if(!SC_Code_Public_Store::get($id)){ $points=!empty($d['warmup'])?0:(int)($e['data']['integrity_penalty'] ?? 1);SC_Code_Public_Store::create('integrity',$e['id'],$a['owner'],['team_id'=>$d['team_id'],'attempt_id'=>$a['id'],'points'=>$points,'waived'=>false,'reason'=>$judgment['integrity']['reason'],'at'=>time(),'history'=>[]],$id);if($points)SC_Code_Public_Store::create('race_mark',$e['id'],$a['owner'],['type'=>'penalty','reason'=>'Suspeita de resposta pronta · revisão disponível','team_id'=>$d['team_id'],'exit_id'=>$id,'at'=>time(),'anchor'=>$this->race_team_points($e['id'],$d['team_id']),'points'=>$points],hash('sha256','race:integrity:'.$id));}}
            if(($x['rubric_version'] ?? 1)===2){$judgment['grade']=$approve?10.0:0.0;$judgment['rubric_version']=2;unset($judgment['criteria']);}
            $judgment['approved']=$approve; $judgment['source']='ai'; $judgment['at']=time();
            $x['original']=$judgment; $x['effective']=$judgment;
            $x=$this->game_progress($x,null,'completed','Avaliação da IA registrada.');
            $d['assessment']=$x; $d['grade']=$judgment['grade']; $d['status']=$approve ? 'validated' : 'rejected'; $d['validated_hash']=$approve ? hash('sha256',$d['code']) : '';
            $d['feedback']=$suspected?'Solução reprovada, sem pontos. Há uma suspeita a ser revisada pelo professor, que pode decidir devolver a entrega.':($approve?'Avaliação registrada: solução aprovada.':'Solução reprovada, sem pontos. O professor pode revisar a avaliação e decidir devolver a entrega.');
            $this->game_credit($e,$a,$c,$approve,'ai');
            $this->race_update_marker($e,$a,$d,$c,$approve);
            $saved=SC_Code_Public_Store::save($a,$d,$a['version']); return ['attempt'=>$saved,'transport'=>$v['transport'] ?? 'direct'];
        });
    }
    private function game_review(int $uid,array $v): array {
        return SC_Code_Public_Store::transaction(function() use($uid,$v) {
            $a=$this->require_record((string)($v['attempt_id'] ?? ''),'attempt'); $e=$this->event($a['parent'],$uid,true,true); $a=$this->require_record($a['id'],'attempt'); $d=$a['data'];
            if (!in_array($d['status'],['submitted','validated','rejected','revise'],true) || !isset($d['assessment'])) throw new RuntimeException('Não há entrega para revisar.',409);
            $reason=sanitize_textarea_field($v['feedback'] ?? ''); $binary=($d['assessment']['rubric_version'] ?? 1)===2;$grade=$binary ? (($v['decision'] ?? '')==='approve'?10:0) : ($v['grade'] ?? null);
            if (!trim($reason) || !is_numeric($grade) || (float)$grade<0 || (float)$grade>10 || !in_array($v['decision'] ?? '',['approve','revise'],true)) throw new InvalidArgumentException($binary?'Informe a decisão e o motivo da revisão.':'Informe nota de 0 a 10, decisão e motivo da revisão.');
            $this->game_claim($a); $approve=$v['decision']==='approve'; $x=$d['assessment'];
            $revision=['source'=>'teacher','grade'=>round((float)$grade,1),'approved'=>$approve,'reason'=>mb_substr($reason,0,2000),'by'=>$uid,'at'=>time()];
            $x['history'][]=$revision; $x['effective']=$revision;
            $x=$this->game_progress($x,null,'completed','Avaliação revisada pelo professor.');
            $d['assessment']=$x; $d['grade']=$revision['grade']; $d['status']=$approve ? 'validated' : 'revise'; $d['validated_hash']=$approve ? hash('sha256',$d['code']) : ''; $d['feedback']=$revision['reason'];
            $challenge=$this->require_record($d['challenge_id'],'challenge');$this->game_credit($e,$a,$challenge,$approve,'teacher');
            $this->race_update_marker($e,$a,$d,$challenge,$approve);
            return SC_Code_Public_Store::save($a,$d,(int)($v['version'] ?? 0));
        });
    }
    private function game_ranking(array $e,array $members,array $attempts,array $challenges,bool $includeMarks=false): array {
        $credits=SC_Code_Public_Store::list('credit',$e['id']); $points=[];
        foreach($credits as $credit) $points[$credit['data']['attempt_id']]=$credit['data']['points'];
        $rows=SC_Code_Public_Domain::ranking($members,$attempts,$challenges,$points);
        $exits=array_merge($this->focus_exits($e['id']),SC_Code_Public_Store::list('integrity',$e['id']));$userPenalty=[];$teamPenalty=[];
        foreach($exits as $x){if(!empty($x['data']['waived']))continue;$userPenalty[$x['owner']]=($userPenalty[$x['owner']] ?? 0)+$x['data']['points'];$tid=$x['data']['team_id'];$teamPenalty[$tid]=($teamPenalty[$tid] ?? 0)+$x['data']['points'];}
        foreach($rows as &$row){$row['earned_points']=$row['points'];$row['penalty']=$userPenalty[$row['user_id']] ?? 0;$row['points']=max(0,$row['points']-$row['penalty']);}unset($row);
        usort($rows,fn($a,$b)=>($b['points']<=>$a['points']) ?: ($b['validated']<=>$a['validated']) ?: ($a['user_id']<=>$b['user_id']));
        $last=null;$position=0;foreach($rows as $i=>&$row){$key=$row['points'].':'.$row['validated'];if($last!==$key){$position=$i+1;$last=$key;}$row['position']=$position;}unset($row);
        $teams=[];
        foreach(SC_Code_Public_Store::list('team',$e['id']) as $team) {
            if($this->classroom($e) && (empty($team['data']['approved']) || !empty($team['data']['suspended'])))continue;
            $people=array_filter($members,fn($m)=>($m['data']['team_id'] ?? '')===$team['id']);
            $ts=array_filter($credits,fn($c)=>$c['data']['team_id']===$team['id'] && $c['data']['points']>0);
            $teams[]=['id'=>$team['id'],'name'=>!empty($team['data']['suspended'])?'Equipe suspensa':$team['data']['name'],'members'=>$this->classroom($e)?count($team['data']['roster'] ?? []):count($people),'points'=>array_sum(array_column(array_column($ts,'data'),'points')),'validated'=>count($ts)];
        }
        foreach($teams as &$t){$t['earned_points']=$t['points'];$t['penalty']=$teamPenalty[$t['id']] ?? 0;$t['points']=max(0,$t['points']-$t['penalty']);}unset($t);
        usort($teams,fn($a,$b)=>($b['points']<=>$a['points']) ?: ($b['validated']<=>$a['validated']) ?: strcmp($a['id'],$b['id']));
        $last=null; $position=0;
        foreach($teams as $i=>&$t) { $key=$t['points'].':'.$t['validated']; if($last!==$key) { $position=$i+1; $last=$key; } $t['position']=$position; }
        unset($t);
        $boosts=SC_Code_Public_Store::list('boost',$e['id']); usort($boosts,fn($a,$b)=>$a['data']['seq']<=>$b['data']['seq']);
        $maximum=0; foreach($challenges as $c) $maximum+=(int)$e['data']['points'][$c['data']['level']];
        $marks=[];if($includeMarks){$exitsById=[];foreach($exits as $exit)$exitsById[$exit['id']]=$exit;$names=[];foreach($members as $member)$names[$member['owner']]=$member['name'];foreach(SC_Code_Public_Store::list('race_mark',$e['id']) as $mark){$m=$mark['data'];$m['name']=$names[$mark['owner']] ?? 'Participante';$m['id']=$mark['id'];if(($m['type'] ?? '')==='penalty'){$exit=$exitsById[$m['exit_id']] ?? null;if(!$exit)continue;$m['waived']=!empty($exit['data']['waived']);unset($m['exit_id']);}unset($m['attempt_id']);$marks[]=$m;}}
        usort($marks,fn($a,$b)=>($a['at']<=>$b['at']) ?: strcmp($a['id'],$b['id']));
        if($this->classroom($e)){$rows=[];$allowed=array_column($teams,'id');$marks=array_values(array_filter($marks,fn($m)=>in_array($m['team_id'],$allowed,true)));$boosts=array_values(array_filter($boosts,fn($b)=>in_array($b['data']['team_id'],$allowed,true)));}
        return ['rows'=>$rows,'teams'=>$teams,'marks'=>$marks,'boosts'=>array_map(fn($b)=>$b['data'],array_slice($boosts,-200)),'cursor'=>(int)($e['data']['boost_seq'] ?? 0),'maximum'=>$maximum];
    }
}
