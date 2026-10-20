#!/usr/bin/env node
/* Basic offline/layout checks. The full checklist in references remains required. */
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {pathToFileURL}=require('url');
const opts={};
for(let i=2;i<process.argv.length;i+=2)opts[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
if(!opts.input||!opts.out){console.error('Usage: node check_browser.cjs --input intro.html --out checks [--module playwright-core-path] [--browser executable]');process.exit(2)}
let playwright;
if(opts.module)playwright=require(path.resolve(opts.module));
else{try{playwright=require('playwright')}catch(_){playwright=require('playwright-core')}}
const executable=opts.browser||(process.platform==='darwin'&&fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
(async()=>{
 const out=path.resolve(opts.out);fs.mkdirSync(out,{recursive:true});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'html-intro-check-'));
 const file=path.join(tmp,'intro.html');fs.copyFileSync(path.resolve(opts.input),file);
 const browser=await playwright.chromium.launch({executablePath:executable,headless:true,args:['--disable-background-networking']});
 const report={scope:'逐屏布局、资源离线加载、暂停定位基础检查；不代替完整验收清单',views:[],errors:[],httpRequests:[]};
 try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport,offline:true}),page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(e.message));
   page.on('request',r=>{if(/^https?:/.test(r.url()))report.httpRequests.push(r.url())});
   page.on('requestfailed',r=>report.errors.push(r.url().slice(0,160)+' '+r.failure()?.errorText));
   await page.goto(pathToFileURL(file).href);
   await page.selectOption('#pace','manual');
   const count=await page.locator('.scene').count();
   assert(count>0,'需要 .scene 分屏');
   assert.equal(await page.locator('[data-scene]').count(),count,'章节数与分屏数不一致');
   const durations=JSON.parse(await page.locator('#screen').getAttribute('data-durations'));
   assert.equal(durations.length,count);assert(durations.every(x=>Number.isFinite(x)&&x>0));
   const view={viewport,scenes:[],seconds:durations.reduce((a,b)=>a+b,0)};
   for(let i=0;i<count;i++){
    await page.locator('[data-scene="'+i+'"]').click();
    const state=await page.evaluate(()=>{
     const s=document.querySelector('.scene.active'),r=document.querySelector('#screen').getBoundingClientRect();
     const overflow=[...s.querySelectorAll('*')].filter(x=>{
      if(x.classList.contains('sr-only'))return false;
      const b=x.getBoundingClientRect();if(!b.width||!b.height||getComputedStyle(x).display==='none')return false;
      return b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1;
     }).map(x=>({tag:x.tagName,class:x.className,text:x.textContent.slice(0,50)}));
     return {horizontal:document.documentElement.scrollWidth>innerWidth,overflow,
      hidden:[...s.querySelectorAll('.a')].filter(x=>+getComputedStyle(x).opacity<.99).length};
    });
    view.scenes.push({number:i+1,...state});
    assert.equal(state.horizontal,false,'页面横向溢出');assert.equal(state.overflow.length,0,'屏内元素越界');assert.equal(state.hidden,0,'手动模式仍有隐藏元素');
    await page.locator('#screen').screenshot({path:path.join(out,viewport.width+'-'+String(i+1).padStart(2,'0')+'.png')});
   }
   const bad=await page.locator('img[src]').evaluateAll(ns=>ns.filter(x=>!x.complete||!x.naturalWidth).map(x=>x.getAttribute('src').slice(0,100)));
   assert.deepEqual(bad,[],'缺失图片');
   await page.selectOption('#pace','1');
   await page.locator('#timeline').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))},durations[0]-.5);
   const snapshot=()=>page.locator('.scene.active .a,.scene.active .cue,.scene.active .cue i').evaluateAll(ns=>ns.map(x=>({opacity:getComputedStyle(x).opacity,transform:getComputedStyle(x).transform})));
   const before=await snapshot();await page.waitForTimeout(220);assert.deepEqual(await snapshot(),before,'暂停时仍有入场或过渡动画');
   view.pauseFrozen=true;report.views.push(view);await context.close();
  }
  assert.deepEqual(report.httpRequests,[],'独立离线文件仍发起网络请求');assert.deepEqual(report.errors,[],'浏览器报错或资源缺失');
  report.passed=true;
 }catch(e){report.passed=false;report.failure=e.message;process.exitCode=1}
 finally{
  fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));
  await browser.close();fs.rmSync(tmp,{recursive:true,force:true});
 }
 console.log(JSON.stringify({passed:report.passed,views:report.views.length,errors:report.errors,failure:report.failure},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});

