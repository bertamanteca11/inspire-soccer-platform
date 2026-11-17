// Browser adapter for the isolated PostgreSQL bridge. No Supabase connection.
async function request(body:any){const response=await fetch('/discipline-test-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return response.json();}
function from(table:string){
  const state:any={kind:'read',table,filters:[],orders:[],offset:0,limit:500,select:'*',one:false};const query:any={};
  query.select=(columns:string)=>{state.select=columns;return query;};
  for(const op of ['eq','neq','gte','gt','lte','lt','in'])query[op]=(key:string,value:any)=>{state.filters.push({op,key,value});return query;};
  query.order=(key:string,options?:any)=>{state.orders.push({key,ascending:options?.ascending!==false});return query;};
  query.range=(from:number,to:number)=>{state.offset=from;state.limit=to-from+1;return query;};
  query.limit=(limit:number)=>{state.limit=limit;return query;};
  query.single=query.maybeSingle=()=>{state.one=true;return query;};
  for(const method of ['insert','update','upsert','delete'])query[method]=()=>{throw new Error('Disciplinary editing must use an atomic RPC, not direct '+method);};
  query.then=(resolve:any,reject:any)=>request(state).then(resolve,reject);return query;
}
export const supabase={from,rpc:(name:string,args:any)=>request({kind:'rpc',name,args})};
