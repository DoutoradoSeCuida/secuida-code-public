<?php
require_once __DIR__.'/comparison.php';
// Canonical contract: mobile_apps/secuida-code/spec/code.md.
class SC_Code_Public_AI_Format extends InvalidArgumentException {}
class SC_Code_Public_Domain {
    const LANGUAGES = ['python', 'c', 'cpp', 'java', 'javascript'];
    const POINTS = ['easy' => 10, 'medium' => 20, 'hard' => 40];
    const CATEGORIES = ['interpretation', 'boundaries', 'repetition', 'state', 'efficiency', 'syntax', 'variables', 'input', 'conditions', 'coherent'];

    public static function challenge(array $v): array {
        $title = trim((string) ($v['title'] ?? ''));
        $statement = trim((string) ($v['statement'] ?? ''));
        if ($title === '' || strlen($title) > 200 || $statement === '' || strlen($statement) > 20000) {
            throw new InvalidArgumentException('Informe título e enunciado de até 20 mil caracteres.');
        }
        $level = $v['level'] ?? 'easy';
        if (!isset(self::POINTS[$level])) { throw new InvalidArgumentException('Dificuldade inválida.'); }
        $languages = array_values(array_intersect(self::LANGUAGES, (array) ($v['languages'] ?? self::LANGUAGES)));
        if (!$languages) { throw new InvalidArgumentException('Escolha pelo menos uma linguagem.'); }
        $tests = $v['tests'] ?? [];
        if (!is_array($tests) || count($tests) > 20) { throw new InvalidArgumentException('Use até 20 testes públicos.'); }
        $out = [];
        foreach ($tests as $test) {
            if (!is_array($test) || !isset($test['input'], $test['output']) || strlen((string)$test['input']) > 10000 || strlen((string)$test['output']) > 10000) {
                throw new InvalidArgumentException('Cada teste precisa de entrada e saída de até 10 mil caracteres.');
            }
            $out[] = ['input' => (string)$test['input'], 'output' => (string)$test['output']];
        }
        $examples=$v['examples'] ?? [];
        if(!is_array($examples) || count($examples)>20)throw new InvalidArgumentException('Use até 20 exemplos públicos.');
        $samples=[];foreach($examples as $ex){if(!is_array($ex) || !is_string($ex['input'] ?? null) || !is_string($ex['output'] ?? null) || strlen($ex['input'])>10000 || strlen($ex['output'])>10000)throw new InvalidArgumentException('Exemplo público inválido.');$samples[]=['input'=>$ex['input'],'output'=>$ex['output']];}
        return ['title'=>$title, 'statement'=>$statement, 'level'=>$level, 'languages'=>$languages,'examples'=>$samples,'attribution'=>mb_substr(strip_tags((string)($v['attribution'] ?? '')),0,2000),
            'topics'=>mb_substr(strip_tags((string)($v['topics'] ?? '')),0,300), 'tests'=>$out,
            'hint_policy'=>mb_substr(strip_tags((string)($v['hint_policy'] ?? '')),0,2000)];
    }

    public static function ranking(array $members, array $attempts, array $challenges, ?array $credits=null): array {
        $levels = [];
        foreach ($challenges as $c) { $levels[$c['id']] = $c['data']['level']; }
        $rows = [];
        foreach ($members as $m) {
            $rows[$m['owner']] = ['user_id'=>$m['owner'], 'name'=>$m['name'] ?? 'Participante', 'points'=>0,
                'validated'=>0, 'submitted'=>0, 'hints'=>0, 'revisions'=>0, 'elapsed_seconds'=>0,
                'by_level'=>['easy'=>0,'medium'=>0,'hard'=>0], 'badges'=>[]];
        }
        foreach ($attempts as $a) {
            if (!isset($rows[$a['owner']])) { continue; }
            $r = &$rows[$a['owner']]; $d = $a['data'];
            $r['hints'] += (int)($d['hints'] ?? 0); $r['revisions'] += (int)($d['revisions'] ?? 0);
            if (in_array($d['status'], ['submitted','validated','rejected','revise'], true)) {
                $r['submitted']++;
                $r['elapsed_seconds'] += max(0, (int)($d['submitted_at'] ?? 0) - (int)$d['started_at']);
            }
            $level = $levels[$d['challenge_id']] ?? null;
            if ($d['status'] === 'validated' && $level && ($d['validated_hash'] ?? '') === hash('sha256', $d['code'])) {
                $points=$credits===null ? self::POINTS[$level] : (int)($credits[$a['id']] ?? 0);
                if ($points>0) { $r['validated']++; $r['points'] += $points; $r['by_level'][$level]++; }
            }
            unset($r);
        }
        $rows = array_values($rows);
        usort($rows, fn($a,$b) => ($b['points'] <=> $a['points']) ?: ($b['validated'] <=> $a['validated']) ?: ($a['user_id'] <=> $b['user_id']));
        $last = null; $position = 0;
        foreach ($rows as $i => &$r) {
            $key = $r['points'].':'.$r['validated'];
            if ($key !== $last) { $position = $i+1; $last = $key; }
            $r['position'] = $position;
            if ($r['validated']) { $r['badges'][] = 'Primeiro desafio validado'; }
            if ($r['by_level']['hard']) { $r['badges'][] = 'Desafio difícil conquistado'; }
            if ($r['validated'] >= 5) { $r['badges'][] = 'Cinco conquistas'; }
        }
        return $rows;
    }

    public static function assessment(string $raw): array {
        $raw=trim(preg_replace('/^\xEF\xBB\xBF/','',$raw));
        if(preg_match('/\A```(?:json)?\s*([\s\S]*?)\s*```\z/i',$raw,$match))$raw=$match[1];
        $d=json_decode($raw,true);
        if(is_array($d) && ($d['rubric_version'] ?? null)===2){
            if(!in_array($d['verdict'] ?? '',['approved','revise'],true))throw new SC_Code_Public_AI_Format('Parecer inválido. A avaliação será tentada novamente.');
            $reason=$d['reason'] ?? '';
            if(!is_string($reason) || ($d['verdict']==='revise' && !trim($reason)))throw new SC_Code_Public_AI_Format('Reprovação sem justificativa técnica.');
            $integrity=$d['integrity'] ?? null;
            if(!is_array($integrity) || !is_bool($integrity['suspected'] ?? null) || !is_string($integrity['reason'] ?? null) || ($integrity['suspected'] && !trim($integrity['reason'])))throw new SC_Code_Public_AI_Format('Verificação de integridade incompleta.');
            return ['verdict'=>$d['verdict'],'grade'=>$d['verdict']==='approved'?10.0:0.0,'category'=>'coherent','rubric_version'=>2,'reason'=>mb_substr(strip_tags($reason),0,1600),'integrity'=>['suspected'=>$integrity['suspected'],'reason'=>mb_substr(strip_tags($integrity['reason']),0,1200)],'output_checks'=>$d['output_checks'] ?? null];
        }
        if (!is_array($d) || !in_array($d['verdict'] ?? '',['approved','revise','inconclusive'],true) || ($d['rubric_version'] ?? null)!==1 || !in_array($d['category'] ?? '',self::CATEGORIES,true)) throw new SC_Code_Public_AI_Format('Parecer inválido. Continue a avaliação ou peça revisão.');
        $criteria=$d['criteria'] ?? []; $scores=[];
        foreach (['correctness','efficiency','clarity'] as $key) {
            if (!is_numeric($criteria[$key] ?? null) || $criteria[$key]<0 || $criteria[$key]>10) throw new SC_Code_Public_AI_Format('Rubrica incompleta. Continue a avaliação.');
            $scores[$key]=round((float)$criteria[$key],1);
        }
        $grade=round($scores['correctness']*.6+$scores['efficiency']*.2+$scores['clarity']*.2,1);
        $integrity=$d['integrity'] ?? ['suspected'=>false,'reason'=>''];if(!is_array($integrity)||!is_bool($integrity['suspected'] ?? null)||!is_string($integrity['reason'] ?? null)||($integrity['suspected'] && !trim($integrity['reason'])))throw new SC_Code_Public_AI_Format('Suspeita sem fundamento. Continue a avaliação.');
        return ['integrity'=>['suspected'=>$integrity['suspected'],'reason'=>mb_substr(strip_tags($integrity['reason']),0,1200)],'verdict'=>$d['verdict'],'grade'=>$grade,'criteria'=>$scores,'category'=>$d['category'],'rubric_version'=>1];
    }

    public static function classification(string $raw): array {
        $d = json_decode($raw, true);
        if (!is_array($d) || !isset(self::POINTS[$d['level'] ?? '']) || !is_string($d['reason'] ?? null)) {
            throw new InvalidArgumentException('A IA não retornou uma classificação válida. Tente novamente.');
        }
        return ['level'=>$d['level'], 'reason'=>mb_substr(strip_tags($d['reason']),0,600), 'status'=>'proposal'];
    }

    public static function hint(string $raw, int $level): array {
        $text = trim($raw);
        if ($text === '') throw new SC_Code_Public_AI_Format('A IA não retornou uma pista. Tente novamente.');
        if (preg_match('/^\s*(?:```(?:json)?\s*)?\{/i',$text)) {
            $json=preg_replace('/^\s*```(?:json)?\s*|\s*```\s*$/i','',$text);$decoded=json_decode($json,true);
            if (!is_array($decoded) || !is_string($decoded['dica'] ?? null) || !trim($decoded['dica'])) throw new SC_Code_Public_AI_Format('A IA não retornou uma dica válida. Tente novamente.');
            $text=trim($decoded['dica']);
        }
        return ['level'=>max(1,min(3,$level)), 'text'=>$text, 'assessment'=>'indicative'];
    }
}
