// No production client, tokens or network: controlled authentication transitions.
type Result={data:any;error:any};
const pending=new Map<string,(result:Result)=>void>();
let listener:(event:string,session:any)=>void=()=>{};
const requests:string[]=[];
const empty=()=>Promise.resolve({data:[],error:null});
function query(table:string){
  let id='';
  const builder:any={};
  for(const method of ['select','order','range','limit','gte','neq','in'])builder[method]=()=>builder;
  builder.eq=(field:string,value:string)=>{if(field==='id')id=value;return builder};
  builder.single=()=>table==='profiles'?new Promise<Result>(resolve=>pending.set(id,resolve)):Promise.resolve({data:null,error:null});
  builder.maybeSingle=()=>Promise.resolve({data:null,error:null});
  builder.then=(...args:any[])=>empty().then(...args);
  requests.push(table);return builder;
}
export const supabase={from:query,rpc:async(name:string)=>{requests.push('rpc:'+name);return {data:name==='veo_status'?{version:1,ruleVersion:'2026-j5-v1'}:null,error:null}},auth:{
  getSession:async()=>({data:{session:{user:{id:'A'}}},error:null}),
  onAuthStateChange:(callback:typeof listener)=>{listener=callback;return {data:{subscription:{unsubscribe(){listener=()=>{}}}}}},
  signOut:async()=>{listener('SIGNED_OUT',null);return {error:null}},
}};
(window as any).authFixture={requests,
  change:(id:string|null)=>listener(id?'SIGNED_IN':'SIGNED_OUT',id?{user:{id}}:null),
  pending:()=>[...pending.keys()],
  resolve:(id:string,role:string|null)=>{pending.get(id)?.({data:role?{role}:null,error:role?null:{message:'Profile denied'}});pending.delete(id)},
};
