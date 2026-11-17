import type { Challenge, OutputComparison, RunResult } from '../types/sdk';

const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function matchesNumeric(expected:string, output:string, tolerance:NonNullable<OutputComparison['tolerance']>) {
  const wanted=expected.trim().split(/\s+/);
  const actual=output.trim().split(/\s+/);
  return wanted.length===actual.length && wanted.every((token,index)=>{
    if(!numeric.test(token))return token===actual[index];
    if(!numeric.test(actual[index]))return false;
    const target=Number(token), value=Number(actual[index]);
    const limit=tolerance.epsilon*(tolerance.relative?Math.max(1,Math.abs(target)):1);
    return Number.isFinite(target) && Number.isFinite(value) && Math.abs(target-value)<=limit;
  });
}

export function comparePractice(challenge:Challenge, results:RunResult[]):RunResult[] {
  const policy=challenge.data.output_comparison;
  return results.map((result,index)=>{
    const valid=!result.error && !result.infrastructure_error && result.exit_code===0;
    const expected=challenge.data.tests[index].output;
    if(policy?.kind==='constructive')return {...result,passed:false,comparison:valid?'ai_pending':'constructive'};
    if(policy?.kind==='numeric')return {...result,passed:valid && !!policy.tolerance && matchesNumeric(expected,result.output,policy.tolerance),comparison:'numeric'};
    return {...result,passed:valid && expected===result.output,comparison:'exact'};
  });
}
