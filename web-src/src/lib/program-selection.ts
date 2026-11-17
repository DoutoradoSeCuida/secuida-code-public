import type { Challenge,EventData,Level } from '../types/sdk';
export function categorySelection(event:EventData,questions:Challenge[],level:Level){
 const items=questions.filter(c=>c.data.level===level&&!(event.warmup_ids||[]).includes(c.id));
 const hidden=(event.hidden_levels||[]).includes(level),shown=items.filter(c=>!hidden&&!(event.hidden_ids||[]).includes(c.id)).length;
 return {total:items.length,shown,mode:(!items.length?(hidden?'hide':'show'):shown===0?'hide':shown===items.length?'show':'partial') as 'show'|'hide'|'partial'};
}
export function categoryVisibility(event:EventData,questions:Challenge[],level:Level,show:boolean){
 const target=new Set(questions.filter(c=>c.data.level===level).map(c=>c.id));
 return {hidden_levels:show?(event.hidden_levels||[]).filter(l=>l!==level):[...new Set([...(event.hidden_levels||[]),level])],hidden_ids:show?(event.hidden_ids||[]).filter(id=>!target.has(id)):[...new Set([...(event.hidden_ids||[]),...target])]};
}
export function questionVisibility(event:EventData,questions:Challenge[],question:Challenge,show:boolean){
 const ids=new Set(event.hidden_ids||[]);let levels=event.hidden_levels||[];
 if(show&&levels.includes(question.data.level)){levels=levels.filter(l=>l!==question.data.level);for(const c of questions)if(c.data.level===question.data.level)ids.add(c.id);}
 if(show)ids.delete(question.id);else ids.add(question.id);
 return {hidden_levels:levels,hidden_ids:[...ids]};
}
export function importLevelSelection(items:{challenge:{level:Level}}[],selected:Set<number>,level:Level){
 const indices=items.map((item,index)=>item.challenge.level===level?index:-1).filter(i=>i>=0);const all=indices.length>0&&indices.every(i=>selected.has(i));const next=new Set(selected);
 for(const index of indices)if(all)next.delete(index);else next.add(index);return next;
}

export function phaseQuestions(event:EventData,questions:Challenge[],phase:'warmup'|'official',editing=false){
 if(editing)return questions;
 const warm=new Set(event.warmup_ids||[]),hidden=new Set(event.hidden_ids||[]),levels=new Set(event.hidden_levels||[]);
 return questions.filter(c=>phase==='warmup'?warm.has(c.id):!warm.has(c.id)&&!hidden.has(c.id)&&!levels.has(c.data.level));
}
