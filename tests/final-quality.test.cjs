const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {csvDocument}=require('../src/utils/csv.ts');
const {evaluationSnapshot}=require('../src/utils/evaluationSnapshot.ts');
const {readAttendancePages}=require('../src/utils/attendance.ts');

test('CSV preserves Spanish text, multiline values and quotes while neutralizing spreadsheet formulas',()=>{
  const csv=csvDocument([['José, "del Río"','dos\nlíneas',null,3,-1],['=1+1',' +SUM(A1)','\t@cmd','-2','normal']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"José, ""del Río"""'));
  assert.ok(csv.includes('"dos\nlíneas","","3","-1"'));
  for(const value of ["'=1+1","' +SUM(A1)","'\t@cmd","'-2"])assert.ok(csv.includes('"'+value+'"'));
  assert.ok(csv.includes('\r\n'));
});
test('reviewed evaluation snapshots ignore server timestamps but detect scores, N/A, identity and comment changes',()=>{
  const row={id:'e',session_id:'s',player_id:'p',evaluated:false,comment:'Texto',tactical_discipline:3,na_fields:{coachability:true}};
  const initial=evaluationSnapshot([row]);
  assert.equal(initial,evaluationSnapshot([{...row,submitted_at:'later',total_score:99}]));
  for(const patch of [{tactical_discipline:4},{na_fields:{}},{player_id:'other'},{comment:'Otro'},{evaluated:true},{not_applicable:true}])assert.notEqual(initial,evaluationSnapshot([{...row,...patch}]));
  assert.notEqual(initial,evaluationSnapshot([row,row]));
  assert.equal(evaluationSnapshot([row,{...row,id:'b'}]),evaluationSnapshot([{...row,id:'b'},row]));
});
test('attendance statistics discard previous pages if a later page has null data without a database error',async()=>{
  let page=0;
  const result=await readAttendancePages(async()=>++page===1?{data:[{id:'a',status:'present'}],error:null}:{data:null,error:null});
  assert.deepEqual(result.data,[]);assert.match(result.error.message,/incompleta/);
});
