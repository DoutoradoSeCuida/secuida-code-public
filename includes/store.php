<?php
class SC_Code_Public_Store {
    private static int $depth=0;
    private static bool $rollbackOnly=false;
    public static function table(): string { global $wpdb; return $wpdb->prefix.'sc_code_public_records'; }
    public static function install(): void {
        global $wpdb;
        require_once ABSPATH.'wp-admin/includes/upgrade.php';
        $t=self::table(); $cc=$wpdb->get_charset_collate();
        dbDelta("CREATE TABLE $t (
            rid varchar(64) NOT NULL,
            kind varchar(20) NOT NULL,
            parent varchar(64) NOT NULL DEFAULT '',
            owner bigint(20) unsigned NOT NULL,
            data longtext NOT NULL,
            version bigint(20) unsigned NOT NULL DEFAULT 1,
            PRIMARY KEY  (rid),
            KEY scope (kind,parent),
            KEY user_scope (owner,kind)
        ) ENGINE=InnoDB $cc;");
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($t))) === $t) {
            update_option('sc_code_public_schema', SC_CODE_PUBLIC_VERSION, false);
            if ($role=get_role('administrator')) { $role->add_cap('sc_code_public_teach'); }
        }
    }
    public static function decode($row): ?array {
        if (!$row) { return null; }
        $data=json_decode($row['data'],true);
        if (!is_array($data)) { throw new RuntimeException('Dados inválidos. Entre em contato com o responsável.',500); }
        return ['id'=>$row['rid'],'kind'=>$row['kind'],'parent'=>$row['parent'],'owner'=>(int)$row['owner'],'version'=>(int)$row['version'],'data'=>$data];
    }
    public static function get(string $id): ?array {
        global $wpdb; $row=$wpdb->get_row($wpdb->prepare('SELECT * FROM '.self::table().' WHERE rid=%s',$id),ARRAY_A);
        if ($wpdb->last_error) { throw new RuntimeException('Não foi possível carregar os dados.',503); }
        return self::decode($row);
    }
    public static function list(string $kind, ?string $parent=null, ?int $owner=null): array {
        global $wpdb; $sql='SELECT * FROM '.self::table().' WHERE kind=%s'; $args=[$kind];
        if ($parent!==null) { $sql.=' AND parent=%s'; $args[]=$parent; }
        if ($owner!==null) { $sql.=' AND owner=%d'; $args[]=$owner; }
        $rows=$wpdb->get_results($wpdb->prepare($sql.' ORDER BY rid',$args),ARRAY_A);
        if ($wpdb->last_error) { throw new RuntimeException('Não foi possível carregar os dados.',503); }
        return array_map([self::class,'decode'],$rows ?: []);
    }
    public static function revision(string $kind,string $parent): string {
        global $wpdb;
        $rows=$wpdb->get_results($wpdb->prepare('SELECT rid,version FROM '.self::table().' WHERE kind=%s AND parent=%s ORDER BY rid',$kind,$parent),ARRAY_A);
        if ($wpdb->last_error) throw new RuntimeException('Não foi possível conferir as atualizações.',503);
        return hash('sha256',wp_json_encode($rows ?: []));
    }
    public static function owners(string $kind,string $parent): array {
        global $wpdb;
        $rows=$wpdb->get_results($wpdb->prepare('SELECT owner FROM '.self::table().' WHERE kind=%s AND parent=%s',$kind,$parent),ARRAY_A);
        if ($wpdb->last_error) throw new RuntimeException('Não foi possível carregar os participantes.',503);
        return array_fill_keys(array_map(fn($row)=>(int)$row['owner'],$rows ?: []),true);
    }
    public static function create(string $kind,string $parent,int $owner,array $data,?string $id=null): array {
        global $wpdb; $id=$id ?: wp_generate_uuid4();
        // WordPress globally maps a column named parent to %d. Our IDs are text.
        if ($wpdb->insert(self::table(),['rid'=>$id,'kind'=>$kind,'parent'=>$parent,'owner'=>$owner,'data'=>wp_json_encode($data),'version'=>1],['%s','%s','%s','%d','%s','%d'])!==1) {
            throw new RuntimeException('Não foi possível salvar. Tente novamente em instantes.',503);
        }
        return self::get($id);
    }
    public static function save(array $record,array $data,int $expected): array {
        global $wpdb;
        $n=$wpdb->query($wpdb->prepare('UPDATE '.self::table().' SET data=%s,version=version+1 WHERE rid=%s AND version=%d',wp_json_encode($data),$record['id'],$expected));
        if ($n===false) { throw new RuntimeException('O site não conseguiu salvar agora.',503); }
        if ($n!==1) { throw new RuntimeException('Os dados mudaram ou não puderam ser salvos. Atualize antes de tentar novamente.',409); }
        return self::get($record['id']);
    }
    public static function reparent(array $record,string $parent): array {
        global $wpdb;
        $n=$wpdb->query($wpdb->prepare('UPDATE '.self::table().' SET parent=%s,version=version+1 WHERE rid=%s AND version=%d',$parent,$record['id'],$record['version']));
        if ($n!==1) throw new RuntimeException('Não foi possível recuperar o vínculo da questão. Retome para tentar novamente.',409);
        return self::get($record['id']);
    }
    public static function remove(string $id): void {
        global $wpdb;
        if ($wpdb->delete(self::table(),['rid'=>$id])===false) { throw new RuntimeException('Não foi possível excluir os dados.',503); }
    }
    // A unique row serializes retries, including concurrent requests after a lost response.
    public static function once(int $uid,string $key,string $fingerprint,callable $fn) {
        if(!preg_match('/^[a-zA-Z0-9-]{16,100}$/D',$key))throw new InvalidArgumentException('Identificador de operação inválido.');
        return self::transaction(function()use($uid,$key,$fingerprint,$fn){
            global $wpdb;$t=self::table();$id=hash('sha256','receipt:'.$uid.':'.$key);
            $pending=wp_json_encode(['fingerprint'=>$fingerprint,'done'=>false]);
            $sql=$wpdb->prepare("INSERT INTO $t (rid,kind,parent,owner,data,version) VALUES (%s,'receipt',%s,%d,%s,1) ON DUPLICATE KEY UPDATE rid=rid",$id,(string)time(),$uid,$pending);
            if($wpdb->query($sql)===false)throw new RuntimeException('Não foi possível registrar a operação.',503);
            $row=self::get($id); // INSERT above holds the exclusive key lock until COMMIT.
            if(!$row || !hash_equals($row['data']['fingerprint'],$fingerprint))throw new RuntimeException('Esta operação já foi usada para outro conteúdo.',409);
            if($row['data']['done'])return $row['data']['result'];
            $result=$fn();
            self::save($row,['fingerprint'=>$fingerprint,'done'=>true,'result'=>$result],$row['version']);
            return $result;
        });
    }
    // Only the assessment HTTP wait uses this. Never release an active SDK transaction.
    public static function external(callable $fn) {
        global $wpdb;
        if(self::$depth!==0)throw new LogicException('Chamada externa dentro de transação.');
        $closed=$wpdb->close();
        try{return $fn();}
        finally{if($closed && !$wpdb->check_connection(false))throw new RuntimeException('Não foi possível reconectar para registrar a análise.',503);}
    }
    public static function transaction(callable $fn) {
        global $wpdb;
        if(self::$depth>0){
            self::$depth++;
            try{return $fn();}catch(Throwable $e){self::$rollbackOnly=true;throw $e;}finally{self::$depth--;}
        }
        if ($wpdb->query('START TRANSACTION')===false) { throw new RuntimeException('Não foi possível iniciar a gravação.',503); }
        self::$depth=1;self::$rollbackOnly=false;
        try {
            $r=$fn();
            if(self::$rollbackOnly)throw new RuntimeException("Não foi possível confirmar a operação.",503);
            if ($wpdb->query('COMMIT')===false) { throw new RuntimeException('Não foi possível confirmar a gravação.',503); }
            return $r;
        } catch (Throwable $e) { $wpdb->query('ROLLBACK'); throw $e; }
        finally{self::$depth=0;self::$rollbackOnly=false;}
    }
}
