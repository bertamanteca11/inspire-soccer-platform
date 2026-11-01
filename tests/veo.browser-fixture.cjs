// Browser-only simulated transport. Actual SQL authorization/atomicity is tested
// independently in veo-database.test.cjs using PostgreSQL in memory.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true },
}).outputText, filename);
const {parseVeoBuffer}=require('../src/veo/parser.ts');
const {previewMatches}=require('../src/veo/analytics.ts');
const {stableJson}=require('../src/veo/importProtocol.ts');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
exports.browserBackend=function(){
  const source=previewMatches(parseVeoBuffer(fs.readFileSync('data/BIG DATA EQUIPO.xlsx')))[0];
  const players=source.players.map((p,i)=>({id:uuid(i+1),name:p.fullName,display_name:p.name,shirt_number:p.jersey}));
  const session={id:uuid(100),name:'J5 Alzamora',session_date:'2026-10-18',type:'league_match',opponent:'Alzamora C.F.'};
  const state={matches:[],facts:[],links:[],batches:[],writes:[]};
  const handler=async(route,url)=>{
    const path=url.pathname.split('/').pop();
    const request=route.request();
    if(path==='veo_status'){await route.fulfill({json:{version:1,ruleVersion:'2026-j5-v1'}});return true;}
    if(path==='veo_publish_import'){
      const args=request.postDataJSON();state.writes.push(args);
      const batchId=uuid(500+state.batches.length);
      const previous=state.matches[0];const incoming=args.p_payload.matches[0];
      const {players:observations,...data}=incoming;
      const ordered=rows=>[...rows].sort((a,b)=>a.playerId.localeCompare(b.playerId));
      if(previous?.active && stableJson({data,players:ordered(observations)})===
        stableJson({data:previous.data,players:ordered(state.facts.map(f=>f.data))})){
        await route.fulfill({json:{noOp:true,batchId:null}});return true;
      }
      state.matches=[{id:uuid(200),namespace:'inspire',season:'2026-2027',round:5,session_id:session.id,revision:(previous?.revision||0)+1,active:true,batch_id:batchId,data}];
      state.facts=observations.map(p=>({match_id:uuid(200),player_id:p.playerId,data:p,batch_id:batchId}));
      state.links=observations.map((p,i)=>({id:uuid(300+i),namespace:'inspire',source_key:p.sourceKey,player_id:p.playerId}));
      state.batches.push({id:batchId,namespace:'inspire',season:'2026-2027',filename:args.p_payload.filename,status:'published',created_at:new Date().toISOString(),reverted_at:null,validation:{serverValidated:true,approved:true}});
      await route.fulfill({json:{noOp:false,batchId,matches:1}});return true;
    }
    if(path==='veo_revert_import'){
      state.writes.push(request.postDataJSON());
      state.matches=state.matches.map(m=>({...m,active:false}));state.facts=[];
      state.batches=state.batches.map(b=>({...b,status:'reverted',reverted_at:new Date().toISOString()}));
      await route.fulfill({json:{noOp:false}});return true;
    }
    const tables={veo_calculated_stats:[],veo_matches:state.matches,veo_player_match_stats:state.facts,veo_player_links:state.links,veo_import_batches:state.batches,players,sessions:[session]};
    if(request.method()==='GET'&&Object.hasOwn(tables,path)){
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||500);
      await route.fulfill({json:tables[path].slice(offset,offset+limit)});return true;
    }
    return false;
  };
  return {handler,state,players,session};
};
