// Fixed distance per point: other teams scoring never lowers an existing rocket.
export const RACE_POINT_PX=28;
export function raceScale(teams:{points:number}[], marks:{anchor:number}[], viewport:number) {
  const pixelsPerPoint=RACE_POINT_PX;
  const peak=Math.max(0,...teams.map(t=>t.points),...marks.map(m=>m.anchor));
  const maximum=Math.max(10,Math.ceil((Math.max(0,viewport-150)/pixelsPerPoint)/5)*5,Math.ceil((peak+3)/5)*5);
  const height=maximum*pixelsPerPoint+65;
  const step=Math.max(5,Math.ceil(maximum/40/5)*5);
  const ticks=Array.from({length:Math.floor(maximum/step)+1},(_,i)=>i*step);
  return {maximum,height,pixelsPerPoint,ticks};
}
// Overview may reframe the picture; detailed mode retains fixed point distance.
export function raceOverviewScale(teams:{points:number}[],marks:{anchor:number}[],viewport:number) {
  const peak=Math.max(0,...teams.map(t=>t.points),...marks.map(m=>m.anchor));
  const maximum=Math.max(5,Math.ceil((peak+2)/5)*5);
  const height=Math.max(88,viewport-150);
  const pixelsPerPoint=(height-65)/maximum;
  const step=Math.max(1,Math.ceil(maximum/Math.max(2,Math.floor(height/65))));
  const ticks=Array.from({length:Math.floor(maximum/step)+1},(_,i)=>i*step);
  return {maximum,height,pixelsPerPoint,ticks};
}
