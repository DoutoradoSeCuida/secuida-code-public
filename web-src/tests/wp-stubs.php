<?php
// Test-only WordPress adapter. Never included in distributed plugin.
define('ARRAY_A','ARRAY_A'); define('DAY_IN_SECONDS',86400); define('SC_CODE_PUBLIC_VERSION','0.1.0');
class WP_Error { public function __construct(public $code,public $message,public $data=[]) {} }
class TestResponse { public $headers=[]; public function __construct(public $data) {} public function header($k,$v) { $this->headers[$k]=$v; } }
class TestRequest {
    public function __construct(public $method, public $body=[],public $params=[],public $headers=[]) {}
    public function get_header($name) { return $this->headers[strtolower($name)] ?? ''; }
    public function get_json_params() { return $this->body; }
    public function get_method() { return $this->method; }
    public function get_param($key) { return $this->params[$key] ?? null; }
}
class TestDB {
    public array $queries=[];
    public bool $connected=true; public int $closed=0; public int $reconnected=0;
    public function close(){if($this->db->inTransaction())throw new Exception("Closed active transaction");$this->connected=false;$this->closed++;return true;}
    public function check_connection($bail=true){$this->connected=true;$this->reconnected++;return true;}
    public $prefix='wp_'; public $last_error=''; public $fail=''; public PDO $db;
    public $field_types=['parent'=>'%d']; // WordPress wp_set_wpdb_vars defaults.
    public function __construct($file=':memory:') {
        $this->db=new PDO('sqlite:'.$file); $this->db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
        $this->db->exec('CREATE TABLE IF NOT EXISTS wp_sc_code_public_records (rid TEXT PRIMARY KEY,kind TEXT,parent TEXT,owner INTEGER,data TEXT,version INTEGER)');
        $this->db->exec('CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY,value TEXT)');
    }
    public function prepare($sql,...$args) {
        if (count($args)===1 && is_array($args[0])) $args=$args[0]; $i=0;
        return preg_replace_callback('/%[sd]/',function($m) use(&$i,$args) { $v=$args[$i++]; return $m[0]==='%d' ? (string)(int)$v : $this->db->quote((string)$v); },$sql);
    }
    public function query($sql) {
        $this->queries[]=$sql;
        $this->last_error='';
        if ($this->fail && str_starts_with($sql,$this->fail)) { $this->fail=''; $this->last_error='Injected SQL failure'; return false; }
        if(str_contains($sql,' ON DUPLICATE KEY UPDATE rid=rid'))$sql=str_replace(' ON DUPLICATE KEY UPDATE rid=rid',' ON CONFLICT(rid) DO UPDATE SET rid=excluded.rid',$sql);
        try { return $this->db->exec($sql==='START TRANSACTION' ? 'BEGIN' : $sql); }
        catch(Throwable $e) { $this->last_error=$e->getMessage(); return false; }
    }
    public function get_row($sql,$mode=null) { $this->queries[]=$sql; $this->last_error=''; $s=$this->db->query(str_replace(' FOR UPDATE','',$sql)); return $s->fetch(PDO::FETCH_ASSOC) ?: null; }
    public function get_var($sql) { $r=$this->get_row($sql); return $r ? reset($r) : null; }
    public function get_results($sql,$mode=null) { $this->queries[]=$sql;$this->last_error=''; return $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC); }
    public function insert($table,$data,$format=null) { $keys=array_keys($data);$values=[];$i=0;foreach($data as $key=>$value){$fmt=$format[$i++] ?? $this->field_types[$key] ?? '%s';$values[]=$fmt==='%d'?(string)(int)$value:$this->db->quote((string)$value);} return $this->query('INSERT INTO '.$table.' ('.implode(',',$keys).') VALUES ('.implode(',',$values).')'); }
    public function delete($table,$where) { $clauses=[]; foreach($where as $k=>$v) $clauses[]=$k.'='.$this->db->quote((string)$v); return $this->query('DELETE FROM '.$table.' WHERE '.implode(' AND ',$clauses)); }
}
function meta_read($key) { global $wpdb; $s=$wpdb->db->prepare('SELECT value FROM meta WHERE id=?');$s->execute([$key]);$v=$s->fetchColumn();return $v===false ? null : json_decode($v,true); }
function meta_write($key,$value) { global $wpdb;$s=$wpdb->db->prepare('INSERT OR REPLACE INTO meta (id,value) VALUES (?,?)');return $s->execute([$key,json_encode($value)]); }
function get_user_meta($uid,$key,$single=true) { return meta_read('user:'.$uid.':'.$key) ?? ''; }
function update_user_meta($uid,$key,$value) { return meta_write('user:'.$uid.':'.$key,$value); }
function delete_user_meta($uid,$key) { global $wpdb;$s=$wpdb->db->prepare('DELETE FROM meta WHERE id=?');return $s->execute(['user:'.$uid.':'.$key]); }
function get_option($key) { return $key==='users_can_register' ? true : meta_read('option:'.$key); }
function get_transient($key) { $v=meta_read('transient:'.$key);return $v && $v['expires']>time() ? $v['value'] : false; }
function set_transient($key,$value,$ttl) { return meta_write('transient:'.$key,['value'=>$value,'expires'=>time()+$ttl]); }
function delete_transient($key) { global $wpdb;$s=$wpdb->db->prepare('DELETE FROM meta WHERE id=?');return $s->execute(['transient:'.$key]); }
function wp_json_encode($v) { return json_encode($v,JSON_UNESCAPED_UNICODE); }
function wp_generate_uuid4() { return bin2hex(random_bytes(16)); }
function wp_salt($v) { return 'test-only-secret-not-for-production'; }
class TestUser extends stdClass {
    public function __construct(array $values) { foreach ($values as $key=>$value) $this->$key=$value; }
    public function add_cap($cap) { $GLOBALS['test_added_caps'][$this->ID][$cap]=true; $this->caps[$cap]=true; }
    public function remove_cap($cap) { unset($GLOBALS['test_added_caps'][$this->ID][$cap],$this->caps[$cap]); }
}
function get_user_by($field,$value) {
    foreach ([1=>['Professor','professor','professor@example.test'],2=>['Ana','ana','ana@example.test'],3=>['Outro Professor','outro','outro@example.test'],4=>['Bruno','bruno','bruno@example.test'],5=>['Caio','caio','caio@example.test']] as $id=>$u) {
        if (($field==='id' && $id==(int)$value) || ($field==='login' && $u[1]===$value) || ($field==='email' && $u[2]===$value)) return new TestUser(['ID'=>$id,'display_name'=>$u[0],'user_login'=>$u[1],'user_email'=>$u[2],'user_pass'=>password_hash('teste-123456',PASSWORD_BCRYPT,['cost'=>4]),'caps'=>$GLOBALS['test_added_caps'][$id] ?? [],'roles'=>[]]);
    }
    return false;
}
class WP_User_Query { private array $results=[]; private int $total=0; public function __construct($args) { foreach(range(1,5) as $id) { $u=get_user_by('id',$id); if(!user_can($id,'sc_code_public_teach') && !user_can($id,'manage_options'))continue; $term=trim($args['search'] ?? '', '*'); if($term!=='' && stripos($u->display_name.' '.$u->user_login.' '.$u->user_email,$term)===false)continue; $this->results[]=$u; } $this->total=count($this->results);$this->results=array_slice($this->results,($args['paged']-1)*$args['number'],$args['number']); } public function get_results(){return $this->results;} public function get_total(){return $this->total;} }
function get_role($role){return false;}
function wp_authenticate($login,$password) { $u=get_user_by(str_contains($login,'@') ? 'email' : 'login',$login);return $u && $password==='teste-123456' ? $u : new WP_Error('auth','Invalid'); }
function wp_check_password($password,$hash,$id=0) { return password_verify($password,$hash); }
function user_can($uid,$cap) { if (isset($GLOBALS['test_caps'][$uid])) return !empty($GLOBALS['test_caps'][$uid][$cap]) || !empty($GLOBALS['test_added_caps'][$uid][$cap]); return in_array($uid,[1,3]) || !empty($GLOBALS['test_added_caps'][$uid][$cap]); }
function wp_set_current_user($uid) { $GLOBALS['test_current_user']=$uid; }
function get_current_user_id() { return $GLOBALS['test_current_user'] ?? 0; }
function is_user_logged_in() { return get_current_user_id()>0; }
function wp_verify_nonce($n,$a) { return $n==='test-nonce'; }
function is_ssl() { return true; }
function sanitize_text_field($v) { return trim(strip_tags((string)$v)); }
function sanitize_textarea_field($v) { return trim(strip_tags((string)$v)); }
function sanitize_email($v) { return trim((string)$v); }
function sanitize_user($v,$strict=false) { return preg_replace('/[^a-zA-Z0-9_.-]/','',(string)$v); }
function is_email($v) { return filter_var($v,FILTER_VALIDATE_EMAIL)!==false; }
function rest_ensure_response($r) { return new TestResponse($r); }
function is_wp_error($r) { return $r instanceof WP_Error; }
function register_rest_route($ns,$path,$args) { $GLOBALS['test_routes'][trim($path,'/')]=$args; }
function wp_remote_request($url,$args) {
    $GLOBALS['remote_calls'][]=['url'=>$url,'args'=>$args];
    if (isset($GLOBALS['test_remote_hook'])) ($GLOBALS['test_remote_hook'])();
    if (isset($GLOBALS['test_remote_response'])) return $GLOBALS['test_remote_response'];
    if (getenv('SC_CODE_PUBLIC_MODEL_FIXTURE')==='1' && str_ends_with($url,'/models')) {
        if (($args['headers']['Authorization'] ?? '')==='Bearer fake-ui-rejected-key') return ['code'=>401,'body'=>'{}'];
        $models=str_contains($url,'generativelanguage.googleapis.com') ? ['gemini-2.5-flash','gemini-2.5-pro','gemini-3-flash-preview'] : (str_contains($url,'api.openai.com') ? ['gpt-4o','gpt-4o-mini','gpt-4.1','gpt-4.1-mini','gpt-4.1-nano','gpt-5','gpt-5-mini','gpt-5-nano','gpt-5.1','gpt-5.2','gpt-5.4','gpt-5.5','gpt-5.6-sol','gpt-6-astra','gpt-6.1-sol','o3','o4-mini','text-embedding-3-small'] : ['nvidia/nemotron-3-nano-30b-a3b','openai/gpt-oss-120b']);
        return ['code'=>200,'body'=>json_encode(['data'=>array_map(fn($id)=>['id'=>$id],$models)])];
    }
    if (str_ends_with($url,'/models')) return ['code'=>200,'body'=>json_encode(['data'=>[['id'=>str_contains($url,'generativelanguage.googleapis.com') ? 'gemini-fixture-flash' : 'fixture-model']]])];
    $p=json_decode($args['body'],true);
    if(str_contains($p['messages'][0]['content'] ?? '', 'Connection test.')) {
        if(getenv('SC_CODE_PUBLIC_MODEL_FIXTURE')==='1' && ($args['headers']['Authorization'] ?? '')==='Bearer fake-ui-delayed-key')usleep(3000000);
        if(getenv('SC_CODE_PUBLIC_MODEL_FIXTURE')==='1' && ($args['headers']['Authorization'] ?? '')==='Bearer fake-ui-format-key')return ['code'=>200,'body'=>json_encode(['choices'=>[['message'=>['content'=>'different format']]]])];
        if(($args['headers']['Authorization'] ?? '')==='Bearer fake-ui-rejected-key')return ['code'=>401,'body'=>'{}'];
        return ['code'=>200,'body'=>json_encode(['choices'=>[['message'=>['content'=>'CODE_OK']]]])];
    }
    if(getenv('SC_CODE_PUBLIC_PREP_FIXTURE')==='1' && str_contains($p['messages'][0]['content'],'Revise o conteúdo')) {
        $input=json_decode($p['messages'][1]['content'],true);
        return ['code'=>200,'body'=>json_encode(['choices'=>[['message'=>['content'=>json_encode(['status'=>'issues','summary'=>'Simulação local de parecer: confira os testes propostos. Nenhuma análise real foi enviada.','issues'=>['Alerta simulado para validar a revisão do professor.'],'proposed_tests'=>$input['examples'] ?? []])]]]])];
    }
    if (str_contains($p['messages'][0]['content'],'Rubrica v2')) return ['code'=>200,'body'=>json_encode(['choices'=>[['message'=>['content'=>'{"verdict":"approved","rubric_version":2,"integrity":{"suspected":false,"reason":""}}']]]])];
    if (str_contains($p['messages'][0]['content'],'Rubrica v1')) return ['code'=>200,'body'=>json_encode(['choices'=>[['message'=>['content'=>'{"verdict":"approved","grade":10,"criteria":{"correctness":10,"efficiency":10,"clarity":10},"rubric_version":1,"category":"coherent"}']]]])]; $classify=str_contains($p['messages'][0]['content'],'Classifique');
    return ['code'=>200,'body'=>json_encode(['choices'=>[['message'=>['content'=>$classify ? '{"level":"easy","reason":"Exige entrada e saída simples."}' : 'Confira os limites usados na repetição.']]]])];
}
function wp_remote_retrieve_response_code($r) { return $r['code']; }
function wp_remote_retrieve_body($r) { return $r['body']; }
function retrieve_password($v) { return true; }

$root=dirname(__DIR__,2).'/includes/';
if (!is_file($root.'rest.php')) $root=dirname(__DIR__,3).'/wp-plugins/sc-code-public/includes/';
foreach(['domain','store','ai','game','rest'] as $file) require_once $root.$file.'.php';
function test_call($route,$uid,$body=[], $method='POST',$params=[]) {
    wp_set_current_user($uid); $r=new TestRequest($method,$body,$params,['x-wp-nonce'=>'test-nonce']);
    $routes=$GLOBALS['test_routes']; $allowed=$routes[$route]['permission_callback']($r);
    if ($allowed instanceof WP_Error) return $allowed;
    $response=$routes[$route]['callback']($r);return $response instanceof TestResponse ? $response->data : $response;
}

// Unrelated product fixtures deliberately disable monitoring; production defaults
// are exercised with test_call directly in window-focus.php.
function test_free_event($uid,$body=[], $method='POST',$params=[]) {
    if($method==='POST')$body+=['focus_policy'=>['enabled'=>false,'grace_seconds'=>5,'warning_count'=>1,'points_per_exit'=>1,'max_penalty'=>5]];
    $r=test_call('events',$uid,$body,$method,$params);if(is_array($r) && $method==='POST'){$d=$r['data'];if(($body['policy_version'] ?? 0)!==2)unset($d['self_teams']);unset($d['classroom_version'],$d['phase'],$d['warmup_ids'],$d['hidden_ids'],$d['level_labels']);$r=SC_Code_Public_Store::save($r,$d,$r['version']);}return $r;
}

// Explicit pre-queue fixture for migration/legacy assessment recovery regressions.
// New delivery behavior is exercised without this adapter in evaluation-queue.php.
function test_legacy_submit($uid,$v) {
    $c=SC_Code_Public_Store::get($v['challenge_id']);
    $v['results']=array_map(fn($t)=>['output'=>$t['output'],'exit_code'=>0,'engine'=>'legacy-fixture'],$c['data']['tests']);
    $a=test_call('attempt',$uid,$v);if($a instanceof WP_Error)return $a;
    $d=$a['data'];$x=$d['assessment'];unset($x['queued'],$x['evidence']);$x['status']='running';$x['current_step_id']='execute';$d['assessment']=$x;
    return SC_Code_Public_Store::save($a,$d,$a['version']);
}
