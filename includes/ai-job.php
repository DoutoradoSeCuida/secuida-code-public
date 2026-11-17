<?php
// Retry receipts preserve the result of each authorized provider call.
class SC_Code_Public_AI_Job {
    public static function completed(int $uid,string $ticket,int $round): string {
        $job=SC_Code_Public_Store::get(hash('sha256','ai_job:'.$uid.':'.$ticket.':'.$round));
        if (!$job || $job['kind']!=='ai_job' || $job['owner']!==$uid || $job['data']['status']!=='response') {
            throw new RuntimeException('O servidor ainda não confirmou essa consulta.',409);
        }
        return $job['data']['raw'];
    }
    public static function run(int $uid,string $ticket,int $round,callable $call): array {
        $id=hash('sha256','ai_job:'.$uid.':'.$ticket.':'.$round);
        $created=false;
        $job=SC_Code_Public_Store::transaction(function()use($uid,$id,&$created){
            global $wpdb;
            $nonce=wp_generate_uuid4();
            $data=['status'=>'calling','started_at'=>time(),'nonce'=>$nonce];
            $sql=$wpdb->prepare('INSERT INTO '.SC_Code_Public_Store::table()." (rid,kind,parent,owner,data,version) VALUES (%s,'ai_job',%s,%d,%s,1) ON DUPLICATE KEY UPDATE rid=rid",$id,(string)time(),$uid,wp_json_encode($data));
            if($wpdb->query($sql)===false)throw new RuntimeException('Não foi possível preparar a análise.',503);
            $job=SC_Code_Public_Store::get($id);
            $created=($job['data']['nonce'] ?? '')===$nonce;
            return $job;
        });
        if(!$created){
            if($job['data']['status']==='response')return ['raw'=>$job['data']['raw']];
            if($job['data']['status']==='failure')return ['failure'=>$job['data']['failure']];
            // A worker may still be calling the provider. Never duplicate an ambiguous call.
            if(time()-$job['data']['started_at']>120)throw new RuntimeException('Não foi possível recuperar esta consulta. Seu código está preservado; entregue novamente.',409);
            return ['pending'=>true];
        }
        try{$response=$call();$result=['raw'=>SC_Code_Public_AI::content($response)];$data=$job['data']+['raw'=>$result['raw']];$data['status']='response';}
        catch(Throwable $e){
            // SQL reconnection failure is ambiguous: preserve calling, not permission to call again.
            if((int)$e->getCode()===503)throw $e;
            $result=['failure'=>['status'=>(int)$e->getCode() ?: 502,'message'=>$e->getMessage()]];
            $data=$job['data']+['failure'=>$result['failure']];$data['status']='failure';
        }
        $data['finished_at']=time();
        // Keep the response in memory through short SQL failures, without calling the provider again.
        for($i=0;;$i++){
            try{SC_Code_Public_Store::save($job,$data,$job['version']);break;}
            catch(RuntimeException $e){if($i>=2 || $e->getCode()!==503)throw $e;usleep(random_int(200000,600000));}
        }
        return $result;
    }
}
