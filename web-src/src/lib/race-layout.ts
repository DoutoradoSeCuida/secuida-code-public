export function raceLaneLayout(panelWidth:number,count:number,overview:boolean) {
  const available=Math.max(32,panelWidth-68);
  const laneWidth=overview?Math.max(32,available/Math.max(1,count)):Math.max(155,available/Math.max(1,Math.min(8,count)));
  return {laneWidth,compact:overview&&laneWidth<110,scrolls:laneWidth*count>available+1};
}
export function racePanelHeight(bottom:number,top:number) {
  return Math.max(220,Math.floor(bottom-top-24));
}
export function projectionPanelHeight(area:number,rows:number) {
  return Math.max(260,Math.floor((area-12*Math.max(0,rows-1))/Math.max(1,rows)));
}

// Keep historical markers beside the centered rocket even on very wide lanes.
export function raceMarkerRight(laneWidth:number) {
  return Math.max(6, laneWidth / 2 - 90);
}
