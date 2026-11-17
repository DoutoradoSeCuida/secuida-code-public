export type FullscreenState={supported:boolean;active:boolean;pending:boolean;error:string};
// Web-only adapter. Fullscreen never grants access to other apps or blocks OS shortcuts.
type WebDoc=Document & {webkitFullscreenElement?:Element;webkitFullscreenEnabled?:boolean;webkitExitFullscreen?:()=>Promise<void>|void};
type WebRoot=HTMLElement & {webkitRequestFullscreen?:()=>Promise<void>|void};
let state:FullscreenState={supported:false,active:false,pending:false,error:''};let owned=false;let generation=0;let flight:Promise<boolean>|null=null;
const listeners=new Set<()=>void>();
function read(){if(typeof document==='undefined')return{supported:false,active:false};const doc=document as WebDoc,root=doc.documentElement as WebRoot;return{supported:!!(root?.requestFullscreen||root?.webkitRequestFullscreen)&&(doc.fullscreenEnabled??doc.webkitFullscreenEnabled)!==false,active:(doc.fullscreenElement||doc.webkitFullscreenElement)===root};}
function publish(patch:Partial<FullscreenState>={}){state={...state,...read(),...patch};listeners.forEach(fn=>fn());}
export function fullscreenState(){return state;}
export function subscribeFullscreen(listener:()=>void){listeners.add(listener);const changed=()=>publish();if(listeners.size===1)publish();document.addEventListener('fullscreenchange',changed);document.addEventListener('webkitfullscreenchange',changed);return()=>{listeners.delete(listener);document.removeEventListener('fullscreenchange',changed);document.removeEventListener('webkitfullscreenchange',changed);};}
export function requestEventFullscreen():Promise<boolean>{
 if(flight)return flight;
 const observed=read();if(observed.active){owned=true;publish({error:''});return Promise.resolve(true);}if(!observed.supported){publish({error:'Este navegador não oferece tela cheia. O acompanhamento de visibilidade continua conforme as regras.'});return Promise.resolve(false);}
 const ticket=++generation;publish({pending:true,error:''});
 // Invoke synchronously in the click handler, before network/save awaits consume activation.
 let requested:Promise<void>|void;
 try{const root=document.documentElement as WebRoot;requested=root.requestFullscreen?root.requestFullscreen():root.webkitRequestFullscreen!();}catch(e){requested=Promise.reject(e);}
 const request=Promise.resolve(requested).then(async()=>{if(ticket!==generation){if(!owned&&!flight&&read().active){const doc=document as WebDoc;await (doc.exitFullscreen?doc.exitFullscreen():doc.webkitExitFullscreen?.());}return false;}owned=read().active;publish({pending:false,error:owned?'':'Clique em Retomar em tela cheia para continuar.'});return owned;},()=>{if(ticket===generation)publish({pending:false,error:'O navegador não abriu a tela cheia. Clique em Retomar em tela cheia e permita essa opção.'});return false;});
 flight=request;void request.finally(()=>{if(flight===request)flight=null;}).catch(()=>{});return request;
}
export async function exitEventFullscreen(){generation++;flight=null;const wasOwned=owned;owned=false;publish({pending:false,error:''});if(wasOwned&&read().active){try{const doc=document as WebDoc;await(doc.exitFullscreen?doc.exitFullscreen():doc.webkitExitFullscreen?.());}catch{publish({error:'Não foi possível encerrar a tela cheia. Use Esc para sair.'});}}publish();}
