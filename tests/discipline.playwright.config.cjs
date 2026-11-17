const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:'discipline.ui.spec.cjs',workers:1,timeout:45000,
  outputDir:'../.phase4-test-artifacts/discipline-v2-ui',reporter:'list',
  use:{baseURL:'http://127.0.0.1:4181',headless:true,channel:process.env.VEO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4181 --strictPort',url:'http://127.0.0.1:4181',reuseExistingServer:false,timeout:30000}});
