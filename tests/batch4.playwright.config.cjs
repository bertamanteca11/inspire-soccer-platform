const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:'batch4.ui.spec.cjs',workers:1,timeout:30000,
  outputDir:'../.phase4-test-artifacts/batch4',reporter:'list',
  use:{baseURL:'http://127.0.0.1:4178',headless:true,channel:process.env.VEO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)},
  webServer:{command:'npm.cmd run dev -- --host 127.0.0.1 --port 4178 --strictPort',url:'http://127.0.0.1:4178',reuseExistingServer:false,timeout:30000}});
