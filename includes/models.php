<?php
// Product-specific capability contracts. Source URLs and scope: Code spec/models-plan.json.
class SC_Code_Public_Models {
    public static function normalize(string $provider,string $model): string {
        return $provider==='gemini' && str_starts_with($model,'models/') ? substr($model,7) : $model;
    }
    public static function describe(string $provider,string $model): array {
        $id=$model; $model=self::normalize($provider,$model);
        $options=['default']; $kind='default';
        $selectable=!preg_match('/embedding|embed-|whisper|tts|transcri|dall-e|imagen|sora|realtime|audio|image|moderation|(^|-)codex/i',$model);
        if ($provider==='openai' && preg_match('/(^|-)pro($|-)/',$model)) $selectable=false;
        $base=preg_replace('/-\d{4}-\d{2}-\d{2}$/','',$model);
        if ($selectable && $provider==='openai') {
            $contracts=[
                'gpt-5'=>['minimal','low','medium','high'],
                'gpt-5-mini'=>['minimal','low','medium','high'],
                'gpt-5-nano'=>['minimal','low','medium','high'],
                'gpt-5.1'=>['none','low','medium','high'],
                'gpt-5.2'=>['none','low','medium','high','xhigh'],
                'gpt-5.4'=>['none','low','medium','high','xhigh'],
                'gpt-5.5'=>['none','low','medium','high','xhigh'],
                'gpt-5.6-sol'=>['none','low','medium','high','xhigh','max'],
                'gpt-5.6-terra'=>['none','low','medium','high','xhigh','max'],
                'gpt-5.6-luna'=>['none','low','medium','high','xhigh','max'],
                'gpt-6-astra'=>['low','medium','high','xhigh','max'],
                'gpt-6-sol'=>['none','low','medium','high','xhigh','max'],
                'gpt-6-luna'=>['none','low','medium','high','xhigh','max'],
                'gpt-6.1-sol'=>['low','medium','high','xhigh','max'],
                'o3'=>['low','medium','high'],'o3-mini'=>['low','medium','high'],
                'o4-mini'=>['low','medium','high'],
            ];
            if (isset($contracts[$base])) { $kind='effort'; $options=array_merge($options,$contracts[$base]); }
        }
        // Gemini Pro is a chat model: "pro" is only excluded for OpenAI above.
        if ($provider==='gemini') {
            $selectable=(bool)preg_match('/^gemini-/', $model) && !preg_match('/embedding|audio|tts|image|robotics|computer-use|live|deep-research/',$model);
            if ($selectable && preg_match('/^gemini-(2\.5|3(?:\.\d+)?|4)(?:-|$)/',$model)) {
                $kind='effort'; $options=['default','minimal','low','medium','high'];
                if (preg_match('/^gemini-2\.5-flash(?:-|$)/',$model)) array_splice($options,1,0,['none']);
            }
        }
        if ($selectable && $provider==='nvidia') {
            if ($model==='nvidia/nemotron-3.5-super-vl-120b-a12b') { $kind='effort'; $options=['default','none','low','high']; }
            if (in_array($model,['openai/gpt-oss-120b','openai/gpt-oss-20b'],true)) { $kind='effort'; $options=['default','low','medium','high']; }
            if ($model==='nvidia/nemotron-3-nano-30b-a3b') { $kind='toggle'; $options=['default','off','on']; }
        }
        return ['id'=>$id,'selectable'=>$selectable,'reasoning'=>['kind'=>$kind,'options'=>$options,
            'note'=>!$selectable ? 'Este modelo não é compatível com as análises de texto desta app.' : ($kind==='default' ? 'Controle de raciocínio não confirmado para este modelo. Será usado o padrão do provedor.' : 'Opções conforme o contrato documentado deste modelo. Mais raciocínio pode aumentar a espera e o consumo.')]];
    }
    public static function validate(string $provider,string $model,string $reasoning): void {
        $d=self::describe($provider,$model);
        if ($model!=='' && !$d['selectable']) throw new InvalidArgumentException('Escolha um modelo compatível com análises de texto.');
        if (!in_array($reasoning,$d['reasoning']['options'],true)) throw new InvalidArgumentException('Este nível de raciocínio não está disponível para o modelo selecionado.');
    }
    public static function apply(array $payload,array $config): array {
        $provider=$config['provider']; $model=$config['model']; $reasoning=$config['reasoning'] ?? 'default';
        self::validate($provider,$model,$reasoning); $d=self::describe($provider,$model);
        if ($provider==='gemini' && isset($payload['model'])) $payload['model']=self::normalize($provider,$model);
        if ($reasoning!=='default') {
            if ($d['reasoning']['kind']==='effort') $payload['reasoning_effort']=$reasoning;
            if ($d['reasoning']['kind']==='toggle') $payload['chat_template_kwargs']=['enable_thinking'=>$reasoning==='on'];
        }
        if ($provider==='openai') {
            unset($payload['max_tokens']);
            $payload['max_completion_tokens']=$d['reasoning']['kind']==='effort' ? 16384 : 1024;
        } elseif ($provider==='gemini' && in_array($reasoning,['medium','high'],true)) {
            $payload['max_tokens']=$reasoning==='high' ? 32768 : 12288;
        } elseif ($provider==='nvidia') {
            $payload['max_tokens']=$model==='nvidia/nemotron-3.5-super-vl-120b-a12b' ? 8192 : 4096;
            if ($model==='nvidia/nemotron-3.5-super-vl-120b-a12b') $payload['stream']=false;
        }
        return $payload;
    }
}
