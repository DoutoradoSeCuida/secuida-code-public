// Absolute server timestamps keep deadline changes stable across refreshes.
export function deadlineWindow(event:{starts_at?:string;ends_at?:string;published_at?:number;schedule_updated_at?:number},fallback:number){
 const end=Date.parse(event.ends_at||'');
 const start=Date.parse(event.starts_at||'') || (event.schedule_updated_at||event.published_at||fallback/1000)*1000;
 return Number.isFinite(end)&&end>start?{start,end}:null;
}
export function crossedTimeCuts(previous:number,now:number,start:number,end:number){
 if(now<=previous||now>=end||end<=start)return [];
 return [.5,.25,.1].filter(cut=>(end-previous)/(end-start)>cut&&(end-now)/(end-start)<=cut);
}
