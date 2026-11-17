import { Text, View } from 'react-native';
import { ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
export function DateTimeField({label,value,onChange,disabled=false,helperText}:{label:string;helperText?:string;value:string;onChange:(v:string)=>void;disabled?:boolean}){
 const d=value?new Date(value):null;const local=d && !isNaN(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 const change=(v:string)=>{if(!v){onChange('');return;}const n=new Date(v);if(!isNaN(n.getTime()))onChange(n.toISOString());};
 return <View style={{gap:6}}><Text style={{fontWeight:'800',color:'#172b3a'}}>{label}</Text><input aria-label={label} type="datetime-local" disabled={disabled} value={local} onInput={e=>change((e.target as HTMLInputElement).value)} onChange={e=>change(e.target.value)} style={{minHeight:48,border:'1px solid #aebfce',borderRadius:10,padding:'0 12px',font:'15px system-ui',color:'#172b3a',background:'#fff',boxSizing:'border-box',width:'100%'}} />{helperText&&<Text style={ui.muted}>{helperText}</Text>}{!!value&&<PrimaryButton label={`Remover ${label.toLowerCase().replace(' (opcional)','')}`} variant="secondary" disabled={disabled} onPress={()=>onChange('')}/>}<Text style={ui.muted}>Horário local: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text></View>;
}
