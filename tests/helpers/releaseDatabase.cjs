const path=require('node:path');const crypto=require('node:crypto');
exports.createReleaseDatabase=async()=>{
  if(!process.env.RELEASE_PG_URL){const {PGlite}=require('@electric-sql/pglite');return new PGlite();}
  const url=new URL(process.env.RELEASE_PG_URL);
  // Never accept a hosted/production target for this destructive fixture suite.
  if(url.hostname!=='127.0.0.1'||url.port!=='55438'||url.pathname!=='/postgres'||url.username!=='postgres')throw Error('Native release tests require the dedicated local validation container');
  const {Client,types}=require(path.resolve(__dirname,'../../.phase4-test-artifacts/native-pg-client/node_modules/pg'));
  types.setTypeParser(20,Number);
  const maintenance=new Client({connectionString:url.href});await maintenance.connect();
  const name='inspire_validation_'+process.pid+'_'+crypto.randomBytes(6).toString('hex');
  await maintenance.query('CREATE DATABASE "'+name+'"');url.pathname='/'+name;
  const client=new Client({connectionString:url.href});await client.connect();
  return {native:true,query:(...args)=>client.query(...args),exec:text=>client.query(text),
    connect:async()=>{const extra=new Client({connectionString:url.href});await extra.connect();return extra;},
    close:async()=>{await client.end();try{await maintenance.query('DROP DATABASE "'+name+'"');}finally{await maintenance.end();}},
  };
};
