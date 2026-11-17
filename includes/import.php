<?php
// Source contract and mutation owner: mobile_apps/secuida-code/spec/code.md.
require_once __DIR__.'/preparation.php';
class SC_Code_Public_Import {
    public static function id(string $event,string $external): string { return hash('sha256','import:'.$event.':'.$external); }
    public static function reference_id(string $challenge): string { return hash('sha256','reference:'.$challenge); }
    public static function prepare(array $item): array {
        if (strlen(wp_json_encode($item))>12000000) throw new InvalidArgumentException('Esta questão excede o limite de 12 MB com imagens.');
        $source=$item['source'] ?? []; $external=$source['external_id'] ?? '';
        if (!is_string($external) || !preg_match('/^[A-Za-z0-9_-]{1,120}$/',$external) || !is_string($source['file_name'] ?? null) || strlen($source['file_name'])>250) throw new InvalidArgumentException('Identificação da questão importada inválida.');
        $archive=$source['archive'] ?? null;
        if (!is_array($archive) || !isset($archive['Catalogo'][0]) || ($archive['Catalogo'][0]['id'] ?? '')!==$external) throw new InvalidArgumentException('Referência de origem incompleta.');
        foreach ($archive as $sheet=>$rows) {
            if (!in_array($sheet,['Catalogo','Textos','Solucoes','Dicas','Exemplos','Fontes','Guia','Figuras'],true) || !is_array($rows) || count($rows)>2000) throw new InvalidArgumentException('Aba de referência inválida.');
            foreach ($rows as $row) { if (!is_array($row)) throw new InvalidArgumentException('Linha de referência inválida.');foreach($row as $value) if(!is_scalar($value) && $value!==null) throw new InvalidArgumentException('Valor de referência inválido.'); }
        }
        $row=$archive['Catalogo'][0]; $n=(int)($row['nivel'] ?? 0);
        if ($n<1 || $n>5 || empty($archive['Solucoes']) || empty($archive['Exemplos'])) throw new InvalidArgumentException('A questão precisa de nível, solução de referência e exemplos.');
        $data=SC_Code_Public_Domain::challenge($item['challenge'] ?? []);
        $data['level']=$n<=2?'easy':($n===3?'medium':'hard');$data['tests']=[];
        $declared=!empty($row['tipo_saida']);$kind=(string)($row['tipo_saida'] ?? '');$kind=str_contains($kind,'tolerância')?'numeric':(str_contains($kind,'construtiva')?'constructive':($kind==='exata'?'exact':'unconfirmed'));
        $warnings=array_values(array_filter([(string)($row['pendencias'] ?? ''),($row['permitir_geracao_sem_revisao'] ?? true)===false?'A fonte pede revisão antes do uso.':'']));
        $data['import_info']=['external_id'=>$external,'source_level'=>$n,'source_difficulty'=>(string)($row['dificuldade'] ?? ''),'source_status'=>(string)($row['status_revisao'] ?? ''),'review_status'=>'pending','output_kind'=>$kind,'comparison_declared'=>$declared,'warnings'=>$warnings];
        $media=$item['media'] ?? [];if(!is_array($media) || count($media)>40)throw new InvalidArgumentException('Quantidade de imagens inválida.');
        $ids=[];$clean=[];
        foreach($media as $image) {
            if(!is_array($image) || !is_string($image['id'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,100}$/',$image['id']) || isset($ids[$image['id']]) || !in_array($image['mime'] ?? '',['image/png','image/jpeg'],true) || !is_string($image['base64'] ?? null) || strlen($image['base64'])>6000000) throw new InvalidArgumentException('Imagem inválida na questão.');
            $bytes=base64_decode($image['base64'],true);
            if($bytes===false || !hash_equals(hash('sha256',$bytes),(string)($image['sha256'] ?? '')))throw new InvalidArgumentException('A integridade de uma imagem não foi confirmada.');
            $size=getimagesizefromstring($bytes);
            if(!$size || $size['mime']!==$image['mime'] || $size[0]>8192 || $size[1]>8192)throw new InvalidArgumentException('Formato ou dimensões de imagem inválidos.');
            $meta=null;foreach(($archive['Figuras'] ?? []) as $f)if(($f['figura_id'] ?? '')===$image['id'] && ($f['questao_id'] ?? '')===$external)$meta=$f;
            if(!$meta || ($meta['sha256'] ?? '')!==$image['sha256'] || ($meta['mime'] ?? '')!==$image['mime'] || ($meta['largura_original'] ?? null)!==$size[0] || ($meta['altura_original'] ?? null)!==$size[1])throw new InvalidArgumentException('Figuras e bytes da mídia têm metadados divergentes.');
            $ids[$image['id']]=true;$clean[]=['id'=>$image['id'],'mime'=>$image['mime'],'sha256'=>$image['sha256'],'base64'=>$image['base64'],'largura_original'=>$size[0],'altura_original'=>$size[1]];
        }
        $expected=array_values(array_filter(array_map('trim',explode(';',(string)($row['figuras_ids'] ?? '')))));
        $actual=array_keys($ids);sort($expected);sort($actual);if($expected!==$actual)throw new InvalidArgumentException('Há figuras ausentes ou extras na questão.');
        $data['figures']=array_map(fn($i)=>['id'=>$i['id'],'mime'=>$i['mime']],$clean);
        $data=SC_Code_Public_Preparation::adopt($data,$archive);
        return ['data'=>$data,'reference'=>['source'=>$source,'media'=>$clean],'external_id'=>$external];
    }
    public static function preserve(array $previous,array $data,array $request): array {
        foreach(['import_info','figures','attribution'] as $key) if(isset($previous[$key])) $data[$key]=$previous[$key];
        if(isset($previous['examples']) && !array_key_exists('examples',$request)) $data['examples']=$previous['examples'];
        if (!empty($previous['import_info'])) {
            $data['import_info']=$previous['import_info'];
            if(empty($data['import_info']['comparison_declared']) && isset($request['review_output_kind'])){
                if(!in_array($request['review_output_kind'],['unconfirmed','exact','numeric','constructive'],true))throw new InvalidArgumentException('Defina um comparador válido.');
                if($request['review_output_kind']!==$data['import_info']['output_kind'])$data['import_info']['review_status']='pending';
                $data['import_info']['output_kind']=$request['review_output_kind'];
            }
            $changed=$data['title']!==$previous['title'] || $data['topics']!==$previous['topics'] || $data['statement']!==$previous['statement'] || $data['tests']!==$previous['tests'] || ($data['examples'] ?? [])!==($previous['examples'] ?? []);
            if ($changed) {$data['import_info']['review_status']='provided';$data['import_info']['tests_origin']='existing';}
            elseif(isset($previous['reconciliation']))$data['reconciliation']=$previous['reconciliation'];
            if (!empty($request['confirm_import_review'])) {
                if (!SC_Code_Public_Comparison::supported($data)) throw new InvalidArgumentException('Esta questão exige um corretor especial de saída, ainda não disponível para publicação automática.');
                if (!$data['tests']) throw new InvalidArgumentException('Prepare e confira os testes de avaliação antes de confirmar a revisão.');
                $data['import_info']['review_status']='approved';
            }
            $data['import_info']['preparation_issues']=SC_Code_Public_Preparation::issues($data);
        }
        return $data;
    }
    public static function audit(array $challenges): array {
        $out=[];
        foreach($challenges as $c){
            if(empty($c['data']['import_info']))continue;
            $reference=SC_Code_Public_Store::get(self::reference_id($c['id']));if(!$reference)throw new RuntimeException('Referência de importação ausente.',409);
            $archive=$reference['data']['source']['archive'];$hints=$archive['Dicas'];usort($hints,fn($a,$b)=>$a['ordem_dica']<=>$b['ordem_dica']);
            $numbers=array_values(array_unique(array_column($archive['Exemplos'],'numero_exemplo')));sort($numbers,SORT_NUMERIC);$examples=[];
            foreach($numbers as $index=>$number){$example=$c['data']['examples'][$index] ?? null;if(!$example)throw new RuntimeException('Exemplos alterados: confira a auditoria antes de continuar.',409);$examples[]=['numero_exemplo'=>$number,'entrada'=>$example['input'],'saida'=>$example['output']];}
            if(count($numbers)!==count($c['data']['examples']))throw new RuntimeException('Quantidade de exemplos alterada após a importação.',409);
            $figures=[];foreach($reference['data']['media'] as $image){$bytes=base64_decode($image['base64'],true);$size=$bytes===false?false:getimagesizefromstring($bytes);if(!$size)throw new RuntimeException('Imagem importada inválida.',409);$figures[]=['figura_id'=>$image['id'],'mime'=>$size['mime'],'sha256'=>hash('sha256',$bytes),'largura_original'=>$size[0],'altura_original'=>$size[1]];}usort($figures,fn($a,$b)=>strcmp($a['figura_id'],$b['figura_id']));
            $out[]=['id'=>$reference['data']['source']['external_id'],'dados'=>$archive['Catalogo'][0],'solucao_detalhada'=>$archive['Solucoes'][0],'dicas'=>array_map(fn($h)=>['ordem_dica'=>$h['ordem_dica'],'texto'=>$h['texto_dica']],$hints),'exemplos'=>$examples,'figuras'=>$figures];
        }
        return ['questoes'=>$out];
    }
}
