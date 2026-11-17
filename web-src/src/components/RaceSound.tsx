import { useEffect } from 'react';
let audio: AudioContext | null = null;
export async function enableRaceSound() { audio ??= new AudioContext(); await audio.resume(); }
export function RaceSound({pulse, strength, onError}: {pulse:number; strength:number; onError:()=>void}) {
  useEffect(()=>{if(!pulse || !audio) return;try{const time=audio.currentTime; const n=Math.max(1,Math.min(5,strength));for(let i=0;i<n;i++){const osc=audio.createOscillator();const gain=audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(180+n*70+i*60,time+i*.1);gain.gain.setValueAtTime(.035,time+i*.1);gain.gain.exponentialRampToValueAtTime(.001,time+i*.1+.35);osc.connect(gain);gain.connect(audio.destination);osc.start(time+i*.1);osc.stop(time+i*.1+.4);}}catch{onError();}},[pulse]);
  return null;
}
