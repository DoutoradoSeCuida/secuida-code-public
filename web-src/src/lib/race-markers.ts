import type { RaceMark } from '../types/sdk';
export function groupRaceMarks(marks:RaceMark[], teamId:string, maximum:number, height:number) {
  const groups=new Map<number,RaceMark[]>();
  for(const mark of marks){
    if(mark.team_id!==teamId)continue;
    const y=8+Math.min(1,Math.max(0,mark.anchor/Math.max(1,maximum)))*Math.max(40,height-65);
    const band=Math.round(y/30);const group=groups.get(band)||[];group.push(mark);groups.set(band,group);
  }
  return [...groups.entries()].map(([band,items])=>({bottom:Math.min(height-34,Math.max(4,band*30)),items}));
}
