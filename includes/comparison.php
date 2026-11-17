<?php
/** Output policy shared by execution evidence, publication and final grading. */
class SC_Code_Public_Comparison {
    public static function kind(array $d): string { return $d['import_info']['output_kind'] ?? 'exact'; }
    public static function tolerance(array $d): ?array {
        $s=$d['statement'] ?? '';
        if(!preg_match('/(?:erro|error)[^\n]{0,130}?10\s*\^\s*-\s*(\d{1,2})/iu',$s,$m))return null;
        $n=(int)$m[1];if($n<1||$n>15)return null;
        return ['epsilon'=>10**(-$n),'relative'=>!!preg_match('/(?:erro|error)[^\n]{0,130}relativ/iu',$s)];
    }
    public static function supported(array $d): bool {
        $k=self::kind($d);return $k==='exact'||$k==='constructive'||($k==='numeric'&&self::tolerance($d)!==null);
    }
    public static function compare(array $d,string $expected,string $actual): bool {
        if(self::kind($d)!=='numeric')return $expected===$actual;
        $t=self::tolerance($d);if(!$t)return false;
        $a=preg_split('/\s+/u',trim($actual));$b=preg_split('/\s+/u',trim($expected));if(count($a)!==count($b))return false;
        foreach($b as $i=>$v){
            if(!is_numeric($v)){if($a[$i]!==$v)return false;continue;}
            if(!preg_match('/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/D',$a[$i]))return false;
            $x=(float)$a[$i];$y=(float)$v;if(!is_finite($x)||!is_finite($y))return false;
            $limit=$t['epsilon']*($t['relative']?max(1,abs($y)):1);
            if(abs($x-$y)>$limit)return false;
        }return true;
    }
    public static function result(array $d,array $test,array $item): array {
        $valid=empty($item['error'])&&($item['exit_code'] ?? 1)===0;
        $pending=self::kind($d)==='constructive'&&$valid;
        return [...$item,'passed'=>$valid&&!$pending&&self::compare($d,$test['output'],$item['output']),'comparison'=>$pending?'ai_pending':self::kind($d)];
    }
    public static function accepted(array $d,array $items,array $judgment): bool {
        if(!$items)return false;
        if(self::kind($d)!=='constructive')return !in_array(false,array_column($items,'passed'),true);
        $checks=$judgment['output_checks'] ?? null;
        if(!is_array($checks)||count($checks)!==count($items))throw new SC_Code_Public_AI_Format('Faltou conferir cada saída válida. A avaliação será tentada novamente.');
        $all=true;
        foreach($items as $i=>$item){$c=$checks[$i] ?? [];if(($c['index'] ?? null)!==$i+1||!is_bool($c['passed'] ?? null)||!is_string($c['reason'] ?? null)||!trim($c['reason']))throw new SC_Code_Public_AI_Format('Conferência das saídas incompleta. Tente novamente.');if(!empty($item['error'])||($item['exit_code']??1)!==0||!$c['passed'])$all=false;}
        return $all;
    }
}
