<?php
require_once __DIR__.'/import.php';
require_once __DIR__.'/classroom.php';
require_once __DIR__.'/ai-job.php';
require_once __DIR__.'/evaluation.php';
require_once __DIR__.'/event-ops.php';
class SC_Code_Public_REST {
    use SC_Code_Public_Game, SC_Code_Public_Event_Ops, SC_Code_Public_Evaluation, SC_Code_Public_Classroom;
    const NS='sc-code-public/v1';
    public function register(): void {
        $routes=[
            'auth/me'=>'GET','auth/logout'=>'POST','events'=>'GET,POST','events/join'=>'POST','events/active'=>'POST','events/archive'=>'POST',
            'event'=>'GET,POST,DELETE','events/read'=>'POST','event/read'=>'POST','event/sync'=>'POST','challenges'=>'POST','challenges/import'=>'POST','imports/prepare'=>'POST','imports/apply'=>'POST','imports/audit'=>'GET','challenge/source'=>'GET','challenge/media'=>'GET','challenge/delete'=>'POST','attempt'=>'POST','attempt/read'=>'GET','review'=>'POST','ranking'=>'GET',
            'hint/hide'=>'POST','ai/settings'=>'GET,POST','ai/models'=>'GET','ai/request'=>'POST','ai/prepare'=>'POST','ai/complete'=>'POST','ai/test'=>'POST',
            'event/upgrade'=>'POST','teams'=>'POST','teams/invite'=>'POST','teams/join'=>'POST','claims/release'=>'POST','assessment'=>'POST','evaluation/list'=>'POST','evaluation/prepare'=>'POST','evaluation/release'=>'POST',
            'event/settings'=>'POST','monitor/invite'=>'POST','monitor/accept'=>'POST','monitor/read'=>'POST','monitor/attempt'=>'POST','monitor/revoke'=>'POST','focus/read'=>'POST','focus/begin'=>'POST','focus/update'=>'POST','focus/ping'=>'POST','focus/end'=>'POST','focus/review'=>'POST',
            'account/export'=>'GET','account/delete'=>'POST','teachers/request'=>'POST','teachers/review'=>'POST','collab/invite'=>'POST','collab/accept'=>'POST','collab/list'=>'POST','collab/revoke'=>'POST','health'=>'GET','team/ops'=>'POST',
        ];
        foreach ($routes as $route=>$methods) {
            register_rest_route(self::NS,'/'.$route,['methods'=>$methods,'permission_callback'=>function($r) {
                try { $this->uid($r); return true; } catch (Throwable $e) { return $this->error($e); }
            },'callback'=>function($r) use($route) {
                try {
                    $result=$this->dispatch($route,$r);
                    $response=rest_ensure_response($result);
                    $response->header('Cache-Control','no-store, private');
                    $response->header('Pragma','no-cache');
                    return $response;
                } catch (Throwable $e) { return $this->error($e); }
            }]);
        }
    }
    private function dispatch(string $route,$r) {
        $v=$r->get_json_params() ?: [];
        $protected=['events/archive','evaluation/prepare','evaluation/release','attempt','assessment','ai/complete','hint/hide','teams','teams/invite','teams/join','claims/release','team/ops','focus/begin','focus/end'];
        if($r->get_method()==='POST' && !empty($v['_request_id']) && in_array($route,$protected,true)) {
            $uid=$this->uid($r);
            return SC_Code_Public_Store::once($uid,(string)$v['_request_id'],hash('sha256',$route.':'.wp_json_encode($v)),fn()=>$this->handle($route,$r));
        }
        return $this->handle($route,$r);
    }
    private function error(Throwable $e): WP_Error {
        $status=$e instanceof InvalidArgumentException ? 400 : (int)$e->getCode();
        if ($status<400 || $status>599) { $status=500; }
        return new WP_Error($e instanceof SC_Code_Public_AI_Format ? 'sc_code_public_ai_format' : 'sc_code_public_error',$e->getMessage(),['status'=>$status]);
    }
    private function uid($r): int {
        if (!is_user_logged_in() || !wp_verify_nonce((string)$r->get_header('X-WP-Nonce'),'wp_rest')) {
            throw new RuntimeException('Entre para continuar.',401);
        }
        return get_current_user_id();
    }
    private function teacher(int $uid): bool { return user_can($uid,'sc_code_public_teach') || user_can($uid,'manage_options'); }
    private function user(int $uid): array { $u=get_user_by('id',$uid); return ['id'=>$uid,'name'=>$u->display_name,'username'=>$u->user_login,'email'=>$u->user_email,'can_teach'=>$this->teacher($uid),'can_manage_teachers'=>user_can($uid,'manage_options')]; }
    private function rate(string $key,int $limit,int $seconds): void {
        $key='scp_'.hash('sha256',$key); $now=time(); $window=get_transient($key);
        // Keep a fixed deadline: renewing it on every accepted heartbeat made
        // steady, legitimate traffic eventually exhaust a never-ending window.
        if (!is_array($window) || (int)($window['until'] ?? 0)<=$now) $window=['count'=>0,'until'=>$now+$seconds];
        $n=(int)$window['count'];
        if ($n>=$limit) { throw new RuntimeException('Aguarde um pouco antes de tentar novamente.',429); }
        $window['count']=$n+1;
        set_transient($key,$window,max(1,(int)$window['until']-$now));
    }
    private function require_record(string $id,string $kind): array {
        $r=SC_Code_Public_Store::get($id);
        if (!$r || $r['kind']!==$kind) { throw new RuntimeException('Este item não está disponível.',404); }
        return $r;
    }
    private function event_role(array $event,int $uid): string {
        if (!$this->teacher($uid)) return '';
        if ($event['owner']===$uid) return 'owner';
        $access=SC_Code_Public_Store::get(hash('sha256','collab:'.$event['id'].':'.$uid));
        $invitation=$access ? SC_Code_Public_Store::get((string)($access['data']['invitation_id'] ?? '')) : null;
        if (!$access || $access['kind']!=='collab' || $access['owner']!==$uid || $access['parent']!==$event['id'] || !$invitation || $invitation['kind']!=='collab_inv' || $invitation['parent']!==$event['id'] || !empty($invitation['data']['revoked']) || ($invitation['data']['accepted_by'] ?? null)!==$uid) return '';
        $role=(string)($invitation['data']['role'] ?? ''); return in_array($role,['monitor','editor','admin'],true)?$role:'';
    }
    private function event_editor(array $event,int $uid): bool { return in_array($this->event_role($event,$uid),['owner','editor','admin'],true); }
    private function event_admin(array $event,int $uid): bool { return in_array($this->event_role($event,$uid),['owner','admin'],true); }
    private function member_id(string $event,int $uid): string { return hash('sha256','member:'.$event.':'.$uid); }
    private function event(string $id,int $uid,bool $own=false,bool $lock=false): array {
        global $wpdb;
        if ($lock) {
            $wpdb->get_var($wpdb->prepare('SELECT rid FROM '.SC_Code_Public_Store::table().' WHERE rid=%s FOR UPDATE',$id));
            if ($wpdb->last_error) { throw new RuntimeException('Não foi possível reservar este evento para alteração.',503); }
        }
        $e=$this->require_record($id,'event');
        if ($this->event_editor($e,$uid)) { return $e; }
        if (!$own && SC_Code_Public_Store::get($this->member_id($id,$uid)) && $e['data']['status']==='published') { return $e; }
        if(!$own) { try{return $this->watch_access($id,$uid);}catch(RuntimeException $x){if($x->getCode()!==403)throw $x;} }
        throw new RuntimeException('Você não tem acesso a este evento.',403);
    }
    private function open(array $event): void {
        $d=$event['data']; $now=time();
        if ($d['status']!=='published' || (!empty($d['starts_at']) && strtotime($d['starts_at'])>$now) || (!empty($d['ends_at']) && strtotime($d['ends_at'])<=$now)) {
            throw new RuntimeException('Este evento não está aberto para novas tentativas.',409);
        }
    }
    private function summary(array $e,int $uid,?array $preference=null): array {
        $preference=$preference ?? SC_Code_Public_Store::get(hash('sha256','event_pref:'.$e['id'].':'.$uid)) ?? [];
        $e['archived']=!empty($preference['data']['archived']);$e['list_version']=(int)($preference['version'] ?? 0);
        $e['data']['focus_policy']=$this->focus_policy($e);
        $role=$this->event_role($e,$uid);
        if (!$this->event_admin($e,$uid) && !$this->event_editor($e,$uid)) unset($e['data']['invite']);
        if ($role && $role!=='owner') $e['access_role']=$role;
        elseif($e['owner']!==$uid && !SC_Code_Public_Store::get($this->member_id($e['id'],$uid))) $e['access_role']='monitor';
        return $e;
    }
    private function attempt_id(string $challenge,int $uid): string { return hash('sha256','attempt:'.$challenge.':'.$uid); }
    private function handle(string $route,$r) {
        $v=$r->get_json_params() ?: []; $method=$r->get_method();
        $uid=$this->uid($r);
        if ($route==='auth/me') { return ['user'=>$this->user($uid),'active_event'=>get_user_meta($uid,'sc_code_public_active',true) ?: null]; }
        if ($route==='auth/logout') {
            return SC_Code_Public_Store::transaction(function() use($uid) {
                $this->focus_signout($uid);
                return ['ok'=>true];
            });
        }
        if($route==='team/ops')return $this->team_ops($uid,$v);
        if (in_array($route,['event/upgrade','teams','teams/invite','teams/join','claims/release','assessment'],true)) return $this->game_route($route,$uid,$v,$r);
        if(in_array($route,['event/settings','monitor/invite','monitor/accept','monitor/read','monitor/attempt','monitor/revoke','focus/read','focus/begin','focus/update','focus/ping','focus/end','focus/review'],true))return $this->ops_route($route,$uid,$v);
        if ($route==='teachers/request') {
            $id=hash('sha256','teacher-request:'.$uid); $request=SC_Code_Public_Store::get($id);
            $action=(string)($v['action'] ?? 'status');
            if ($action==='status') return ['status'=>$request['data']['status'] ?? 'none','is_teacher'=>$this->teacher($uid)];
            if ($action!=='submit') throw new InvalidArgumentException('Ação indisponível.');
            if ($this->teacher($uid)) return ['status'=>'approved','is_teacher'=>true];
            if ($request && ($request['data']['status'] ?? '')==='pending') return ['status'=>'pending','is_teacher'=>false];
            $this->rate('teacher_request:'.$uid,5,3600);
            $data=['status'=>'pending','requested_at'=>time()];
            if ($request) SC_Code_Public_Store::save($request,$data,$request['version']); else SC_Code_Public_Store::create('teacher_req','',$uid,$data,$id);
            return ['status'=>'pending','is_teacher'=>false];
        }
        if ($route==='teachers/review') {
            if (!user_can($uid,'manage_options')) throw new RuntimeException('Somente o administrador pode decidir pedidos de professor.',403);
            $action=(string)($v['action'] ?? 'list');
            if ($action==='list') {
                $result=[];foreach(SC_Code_Public_Store::list('teacher_req') as $request) {
                    if (($request['data']['status'] ?? '')!=='pending') continue;
                    $person=get_user_by('id',$request['owner']); if (!$person) continue;
                    $result[]=['id'=>$request['id'],'version'=>$request['version'],'name'=>$person->display_name,'email'=>$person->user_email,'requested_at'=>$request['data']['requested_at']];
                } return ['requests'=>$result];
            }
            if ($action==='teachers') {
                $search=trim(sanitize_text_field((string)($v['search'] ?? '')));if(mb_strlen($search)>100)throw new InvalidArgumentException('A busca deve ter no máximo 100 caracteres.');
                $page=max(1,min(10000,(int)($v['page'] ?? 1)));
                $args=['capability__in'=>['sc_code_public_teach','manage_options'],'number'=>20,'paged'=>$page,'orderby'=>'display_name','order'=>'ASC','count_total'=>true];
                if($search!==''){$args['search']='*'.$search.'*';$args['search_columns']=['display_name','user_login','user_email'];}
                $query=new WP_User_Query($args);$rows=[];
                foreach($query->get_results() as $person){$id=(int)$person->ID;if(!$this->teacher($id))continue;$admin=user_can($id,'manage_options');$direct=!empty($person->caps['sc_code_public_teach']);$inherited=false;foreach($person->roles as $role){$r=get_role($role);if($r && $r->has_cap('sc_code_public_teach'))$inherited=true;}
                    $rows[]=['id'=>$id,'name'=>$person->display_name,'email'=>$person->user_email,'revocable'=>!$admin && $direct && !$inherited,'reason'=>$admin?'Administrador do WordPress':(!$direct || $inherited?'Permissão concedida por outro perfil':'')];}
                return ['teachers'=>$rows,'total'=>(int)$query->get_total(),'page'=>$page,'per_page'=>20];
            }
            if ($action==='revoke') {
                $target=(int)($v['user_id'] ?? 0);$person=get_user_by('id',$target);
                if(!$person || !$this->teacher($target))throw new RuntimeException('Esta conta não possui mais acesso de professor. Atualize a lista.',409);
                if(user_can($target,'manage_options'))throw new RuntimeException('Não é possível retirar o acesso de administradores do WordPress por esta tela.',403);
                if(empty($person->caps['sc_code_public_teach']))throw new RuntimeException('Este acesso é concedido por outro perfil e não pode ser retirado por esta tela.',409);
                foreach($person->roles as $role){$r=get_role($role);if($r && $r->has_cap('sc_code_public_teach'))throw new RuntimeException('Este acesso também é concedido por outro perfil e não pode ser retirado por esta tela.',409);}
                try{return SC_Code_Public_Store::transaction(function()use($person,$target,$uid){$person->remove_cap('sc_code_public_teach');if($this->teacher($target))throw new RuntimeException('O acesso continua concedido por outro perfil. Nenhuma alteração foi feita.',409);
                    $request=SC_Code_Public_Store::get(hash('sha256','teacher-request:'.$target));if($request && $request['kind']==='teacher_req' && $request['owner']===$target){$data=$request['data'];$data['status']='revoked';$data['reviewed_by']=$uid;$data['reviewed_at']=time();SC_Code_Public_Store::save($request,$data,$request['version']);}
                    return ['ok'=>true,'name'=>$person->display_name];});}catch(Throwable $error){if(function_exists('clean_user_cache'))clean_user_cache($person);throw $error;}
            }
            if (!in_array($action,['approve','deny'],true)) throw new InvalidArgumentException('Ação indisponível.');
            $request=$this->require_record((string)($v['id'] ?? ''),'teacher_req');
            if (($request['data']['status'] ?? '')!=='pending' || $request['version']!==(int)($v['version'] ?? 0)) throw new RuntimeException('O pedido mudou. Atualize a lista.',409);
            $person=get_user_by('id',$request['owner']);if (!$person) throw new RuntimeException('A conta não está disponível.',404);
            $data=$request['data'];$data['status']=$action==='approve'?'approved':'denied';$data['reviewed_by']=$uid;$data['reviewed_at']=time();
            try { return SC_Code_Public_Store::transaction(function()use($request,$data,$person,$action) {
                $updated=SC_Code_Public_Store::save($request,$data,$request['version']);
                if($action==='approve' && !$this->teacher((int)$person->ID)) { $person->add_cap('sc_code_public_teach'); if (!$this->teacher((int)$person->ID)) throw new RuntimeException('Não foi possível autorizar. Tente novamente.',503); }
                return ['status'=>$updated['data']['status'],'name'=>$person->display_name];
            }); } catch (Throwable $error) { if (function_exists('clean_user_cache')) clean_user_cache($person); throw $error; }
        }
        if (str_starts_with($route,'collab/')) return $this->collab_route($route,$uid,$v);
        if (in_array($route,['evaluation/list','evaluation/prepare','evaluation/release'],true)) return $this->evaluation_route($route,$uid,$v);
        if ($route==='health') { return ['ok'=>true,'version'=>SC_CODE_PUBLIC_VERSION,'retry_receipts'=>1,'assessment_jobs'=>1,'can_teach'=>$this->teacher($uid),'crypto'=>function_exists('openssl_encrypt')]; }
        if (($route==='events' && $method==='GET') || $route==='events/read') {
            $out=array_values(array_filter(SC_Code_Public_Store::list('event',null,$uid),fn($event)=>$this->event_editor($event,$uid))); $seen=array_column($out,'id');
            foreach (SC_Code_Public_Store::list('member',null,$uid) as $m) {
                if (!in_array($m['parent'],$seen,true)) { $e=SC_Code_Public_Store::get($m['parent']); if ($e) { $out[]=$e; $seen[]=$e['id']; } }
            }
            foreach(SC_Code_Public_Store::list('collab',null,$uid) as $c) { if(in_array($c['parent'],$seen,true))continue; $e=SC_Code_Public_Store::get($c['parent']); if($e && $this->event_role($e,$uid)){ $out[]=$e;$seen[]=$e['id']; } }
            foreach(SC_Code_Public_Store::list('watch',null,$uid) as $w) { if(in_array($w['parent'],$seen,true))continue;try{$e=$this->watch_access($w['parent'],$uid);$out[]=$e;$seen[]=$e['id'];}catch(RuntimeException $x){if($x->getCode()!==403 && $x->getCode()!==404)throw $x;} }
            $preferences=[];foreach(SC_Code_Public_Store::list('event_pref',null,$uid) as $pref)$preferences[$pref['parent']]=$pref;
            return ['events'=>array_map(fn($e)=>$this->summary($e,$uid,$preferences[$e['id']] ?? []),$out),'active_event'=>get_user_meta($uid,'sc_code_public_active',true) ?: null];
        }
        if ($route==='events' && $method==='POST') { return SC_Code_Public_Store::transaction(function()use($uid,$v){
            if (!$this->teacher($uid)) { throw new RuntimeException('Somente professores podem criar eventos.',403); }
            $title=sanitize_text_field($v['title'] ?? '');
            if (!$title || strlen($title)>150) { throw new InvalidArgumentException('Informe um título de até 150 caracteres.'); }
            $schedule=$this->event_schedule($v);$v=array_merge($v,$schedule);
            $points=$v['points'] ?? ['easy'=>1,'medium'=>3,'hard'=>5];
            foreach(['easy','medium','hard'] as $level) if (!is_int($points[$level] ?? null) || $points[$level]<1 || $points[$level]>100) throw new InvalidArgumentException('Use pontos inteiros entre 1 e 100 por dificuldade.');
            $e=SC_Code_Public_Store::create('event','',$uid,['title'=>$title,'description'=>sanitize_textarea_field($v['description'] ?? ''),'status'=>'draft','invite'=>strtoupper(bin2hex(random_bytes(5))),'starts_at'=>$v['starts_at'] ?? '', 'ends_at'=>$v['ends_at'] ?? '','created_at'=>time(),'classroom_version'=>1,'phase'=>'warmup','warmup_ids'=>[],'hidden_ids'=>[],'level_labels'=>array_key_exists('level_labels',$v)?$this->category_labels($v['level_labels']):['easy'=>'Fácil','medium'=>'Médio','hard'=>'Difícil'],'self_teams'=>true,'teams_mode'=>true,'validation'=>'ai_local','points'=>$points,'boost_seq'=>0,'focus_policy'=>$this->ops_settings(['focus_policy'=>$v['focus_policy'] ?? $this->focus_policy(['data'=>[]])])['focus_policy']]);
            if(($v['policy_version'] ?? 0)===2){$e=SC_Code_Public_Store::save($e,array_merge($e['data'],$this->ops_settings($v)),$e['version']);}
            update_user_meta($uid,'sc_code_public_active',$e['id']); return $e;
        }); }
        if($route==='events/archive')return SC_Code_Public_Store::transaction(function()use($uid,$v){
            $e=$this->event((string)($v['id'] ?? ''),$uid,true,true);
            if(!is_bool($v['archived'] ?? null))throw new InvalidArgumentException('Escolha arquivar ou restaurar o evento.');
            $id=hash('sha256','event_pref:'.$e['id'].':'.$uid);$pref=SC_Code_Public_Store::get($id);
            if($pref && $pref['data']['archived']===$v['archived'])return $this->summary($e,$uid,$pref);
            if((int)($v['version'] ?? -1)!==(int)($pref['version'] ?? 0))throw new RuntimeException('A lista mudou em outra aba. Atualize e tente novamente.',409);
            $data=['archived'=>$v['archived'],'changed_at'=>time()];
            $pref=$pref?SC_Code_Public_Store::save($pref,$data,$pref['version']):SC_Code_Public_Store::create('event_pref',$e['id'],$uid,$data,$id);
            return $this->summary($e,$uid,$pref);
        });
        if ($route==='events/join') {
            $code=strtoupper(trim((string)($v['code'] ?? ''))); $found=null;
            $this->rate('join:'.$uid,20,300);
            foreach (SC_Code_Public_Store::list('event') as $e) { if ($e['data']['status']==='published' && hash_equals($e['data']['invite'],$code)) { $found=$e; break; } }
            if (!$found) { throw new RuntimeException('Confira o código. O evento precisa estar publicado.',404); }
            $this->may_switch_event($uid,$found['id']);
            $id=$this->member_id($found['id'],$uid);
            if (!SC_Code_Public_Store::get($id)) { SC_Code_Public_Store::create('member',$found['id'],$uid,['joined_at'=>time()],$id); }
            update_user_meta($uid,'sc_code_public_active',$found['id']); return $this->summary($found,$uid);
        }
        if ($route==='events/active') {
            $this->may_switch_event($uid,(string)($v['id'] ?? ''));
            $e=$this->event((string)($v['id'] ?? ''),$uid); update_user_meta($uid,'sc_code_public_active',$e['id']); return $this->summary($e,$uid);
        }
        if ($route==='event' || $route==='event/read' || $route==='event/sync') {
            $id=(string)($v['id'] ?? $r->get_param('id') ?? '');
            if ($method==='GET' || $route==='event/read' || $route==='event/sync') {
                $e=$this->event($id,$uid); $own=$this->event_editor($e,$uid);
                $hidden=!$own && !empty($e['data']['starts_at']) && strtotime($e['data']['starts_at'])>time();
                $visibility=array_intersect_key($e['data'],array_flip(['classroom_version','phase','warmup_ids','hidden_ids','hidden_levels']));
                $revision=hash('sha256',wp_json_encode([$uid,$own,$hidden,$visibility,SC_Code_Public_Store::revision('challenge',$id)]));
                $unchanged=$route==='event/sync' && hash_equals($revision,(string)($v['challenge_revision'] ?? ''));
                $challenges=$unchanged?null:($hidden?[]:SC_Code_Public_Store::list('challenge',$id));
                if ($challenges!==null) {
                    if (!$own) $challenges=array_values(array_filter($challenges,fn($c)=>$this->classroom_visible($e,$c)));
                    foreach ($challenges as &$c) {
                        $c['data']['output_comparison']=['kind'=>SC_Code_Public_Comparison::kind($c['data']),'tolerance'=>SC_Code_Public_Comparison::tolerance($c['data'])];
                        if (!$own) unset($c['data']['hint_policy'],$c['data']['suggestion'],$c['data']['import_info'],$c['data']['reconciliation']);
                    }
                    unset($c);
                }
                $attempts=SC_Code_Public_Store::list('attempt',$id,$own ? null : $uid);
                foreach ($attempts as &$attempt) { $student=get_user_by('id',$attempt['owner']); $attempt['student_name']=$student ? $student->display_name : 'Participante'; } unset($attempt);
                return ['event'=>$this->summary($e,$uid),'challenges'=>$challenges,'challenge_revision'=>$revision,'attempts'=>$attempts,'server_now'=>time()]+$this->game_detail($e,$uid,$own);
            }
            return SC_Code_Public_Store::transaction(function() use($id,$uid,$v,$method) {
                $e=$this->event($id,$uid,true,true);
                if ($method==='DELETE') {
                    if (!$this->event_admin($e,$uid)) throw new RuntimeException('Somente quem administra o evento pode excluí-lo.',403);
                    if (($v['confirmation'] ?? '')!==$e['data']['title']) { throw new InvalidArgumentException('Digite o título do evento para confirmar a exclusão.'); }
                    foreach (['attempt','challenge','reference','member','team','claim','credit','boost','race_mark','request','shared','integrity','audit','focus','focus_exit','watch','watch_inv','collab','collab_inv','event_pref'] as $kind) { foreach(SC_Code_Public_Store::list($kind,$id) as $child) { SC_Code_Public_Store::remove($child['id']); } }
                    SC_Code_Public_Store::remove($id); return ['ok'=>true];
                }
                if ($e['data']['status']!=='draft') { throw new RuntimeException('Este evento já foi publicado.',409); }
                if (!SC_Code_Public_Store::list('challenge',$id)) { throw new InvalidArgumentException('Cadastre pelo menos um desafio antes de publicar.'); }
                foreach(SC_Code_Public_Store::list('challenge',$id) as $c) if(!empty($c['data']['import_info']) && ($issues=SC_Code_Public_Preparation::issues($c['data']))) throw new InvalidArgumentException($c['data']['title'].': '.$issues[0]);
                if (!empty($e['data']['teams_mode'])) {
                    if (empty($e['data']['self_teams']) && !SC_Code_Public_Store::list('team',$id)) throw new InvalidArgumentException('Crie pelo menos uma equipe antes de publicar.');
                    foreach(SC_Code_Public_Store::list('challenge',$id) as $c) if (!$c['data']['tests']) throw new InvalidArgumentException('Cada desafio precisa de testes com saídas esperadas para a avaliação automática.');
                }
                if(!empty($e['data']['ends_at']) && strtotime($e['data']['ends_at'])<=time())throw new InvalidArgumentException('O término informado já passou. Atualize ou remova o término em Horários e regras antes de publicar.');
                $d=$e['data']; $d['status']='published'; $d['published_at']=time();
                return SC_Code_Public_Store::save($e,$d,(int)($v['version'] ?? 0));
            });
        }
        if ($route==='imports/audit') { $e=$this->event((string)$r->get_param('event_id'),$uid,true);return SC_Code_Public_Import::audit(SC_Code_Public_Store::list('challenge',$e['id'])); }
        if ($route==='imports/prepare') {
            return SC_Code_Public_Store::transaction(function() use($uid,$v) {
                $e=$this->event((string)($v['event_id'] ?? ''),$uid,true,true);
                if($e['data']['status']!=='draft')throw new RuntimeException('Os dados de um evento publicado ficam preservados.',409);
                $count=0;$tests=0;$attention=0;
                foreach(SC_Code_Public_Store::list('challenge',$e['id']) as $c) {
                    if(empty($c['data']['import_info']))continue;
                    $reference=$this->require_record(SC_Code_Public_Import::reference_id($c['id']),'reference');
                    $data=SC_Code_Public_Preparation::adopt($c['data'],$reference['data']['source']['archive']);
                    if($data!==$c['data'])SC_Code_Public_Store::save($c,$data,$c['version']);
                    $count++;$tests+=count($data['tests']);if(SC_Code_Public_Preparation::issues($data))$attention++;
                }
                return ['questions'=>$count,'tests'=>$tests,'attention'=>$attention];
            });
        }
        if ($route==='imports/apply') {
            return SC_Code_Public_Store::transaction(function() use($uid,$v) {
                $c=$this->require_record((string)($v['challenge_id'] ?? ''),'challenge');$e=$this->event($c['parent'],$uid,true,true);
                if($e['data']['status']!=='draft' || $c['version']!==(int)($v['version'] ?? 0))throw new RuntimeException('A questão mudou ou o evento foi publicado. Atualize antes de aplicar.',409);
                $d=$c['data'];$proposal=$d['reconciliation'] ?? [];
                if(empty($proposal['proposed_tests']) || !empty($proposal['applied']))throw new InvalidArgumentException('Não há uma proposta nova de testes para aplicar.');
                $d['reconciliation']['previous_tests']=$d['tests'];$d['tests']=$proposal['proposed_tests'];
                $d['reconciliation']['applied']=true;$d['reconciliation']['applied_by']=$uid;
                $d['import_info']['tests_origin']='ai_proposal_accepted';$d['import_info']['preparation_issues']=SC_Code_Public_Preparation::issues($d);
                return SC_Code_Public_Store::save($c,$d,$c['version']);
            });
        }
        if ($route==='challenges/import') {
            return SC_Code_Public_Store::transaction(function() use($uid,$v) {
                $e=$this->event((string)($v['event_id'] ?? ''),$uid,true,true);
                if($e['data']['status']!=='draft')throw new RuntimeException('Importe somente para um evento em rascunho.',409);
                $item=$v['item'] ?? null;if(!is_array($item))throw new InvalidArgumentException('Questão inválida.');
                $prepared=SC_Code_Public_Import::prepare($item);$id=SC_Code_Public_Import::id($e['id'],$prepared['external_id']);
                if($existing=SC_Code_Public_Store::get($id)) {
                    if ($existing['kind']!=='challenge' || $existing['owner']!==$e['owner'] || ($existing['data']['import_info']['external_id'] ?? '')!==$prepared['external_id']) throw new RuntimeException('O registro encontrado não corresponde à questão deste evento. Não será sobrescrito.',409);
                    $reference=SC_Code_Public_Store::get(SC_Code_Public_Import::reference_id($id));
                    if (!$reference || $reference['kind']!=='reference' || $reference['owner']!==$e['owner'] || ($reference['data']['challenge_id'] ?? '')!==$id || ($reference['data']['source']['external_id'] ?? '')!==$prepared['external_id']) throw new RuntimeException('A referência desta questão não foi confirmada. A importação precisa de reparo; o conteúdo existente foi preservado.',409);
                    if ($existing['parent']!==$e['id'] || $reference['parent']!==$e['id']) {
                        // Recover only the exact historical WordPress %d coercion. The
                        // deterministic import ID proves event + original question.
                        $legacy=(string)(int)$e['id'];
                        if ($existing['parent']!==$legacy || $reference['parent']!==$legacy) throw new RuntimeException('O vínculo encontrado não corresponde a este evento. O conteúdo foi preservado.',409);
                        SC_Code_Public_Store::reparent($existing,$e['id']);
                        SC_Code_Public_Store::reparent($reference,$e['id']);
                        return ['id'=>$id,'status'=>'existing','repaired'=>true];
                    }
                    return ['id'=>$id,'status'=>'existing'];
                }
                SC_Code_Public_Store::create('reference',$e['id'],$e['owner'],['challenge_id'=>$id]+$prepared['reference'],SC_Code_Public_Import::reference_id($id));
                SC_Code_Public_Store::create('challenge',$e['id'],$e['owner'],$prepared['data'],$id);
                return ['id'=>$id,'status'=>'created'];
            });
        }
        if ($route==='challenge/source' || $route==='challenge/media') {
            $c=$this->require_record((string)$r->get_param('challenge_id'),'challenge');
            $event=$this->event($c['parent'],$uid,$route==='challenge/source');if(!$this->event_editor($event,$uid) && !$this->classroom_visible($event,$c))throw new RuntimeException('Este desafio não está disponível nesta fase.',409);
            $reference=$this->require_record(SC_Code_Public_Import::reference_id($c['id']),'reference');
            if($route==='challenge/source') { $out=$reference['data'];unset($out['media']);return $out; }
            $imageId=(string)$r->get_param('image_id');
            foreach($reference['data']['media'] as $image)if($image['id']===$imageId)return ['uri'=>'data:'.$image['mime'].';base64,'.$image['base64']];
            throw new RuntimeException('Imagem não disponível.',404);
        }
        if ($route==='challenge/delete') {
            return SC_Code_Public_Store::transaction(function() use($uid,$v){
                $c=$this->require_record((string)($v['challenge_id'] ?? ''),'challenge');$e=$this->event($c['parent'],$uid,true,true);
                if($e['data']['status']!=='draft' || (int)($v['version'] ?? 0)!==$c['version'])throw new RuntimeException('O desafio mudou ou já foi publicado.',409);
                if(($v['confirmation'] ?? '')!==$c['data']['title'])throw new InvalidArgumentException('Confirme o título do desafio para excluí-lo deste rascunho.');
                $ref=SC_Code_Public_Import::reference_id($c['id']);if(SC_Code_Public_Store::get($ref))SC_Code_Public_Store::remove($ref);
                SC_Code_Public_Store::remove($c['id']);return ['ok'=>true];
            });
        }
        if ($route==='challenges') {
            return SC_Code_Public_Store::transaction(function() use($uid,$v) {
                $e=$this->event((string)($v['event_id'] ?? ''),$uid,true,true);
                if ($e['data']['status']!=='draft') { throw new RuntimeException('Os desafios ficam congelados após a publicação.',409); }
                $items=$v['items'] ?? [$v];
                if (!is_array($items) || !$items || count($items)>100) { throw new InvalidArgumentException('Importe entre 1 e 100 desafios por vez.'); }
                $out=[];
                foreach ($items as $item) {
                    if (!is_array($item)) { throw new InvalidArgumentException('Formato de desafio inválido.'); }
                    $data=SC_Code_Public_Domain::challenge($item);
                    if (!empty($item['id'])) {
                        $c=$this->require_record($item['id'],'challenge');
                        if ($c['parent']!==$e['id']) { throw new RuntimeException('Desafio de outro evento.',403); }
                        $data=SC_Code_Public_Import::preserve($c['data'],$data,$item);
                        if (!empty($item['approve_suggestion'])) {
                            if (empty($c['data']['suggestion']) || $data['level']!==$c['data']['suggestion']['level']) { throw new InvalidArgumentException('A sugestão mudou. Atualize o desafio.'); }
                            $data['suggestion']=$c['data']['suggestion']; $data['suggestion']['status']='approved';
                        }
                        $out[]=SC_Code_Public_Store::save($c,$data,(int)($item['version'] ?? 0));
                    } else { $out[]=SC_Code_Public_Store::create('challenge',$e['id'],$uid,$data); }
                }
                return ['challenges'=>$out];
            });
        }
        if ($route==='hint/hide') {
            return SC_Code_Public_Store::transaction(function()use($uid,$v){
                $a=$this->require_record((string)($v['attempt_id'] ?? ''),'attempt');
                $this->event($a['parent'],$uid,false,true);
                if($a['owner']!==$uid)throw new RuntimeException('Você só pode ocultar suas próprias dicas.',403);
                if($a['version']!==(int)($v['version'] ?? 0))throw new RuntimeException('A tentativa mudou. Atualize e tente novamente.',409);
                $sequence=$v['sequence'] ?? null;$index=$v['index'] ?? null;if((!is_int($sequence)||$sequence<1) && (!is_int($index)||$index<0))throw new InvalidArgumentException('Dica inválida.');
                $d=$a['data'];$history=$d['hint_history'] ?? [];$found=false;
                foreach($history as $i=>&$hint){if(($sequence!==null && ($hint['sequence'] ?? null)===$sequence) || ($sequence===null && $i===$index && empty($hint['sequence']))){$found=true;if(empty($hint['hidden'])){$hint['hidden']=true;$hint['hidden_at']=time();$hint['hidden_by']=$uid;}break;}}unset($hint);
                if(!$found)throw new RuntimeException('Dica não encontrada nesta tentativa.',404);
                $d['hint_history']=$history;$visible=array_values(array_filter($history,fn($h)=>empty($h['hidden'])));
                if($visible)$d['last_hint']=end($visible);else unset($d['last_hint']);
                return SC_Code_Public_Store::save($a,$d,$a['version']);
            });
        }
        if ($route==='attempt/read') {
            $a=$this->require_record((string)$r->get_param('id'),'attempt');
            if ($a['owner']!==$uid) throw new RuntimeException('Tentativa indisponível para esta conta.',403);
            $this->event($a['parent'],$uid);
            return $a;
        }
        if ($route==='attempt') {
            return SC_Code_Public_Store::transaction(function() use($uid,$v) {
                $c=$this->require_record((string)($v['challenge_id'] ?? ''),'challenge'); $e=$this->event($c['parent'],$uid,false,true);
                $id=$this->attempt_id($c['id'],$uid); $a=SC_Code_Public_Store::get($id); $action=$v['action'] ?? 'save';
                if(!in_array($action,['save','pass'],true))$this->classroom_guard($e,$c,$uid);
                if (!empty($e['data']['teams_mode'])) return $this->game_attempt($e,$c,$uid,$v,$a);
                if ($a && $action==='start') { return $a; }
                $this->open($e);
                if (!$a) {
                    if ($action!=='start') { throw new RuntimeException('Abra o desafio antes de salvar.',409); }
                    return SC_Code_Public_Store::create('attempt',$e['id'],$uid,['event_id'=>$e['id'],'challenge_id'=>$c['id'],'code'=>'','language'=>$c['data']['languages'][0],'status'=>'working','started_at'=>time(),'revisions'=>0,'hints'=>0,'runs'=>0,'results'=>[]],$id);
                }
                if ($action==='start') { return $a; }
                $d=$a['data'];
                if ($action==='reopen') {
                    if ($d['status']==='validated') { throw new RuntimeException('A entrega validada está preservada. Peça ao professor para devolvê-la.',409); }
                    $d['status']='working'; unset($d['submitted_at'],$d['validated_hash']);
                } else {
                    if ($d['status']!=='working') { throw new RuntimeException('Reabra sua entrega antes de alterar o código.',409); }
                    $code=(string)($v['code'] ?? $d['code']); $language=$v['language'] ?? $d['language'];
                    if (strlen($code)>60000 || !in_array($language,$c['data']['languages'],true)) { throw new InvalidArgumentException('Código muito grande ou linguagem não permitida.'); }
                    if ($code!==$d['code'] || $language!==$d['language']) { $d['revisions']++; $d['results']=[]; }
                    $d['code']=$code; $d['language']=$language;
                    if ($action==='run') {
                        $results=$v['results'] ?? [];
                        if (!is_array($results) || strlen(wp_json_encode($results))>50000) { throw new InvalidArgumentException('Resultados de execução muito grandes.'); }
                        $d['results']=['source'=>'client_reported','items'=>$results,'code_hash'=>hash('sha256',$code),'at'=>time()]; $d['runs']++;
                    } elseif ($action==='submit') {
                        if (!trim($code)) { throw new InvalidArgumentException('Escreva sua tentativa antes de entregar.'); }
                        $d['status']='submitted'; $d['submitted_at']=time(); $d['submitted_hash']=hash('sha256',$code);
                    } elseif ($action!=='save') { throw new InvalidArgumentException('Ação inválida.'); }
                }
                return SC_Code_Public_Store::save($a,$d,(int)($v['version'] ?? 0));
            });
        }
        if ($route==='review') {
            $a=$this->require_record((string)($v['attempt_id'] ?? ''),'attempt'); $this->event($a['parent'],$uid,true);
            $d=$a['data'];
            if (!empty($d['team_id'])) return $this->game_review($uid,$v);
            if (!in_array($d['status'],['submitted','validated','revise'],true)) { throw new RuntimeException('O aluno ainda não entregou essa tentativa.',409); }
            $approve=($v['decision'] ?? '')==='approve';
            if (!$approve && ($v['decision'] ?? '')!=='revise') { throw new InvalidArgumentException('Escolha validar ou devolver para revisão.'); }
            $d['status']=$approve ? 'validated' : 'revise'; $d['validated_hash']=$approve ? hash('sha256',$d['code']) : '';
            $d['feedback']=mb_substr(sanitize_textarea_field($v['feedback'] ?? ''),0,2000); $d['reviewed_by']=$uid; $d['reviewed_at']=time();
            return SC_Code_Public_Store::save($a,$d,(int)($v['version'] ?? 0));
        }
        if ($route==='ranking') {
            $id=(string)$r->get_param('event_id'); $e=$this->event($id,$uid); $members=SC_Code_Public_Store::list('member',$id);
            foreach ($members as &$m) { $user=get_user_by('id',$m['owner']); $m['name']=$user ? $user->display_name : 'Participante'; } unset($m);
            if (!empty($e['data']['teams_mode'])) return SC_Code_Public_Store::transaction(function() use($id,$uid,$r) { $event=$this->event($id,$uid); return $this->game_ranking($event,$this->named_members($id),SC_Code_Public_Store::list('attempt',$id),SC_Code_Public_Store::list('challenge',$id),(string)$r->get_param('include_marks')==='1'); });
            return ['rows'=>SC_Code_Public_Domain::ranking($members,SC_Code_Public_Store::list('attempt',$id),SC_Code_Public_Store::list('challenge',$id))];
        }
        if ($route==='ai/settings') {
            if ($method==='GET') { return SC_Code_Public_AI::public_config($uid); }
            if (!empty($v['key']) && !is_ssl()) { throw new RuntimeException('Use HTTPS para salvar uma chave de IA.',400); }
            return SC_Code_Public_AI::settings($uid,$v);
        }
        if ($route==='ai/models') { $this->rate('models:'.$uid,10,60); $provider=$r->get_param('provider');return SC_Code_Public_AI::models($uid,$provider!==null?(string)$provider:null); }
        if ($route==='ai/test') {
            $this->rate('probe:'.$uid,5,60); $config=SC_Code_Public_AI::config($uid);
            if (empty($v['revision']) || $v['revision']!==SC_Code_Public_AI::revision($config)) throw new RuntimeException('Sua configuração de IA mudou. Recarregue e teste novamente.',409);
            SC_Code_Public_AI::key($uid,$config); $payload=SC_Code_Public_AI::test_payload($config);
            {
                $result=SC_Code_Public_AI::request($uid,'/chat/completions',$payload,$config);
                if(SC_Code_Public_AI::revision(SC_Code_Public_AI::config($uid))!==SC_Code_Public_AI::revision($config))throw new RuntimeException('A configuração mudou durante o teste. Teste novamente quando desejar.',409);
                return ['provider'=>$config['provider'],'model'=>$config['model'],'reasoning'=>$config['reasoning'],'transport'=>'server','matched'=>trim(SC_Code_Public_AI::content($result))==='CODE_OK'];
            }
        }
        if ($route==='ai/request') {
            $ticket=get_transient('scp_ai_'.(string)($v['ticket'] ?? ''));
            if(!$ticket || $ticket['uid']!==$uid || !in_array($ticket['mode'],['assessment','hint'],true) || empty($ticket['payload']))throw new RuntimeException('Esta consulta precisa ser iniciada novamente.',409);
            $this->event($ticket['event_id'],$uid,!empty($ticket['queued']),!empty($ticket['queued']));
            $a=$this->require_record($ticket['attempt'],'attempt');
            if(!$this->evaluation_access($ticket,$a,$uid) || $a['version']!==$ticket['attempt_version'] || hash('sha256',$a['data']['code'])!==$ticket['hash'] || $a['data']['language']!==$ticket['language'])throw new RuntimeException('O código ou a conversa mudou. Solicite novamente.',409);
            if($ticket['mode']==='assessment')$this->game_claim($a);
            if($ticket['mode']==='assessment' && ($a['data']['status']!=='submitted' || ($a['data']['assessment']['run_id'] ?? '')!==$ticket['run_id'] || $a['version']!==$ticket['attempt_version']))throw new RuntimeException('A entrega mudou durante a avaliação.',409);
            $config=SC_Code_Public_AI::config($uid);
            if(SC_Code_Public_AI::revision($config)!==$ticket['revision'])throw new RuntimeException('Sua configuração de IA mudou. Entregue novamente.',409);
            if($ticket['mode']==='assessment')$config=SC_Code_Public_AI::assessment_config($config,$a['data']['assessment']['evaluator_policy'] ?? []);
            $round=$v['round'] ?? 0;
            if(!is_int($round) || $round<0 || $round>2)throw new InvalidArgumentException('Tentativa de avaliação inválida.');
            $payload=$ticket['payload'];
            if($round>0 && $ticket['mode']==='hint')$payload['messages'][0]['content'].=' Recuperação automática: responda apenas um JSON válido e completo com analise_interna breve (no máximo 120 palavras) e dica não vazia; feche o objeto. Não exiba o diagnóstico exato na dica.';
            if($round>0 && $ticket['mode']==='assessment')$payload['messages'][0]['content'].=' Esta é uma recuperação automática. Verifique o formato antes de responder: objeto JSON único, sem markdown; verdict deve ser approved ou revise; rubric_version deve ser o número 2; reason no nível principal deve justificar uma reprovação (vazio ao aprovar), separado de integrity.reason; integrity deve conter suspected booleano e reason string (não vazia se houver suspeita). Não devolva grade, criteria ou category.';
            // Resolve the key before releasing SQL; no credentials are persisted in the job.
            $job=SC_Code_Public_AI_Job::run($uid,(string)$v['ticket'],$round,fn()=>SC_Code_Public_AI::request($uid,'/chat/completions',$payload,$config,true));
            return isset($job['raw']) ? ['ready'=>true] : $job;
        }
        if ($route==='ai/prepare') {
            $this->rate('ai:'.$uid,30,60);
            $mode=$v['mode'] ?? 'hint'; $c=$this->require_record((string)($v['challenge_id'] ?? ''),'challenge');
            $a=null; $reference=[];$question='';$draftHash=null;$level=max(1,min(3,(int)($v['level'] ?? 1)));
            if ($mode==='reconcile') {
                $e=$this->event($c['parent'],$uid,true);
                if($e['data']['status']!=='draft')throw new RuntimeException('Revise o conteúdo antes de publicar o evento.',409);
                $ref=$this->require_record(SC_Code_Public_Import::reference_id($c['id']),'reference');
                $archive=$ref['data']['source']['archive'];
                $reference=['catalog'=>$archive['Catalogo'][0] ?? [],'solutions'=>$archive['Solucoes'] ?? [],'texts'=>$archive['Textos'] ?? []];
            } elseif ($mode==='classify') {
                $e=$this->event($c['parent'],$uid,true);
                if ($e['data']['status']!=='draft') { throw new RuntimeException('Classifique os desafios antes de publicar.',409); }
            } elseif ($mode==='assessment') {
                $this->event($c['parent'],$uid); $a=$this->require_record($this->attempt_id($c['id'],$uid),'attempt'); $x=$a['data']['assessment'] ?? [];
                $this->game_claim($a);
                if(!empty($x['queued']))throw new RuntimeException('Esta entrega será avaliada na área do professor.',403);
                if ($a['data']['status']!=='submitted' || ($x['run_id'] ?? '')!==($v['run_id'] ?? '') || ($x['status'] ?? '')!=='running' || ($x['current_step_id'] ?? '')!=='ai_review' || empty($x['evidence']) || $c['version']!==$x['challenge_version']) throw new RuntimeException('Execute os testes desta entrega antes de solicitar a avaliação.',409);
            } elseif ($mode==='hint') {
                $event=$this->event($c['parent'],$uid);$this->classroom_guard($event,$c,$uid); $a=$this->require_record($this->attempt_id($c['id'],$uid),'attempt');
                if (array_key_exists('question',$v)) { if (!is_string($v['question']) || mb_strlen($v['question'])>1000) throw new InvalidArgumentException('A pergunta deve ter até 1000 caracteres.'); $question=trim(sanitize_textarea_field($v['question'])); if ($question==='') throw new InvalidArgumentException('Escreva sua pergunta antes de enviar.'); }
                if (isset($v['draft'])) {
                    $draft=$v['draft'];
                    if (!is_array($draft) || !is_string($draft['code'] ?? null) ||
                        strlen($draft['code'])>60000 || !in_array($draft['language'] ?? null,$c['data']['languages'],true) ||
                        !is_array($draft['results'] ?? null) || strlen(wp_json_encode($draft['results']))>100000) {
                        throw new InvalidArgumentException('Rascunho ou resultados inválidos para pedir uma dica.');
                    }
                    $draftHash=hash('sha256',$draft['code']);
                } elseif ($question==='' && !trim($a['data']['code'])) {
                    throw new InvalidArgumentException('Escreva sua tentativa antes de pedir uma dica.');
                }
            } else { throw new InvalidArgumentException('Tipo de análise inválido.'); }
            $config=SC_Code_Public_AI::config($uid);
            if (!empty($v['revision']) && $v['revision']!==SC_Code_Public_AI::revision($config)) throw new RuntimeException('Sua configuração de IA mudou. Inicie a consulta novamente.',409);
            $sourceRevision=SC_Code_Public_AI::revision($config);
            if($mode==='assessment')$config=SC_Code_Public_AI::assessment_config($config,$a['data']['assessment']['evaluator_policy'] ?? []);
            $evaluator=$mode==='assessment'?array_intersect_key($config,array_flip(['provider','model','reasoning'])):null;
            $context=$a['data'] ?? [];
            if ($draftHash!==null) {
                $context['code']=$draft['code'];
                $context['language']=$draft['language'];
                $context['results']=['source'=>'client_reported','code_hash'=>$draftHash,'items'=>$draft['results']];
            }
            $payload=SC_Code_Public_AI::payload($config,$mode,$c['data'],$context,$level,$reference,$question);
            $ticket=wp_generate_uuid4();
            set_transient('scp_ai_'.$ticket,['uid'=>$uid,'mode'=>$mode,'challenge'=>$c['id'],'attempt'=>$a['id'] ?? null,'hash'=>$a ? hash('sha256',$a['data']['code']) : null,'draft_hash'=>$draftHash,'draft_language'=>$draftHash!==null ? $draft['language'] : null,'language'=>$a['data']['language'] ?? null,'challenge_version'=>$c['version'],'level'=>$level,'question'=>$question,'event_id'=>$c['parent'],'attempt_version'=>$a['version'] ?? null,'run_id'=>$a['data']['assessment']['run_id'] ?? null,'payload'=>in_array($mode,['assessment','hint'],true) ? $payload : null,'revision'=>$sourceRevision,'evaluator'=>$evaluator],900);
            if (in_array($mode,['classify','reconcile'],true)) {
                $result=SC_Code_Public_AI::request($uid,'/chat/completions',$payload,$config);
                return $this->complete_ai($uid,['ticket'=>$ticket],SC_Code_Public_AI::content($result));
            }
            return ['ticket'=>$ticket,'revision'=>$sourceRevision,'evaluator'=>$evaluator];
        }
        if ($route==='ai/complete') { return $this->complete_ai($uid,$v); }
        if ($route==='account/export') {
            $out=['team_requests'=>SC_Code_Public_Store::list('request',null,$uid),'integrity'=>SC_Code_Public_Store::list('integrity',null,$uid),'race_marks'=>SC_Code_Public_Store::list('race_mark',null,$uid),'focus_sessions'=>SC_Code_Public_Store::list('focus',null,$uid),'focus_exits'=>SC_Code_Public_Store::list('focus_exit',null,$uid),'references'=>SC_Code_Public_Store::list('reference',null,$uid),'ai_jobs'=>SC_Code_Public_Store::list('ai_job',null,$uid),'credits'=>SC_Code_Public_Store::list('credit',null,$uid),'user'=>$this->user($uid),'exported_at'=>gmdate('c'),'events'=>SC_Code_Public_Store::list('event',null,$uid),'memberships'=>SC_Code_Public_Store::list('member',null,$uid),'attempts'=>SC_Code_Public_Store::list('attempt',null,$uid),'challenges'=>SC_Code_Public_Store::list('challenge',null,$uid)];
            $out['event_preferences']=SC_Code_Public_Store::list('event_pref',null,$uid);
            $out['collaborations']=SC_Code_Public_Store::list('collab',null,$uid);
            $out['teacher_requests']=SC_Code_Public_Store::list('teacher_req',null,$uid);
            $out['monitor_access']=SC_Code_Public_Store::list('watch',null,$uid);
            $out['monitor_invitations']=array_map(function($i){unset($i['data']['code_hash']);return $i;},SC_Code_Public_Store::list('watch_inv',null,$uid));
            return $out;
        }
        if ($route==='account/delete') {
            if (!is_ssl()) { throw new RuntimeException('Use HTTPS para confirmar sua senha.',400); }
            $u=get_user_by('id',$uid);
            if (($v['confirmation'] ?? '')!=='APAGAR' || !wp_check_password((string)($v['password'] ?? ''),$u->user_pass,$uid)) { throw new RuntimeException('Confira a senha e digite APAGAR para confirmar.',403); }
            if (SC_Code_Public_Store::list('event',null,$uid)) { throw new RuntimeException('Exclua seus eventos antes de apagar seus dados do Code.',409); }
            SC_Code_Public_Store::transaction(function() use($uid) { foreach (['claim','credit','boost','race_mark','request','shared','integrity','audit','member','attempt','focus','focus_exit','watch','teacher_req','collab','receipt','ai_job','event_pref'] as $kind) { foreach(SC_Code_Public_Store::list($kind,null,$uid) as $record) { SC_Code_Public_Store::remove($record['id']); } } });
            delete_user_meta($uid,'sc_code_public_ai'); delete_user_meta($uid,'sc_code_public_active');
            return ['ok'=>true,'message'=>'Seus dados do Code foram apagados. Sua conta neste site WordPress continua disponível.'];
        }
        throw new RuntimeException('Ação indisponível.',404);
    }
    private function complete_ai(int $uid,array $v,?string $server_raw=null): array {
        $id=(string)($v['ticket'] ?? ''); $ticket=get_transient('scp_ai_'.$id);
        if (!$ticket || $ticket['uid']!==$uid) { throw new RuntimeException('Esta revisão expirou. Solicite novamente.',409); }
        if ($server_raw===null) {
            $round=$v['round'] ?? null;
            if (!in_array($ticket['mode'],['hint','assessment'],true) || !is_int($round) || $round<0 || $round>2) {
                throw new InvalidArgumentException('Selecione uma consulta concluída pelo servidor.');
            }
            $server_raw=SC_Code_Public_AI_Job::completed($uid,$id,$round);
        }
        $raw=$server_raw;
        $v=['raw'=>$raw,'transport'=>'server'];
        if($ticket['mode']==='reconcile') {
            if(strlen($raw)>60000)throw new InvalidArgumentException('A proposta da IA é muito grande.');
            return SC_Code_Public_Store::transaction(function() use($ticket,$uid,$raw,$id,$v) {
                $c=$this->require_record($ticket['challenge'],'challenge');$e=$this->event($c['parent'],$uid,true,true);
                if($e['data']['status']!=='draft' || $c['version']!==$ticket['challenge_version'])throw new RuntimeException('A questão mudou durante a análise. Atualize e analise novamente.',409);
                $d=$c['data'];$d['reconciliation']=SC_Code_Public_Preparation::review($raw);
                $saved=SC_Code_Public_Store::save($c,$d,$c['version']);delete_transient('scp_ai_'.$id);
                return ['challenge'=>$saved,'transport'=>$v['transport'] ?? 'direct'];
            });
        }
        if ($ticket['mode']==='assessment') { if (strlen($raw)>10000) throw new InvalidArgumentException('Parecer muito grande.'); $result=$this->game_complete($uid,$ticket,$v); delete_transient('scp_ai_'.$id); return $result; }
        if (strlen($raw)>10000) { throw new InvalidArgumentException('Resposta muito grande.'); }
        if ($ticket['mode']==='classify') {
            return SC_Code_Public_Store::transaction(function() use($ticket,$uid,$raw,$id,$v) {
                $c=$this->require_record($ticket['challenge'],'challenge'); $e=$this->event($c['parent'],$uid,true,true);
                if ($e['data']['status']!=='draft' || $c['version']!==$ticket['challenge_version']) { throw new RuntimeException('O desafio mudou. Classifique novamente.',409); }
                $d=$c['data']; $d['suggestion']=SC_Code_Public_Domain::classification($raw);
                $saved=SC_Code_Public_Store::save($c,$d,$c['version']); delete_transient('scp_ai_'.$id);
                return ['challenge'=>$saved,'transport'=>$v['transport'] ?? 'direct'];
            });
        }
        return SC_Code_Public_Store::transaction(function()use($ticket,$uid,$raw,$id,$v){
        $this->event($ticket['event_id'],$uid,false,true);
        $a=$this->require_record($ticket['attempt'],'attempt');
        if ($a['owner']!==$uid || $a['version']!==$ticket['attempt_version'] || hash('sha256',$a['data']['code'])!==$ticket['hash'] || ($a['data']['language'] ?? null)!==($ticket['language'] ?? null)) { throw new RuntimeException('O código ou a conversa mudou durante a consulta. Envie novamente com o contexto atualizado.',409); }
        $d=$a['data']; $d['hints']++; $d['last_hint']=SC_Code_Public_Domain::hint($raw,$ticket['level']);
        if (!empty($ticket['question'])) $d['last_hint']['question']=$ticket['question'];
        $d['last_hint']['request']=!empty($ticket['question'])?$ticket['question']:([1=>'Pedir dica',2=>'Esclareça a orientação anterior',3=>'Sugira um experimento para investigar'][ $ticket['level']] ?? 'Pedir dica');
        $d['last_hint']['revision']=(int)($d['revisions'] ?? 0);
        $d['last_hint']['sequence']=$d['hints'];$d['last_hint']['code_hash']=$ticket['draft_hash'] ?? $ticket['hash'];$d['last_hint']['at']=time();
        if (!empty($ticket['draft_hash'])) $d['last_hint']['draft_language']=$ticket['draft_language'];
        $d['last_hint']['transport']=($v['transport'] ?? '')==='server' ? 'server' : 'direct';
        $history=$d['hint_history'] ?? []; $history[]=$d['last_hint']; $d['hint_history']=$history;
        $saved=SC_Code_Public_Store::save($a,$d,$a['version']); delete_transient('scp_ai_'.$id);
        return ['attempt'=>$saved,'hint'=>$d['last_hint'],'transport'=>$d['last_hint']['transport']];
        });
    }
}
