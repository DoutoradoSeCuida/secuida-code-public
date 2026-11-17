export type DraftState = { saved: {code:string;language:string;status:string}|null; code:string; language:string; flight:Promise<unknown>|null };
// Read again after every in-flight write: navigation must not lose a newer edit.
export async function flushPendingDraft(current:()=>DraftState, save:()=>Promise<unknown>):Promise<void> {
  while(true) {
    const state=current();
    if(state.flight){await state.flight;continue;}
    if(!state.saved || state.saved.status!=='working' || (state.saved.code===state.code && state.saved.language===state.language))return;
    await save();
  }
}
