type OutputData={statement:string;import_info?:{output_kind:string;comparison_declared?:boolean}};
export function specialSupported(data:OutputData) {
 const kind=data.import_info?.output_kind || 'exact';
 if(kind==='exact'||kind==='constructive')return true;
 if(kind==='unconfirmed'&&!data.import_info?.comparison_declared)return true;
 const match=(data.statement || '').match(/(?:erro|error)[^\n]{0,130}?10\s*\^\s*-\s*(\d{1,2})/iu);
 return kind==='numeric'&&!!match&&Number(match[1])>=1&&Number(match[1])<=15;
}
