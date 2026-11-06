const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:['final.ui.spec.cjs','auth.ui.spec.cjs','private-staff.ui.spec.cjs'],workers:1,timeout:30000,
  outputDir:'../.phase4-test-artifacts/final',reporter:'list',
  use:{baseURL:'http://127.0.0.1:4180',headless:true,channel:process.env.VEO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4180 --strictPort',url:'http://127.0.0.1:4180',reuseExistingServer:false,timeout:30000}});
