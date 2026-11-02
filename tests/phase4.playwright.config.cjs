const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:__dirname,testMatch:['phase4.ui.spec.cjs','evaluation.ui.spec.cjs'],workers:1,timeout:45000,
  outputDir:'../.phase4-test-artifacts/results',reporter:'list',
  use:{baseURL:'http://127.0.0.1:4176',headless:true,channel:process.env.VEO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',url:'http://127.0.0.1:4176',reuseExistingServer:false,timeout:30000},
});
