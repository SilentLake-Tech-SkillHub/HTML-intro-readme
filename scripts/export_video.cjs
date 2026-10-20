#!/usr/bin/env node
// Deterministic local HTML -> silent MP4. No publishing, package installs or source edits.
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {spawn}=require('child_process'),{pathToFileURL}=require('url');
const help=`Usage: node scripts/export_video.cjs --input intro.html --output intro.mp4 [options]
  --module PATH           Installed playwright / playwright-core module (optional)
  --browser PATH          Chromium executable (otherwise Playwright's bundled browser)
  --encoder auto|avfoundation|software|nvenc|videotoolbox  (auto: macOS native; others software)
  --hardware prefer|require|off  macOS native only; default prefer
  --ffmpeg PATH --ffprobe PATH  Defaults to executables on PATH
  --fps 30 --width 1920 --height 1080 --bitrate 8000000
  --start 0 --duration SECONDS  Optional preview; omitted duration exports to the end
  --viewport-width 1440 --selector '#screen' --css custom-export.css
  --clock auto|api|legacy  Prefer window.htmlIntroVideo; legacy supports the existing film-v3 tick clock
  --capture cdp|playwright Default cdp; playwright is an explicit compatibility option
Output: MP4 + .video.json + .checks/ (full decode report and scene samples).
Existing outputs are never overwritten. Audio is not captured or added.`;
function parse(argv){
 const known=new Set(['input','output','module','browser','encoder','hardware','ffmpeg','ffprobe','fps','width','height','bitrate','start','duration','viewport-width','selector','css','clock','capture']);
 const o={};for(let i=0;i<argv.length;i+=2){const k=argv[i].replace(/^--/,'');
  if(!argv[i].startsWith('--')||!known.has(k)||argv[i+1]===undefined)throw Error('Unknown/incomplete option: '+argv[i]);
  if(o[k]!==undefined)throw Error('Repeated option: '+k);o[k]=argv[i+1];}return o;
}
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function numeric(o,k,d,{min=0,integer=false}={}){const n=o[k]===undefined?d:Number(o[k]);if(!Number.isFinite(n)||n<min||(integer&&!Number.isInteger(n)))throw Error('Invalid --'+k);return n;}
function choice(o,k,d,values){const v=o[k]||d;if(!values.includes(v))throw Error('Invalid --'+k);return v;}
function run(command,args,options={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],...options});let stdout='',stderr='';
  const timer=setTimeout(()=>{child.kill();reject(Error(command+' timed out'))},options.timeout||300000);
  child.stdout?.on('data',d=>stdout+=d);child.stderr?.on('data',d=>stderr+=d);
  child.on('error',e=>{clearTimeout(timer);reject(e)});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve({stdout,stderr}):reject(Error(command+' failed ('+code+'): '+stderr.slice(-4000)))});
 });
}
async function nativeTools(work){
 if(process.platform!=='darwin')throw Error('avfoundation requires macOS');
 const fingerprint=sha(['video_encode','video_check'].map(n=>fs.readFileSync(path.join(__dirname,n+'.swift'))).join('\n'));
 const cache=path.join(os.tmpdir(),'html-intro-video-native-'+process.getuid(),fingerprint.slice(0,24));
 fs.mkdirSync(cache,{recursive:true,mode:0o700});
 const tools={};for(const name of ['video_encode','video_check']){
  const source=path.join(__dirname,name+'.swift'),binary=path.join(cache,name);
  if(!fs.existsSync(binary)){
   const temporary=path.join(work,name);
   await run('swiftc',['-O','-suppress-warnings','-module-cache-path',path.join(cache,'swift-cache'),source,'-o',temporary]);
   fs.copyFileSync(temporary,binary);
  }tools[name]=binary;
 }return tools;
}
async function checkFFmpeg(file,manifest,dir,o){
 const probe=await run(o.ffprobe||'ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries',
  'stream=width,height,codec_name,avg_frame_rate:format=duration:frame=best_effort_timestamp_time','-of','json',file]);
 if(probe.stderr.trim())throw Error('Decode errors: '+probe.stderr.slice(-2000));
 const data=JSON.parse(probe.stdout),stream=data.streams?.[0],frames=data.frames||[];
 if(!stream||frames.length!==manifest.frames||stream.codec_name!=='h264'||stream.width!==manifest.width||stream.height!==manifest.height)throw Error('Decoded video does not match expected frame count, codec or size');
 const regular=frames.every((f,i)=>Math.abs(Number(f.best_effort_timestamp_time)-i/manifest.fps)<.002);
 const duration=Number(data.format.duration),[a,b]=stream.avg_frame_rate.split('/').map(Number);
 if(!regular||Math.abs(a/b-manifest.fps)>.01||Math.abs(duration-manifest.frames/manifest.fps)>.01)throw Error('Video timing validation failed');
 for(let i=0;i<manifest.samples.length;i++)await run(o.ffmpeg||'ffmpeg',['-hide_banner','-loglevel','error','-ss',String(manifest.samples[i].videoTime),'-i',file,'-frames:v','1',path.join(dir,'scene-'+String(i+1).padStart(3,'0')+'.png')]);
 const report={passed:true,decodeCompleted:true,frames:frames.length,fps:a/b,duration,width:stream.width,height:stream.height,
  timestampsRegular:regular,audioTracks:0,sampledScenes:manifest.samples.length,visualReview:'pending'};
 fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify(report,null,2));return report;
}
async function main(){
 if(process.argv.includes('--help')){console.log(help);return;}
 const o=parse(process.argv.slice(2));if(!o.input||!o.output)throw Error(help);
 const input=path.resolve(o.input),output=path.resolve(o.output);
 if(!fs.statSync(input).isFile()||!output.toLowerCase().endsWith('.mp4'))throw Error('Need a local HTML input and .mp4 output');
 const sourceSha256=sha(fs.readFileSync(input));
 if(!fs.existsSync(path.dirname(output)))throw Error('Output parent directory must already exist');
 const reportFile=output.replace(/\.mp4$/i,'.video.json'),checks=output.replace(/\.mp4$/i,'.checks');
 for(const f of [output,reportFile,checks])if(fs.existsSync(f))throw Error('Refusing to overwrite: '+f);
 const width=numeric(o,'width',1920,{min:2,integer:true}),height=numeric(o,'height',1080,{min:2,integer:true}),
  fps=numeric(o,'fps',30,{min:1,integer:true}),bitrate=numeric(o,'bitrate',8000000,{min:10000,integer:true}),
  vpWidth=numeric(o,'viewport-width',1440,{min:100,integer:true}),start=numeric(o,'start',0);
 if(width%2||height%2||fps>120)throw Error('Use even pixel dimensions and an integer fps <=120');
 const vpHeight=Math.round(vpWidth*height/width),clock=choice(o,'clock','auto',['auto','api','legacy']),
  capture=choice(o,'capture','cdp',['cdp','playwright']),hardware=choice(o,'hardware','prefer',['prefer','require','off']);
 let encoder=choice(o,'encoder','auto',['auto','avfoundation','software','nvenc','videotoolbox']);
 if(encoder==='auto')encoder=process.platform==='darwin'?'avfoundation':'software';
 if(o.hardware&&encoder!=='avfoundation')throw Error('--hardware is for avfoundation; nvenc always requires NVIDIA encoding');
 const css=o.css?fs.readFileSync(path.resolve(o.css),'utf8'):'';
 let playwright;if(o.module)playwright=require(path.resolve(o.module));else{try{playwright=require('playwright')}catch(_){playwright=require('playwright-core')}}
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'html-intro-video-'));let browser,child,childClosed=false;let aborted=false;
 const cancel=()=>{aborted=true;if(child&&!childClosed)child.kill('SIGTERM');browser?.close().catch(()=>{});};
 process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try{
  let native;if(encoder==='avfoundation')native=await nativeTools(work);
  else{await run(o.ffmpeg||'ffmpeg',['-version']);await run(o.ffprobe||'ffprobe',['-version']);}
  browser=await playwright.chromium.launch({executablePath:o.browser?path.resolve(o.browser):undefined,headless:true,args:['--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:vpWidth,height:vpHeight},deviceScaleFactor:width/vpWidth,offline:true,reducedMotion:'no-preference'});
  const page=await context.newPage(),errors=[],httpRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))httpRequests.push(r.url())});
  page.on('requestfailed',r=>errors.push(r.url().slice(0,120)+' '+r.failure()?.errorText));
  await page.addInitScript(()=>{
   const raf=window.requestAnimationFrame.bind(window);
   window.requestAnimationFrame=callback=>{if(callback.name==='tick'){window.__introExportTick=callback;return 0;}return raf(callback);};
  });
  await page.goto(pathToFileURL(input).href,{waitUntil:'load'});
  const mode=await page.evaluate(async requested=>{
   const api=window.htmlIntroVideo;
   if(requested!=='legacy'&&api&&typeof api.describe==='function'&&typeof api.seek==='function')return 'api';
   if(requested==='api')throw Error('Missing window.htmlIntroVideo.describe()/seek()');
   if(typeof window.__introExportTick!=='function'||!document.querySelector('#screen[data-durations]')||!document.querySelector('#pace'))throw Error('No supported timeline. Add the documented htmlIntroVideo interface.');
   document.querySelector('#pace').value='1';window.__introExportTick(1000);window.__introExportMs=1000;return 'legacy';
  },clock);
  const metadata=await page.evaluate(async mode=>{
   if(mode==='api')return await window.htmlIntroVideo.describe();
   const d=JSON.parse(document.querySelector('#screen').dataset.durations);
   return {duration:d.reduce((a,b)=>a+b,0),scenes:[...document.querySelectorAll('.scene')].map((s,i)=>({key:s.dataset.key||'scene-'+(i+1),seconds:d[i]}))};
  },mode);
  if(!Number.isFinite(metadata.duration)||metadata.duration<=0||!Array.isArray(metadata.scenes)||!metadata.scenes.length||metadata.scenes.some(s=>!Number.isFinite(s.seconds)||s.seconds<=0)||Math.abs(metadata.scenes.reduce((a,s)=>a+s.seconds,0)-metadata.duration)>.001)throw Error('Invalid describe() duration or scene durations');
  if(start>=metadata.duration)throw Error('--start is outside the film');
  const requestedDuration=o.duration===undefined?metadata.duration-start:numeric(o,'duration',0,{min:1/fps});
  if(start+requestedDuration>metadata.duration+.001)throw Error('Requested clip extends beyond source duration');
  const frames=Math.round(requestedDuration*fps),seconds=frames/fps;
  if(frames<1)throw Error('Empty video');
  const selector=o.selector||'#screen',screen=page.locator(selector);
  if(await screen.count()!==1)throw Error('--selector must resolve to exactly one element');
  await page.addStyleTag({content:`.cinema{max-width:none!important;width:${vpWidth}px!important;margin:0!important;padding:0!important}.topbar{display:none!important}.progress-dots i{transition:none!important}`});
  await screen.evaluate((el,size)=>{Object.assign(el.style,{width:size.width+'px',height:size.height+'px',minHeight:'0',border:'0',borderRadius:'0',boxShadow:'none',aspectRatio:'auto'});}, {width:vpWidth,height:vpHeight});
  if(css)await page.addStyleTag({content:css});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>i.decode().catch(()=>{})));});
  const bad=await page.locator('img[src]').evaluateAll(imgs=>imgs.filter(i=>i.getAttribute('src')&&(!i.complete||!i.naturalWidth)).map(i=>i.alt||'unnamed image'));
  if(bad.length||errors.length||httpRequests.length)throw Error(JSON.stringify({badImages:bad,errors,httpRequests}));
  await screen.scrollIntoViewIfNeeded();
  const scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
  const cdp=capture==='cdp'?await context.newCDPSession(page):null;
  const temporary=path.join(work,'video.mp4');
  const selected=encoder==='software'?'libx264':encoder==='nvenc'?'h264_nvenc':'h264_videotoolbox';
  const args=encoder==='avfoundation'?[temporary,String(width),String(height),String(fps),String(bitrate),hardware,String(frames)]:
   ['-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v',selected,
    ...(encoder==='nvenc'?['-preset','p4']:encoder==='software'?['-preset','medium']:['-allow_sw','0']),
    '-pix_fmt','yuv420p','-vf',`scale=${width}:${height}`,'-b:v',String(bitrate),'-movflags','+faststart',temporary];
  child=spawn(encoder==='avfoundation'?native.video_encode:o.ffmpeg||'ffmpeg',args,{stdio:['pipe','pipe','pipe']});
  let encoderError,encoderStderr='';child.stdin.on('error',e=>encoderError=e);child.stderr.on('data',d=>encoderStderr=(encoderStderr+d).slice(-8000));
  child.stdout.on('data',d=>process.stdout.write(d));
  const completed=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{childClosed=true;code===0?resolve():reject(Error('Encoder failed ('+code+'): '+encoderStderr))});});completed.catch(()=>{});
  async function write(data){if(encoderError)throw encoderError;if(!child.stdin.write(data))await new Promise((resolve,reject)=>{
   const fail=e=>{child.stdin.off('drain',drain);reject(e)},drain=()=>{child.stdin.off('error',fail);resolve()};child.stdin.once('drain',drain);child.stdin.once('error',fail);
  });}
  const timing={renderMs:0,encodeBackpressureMs:0},began=performance.now();
  for(let i=0;i<frames;i++){
   if(aborted||childClosed)throw Error('Export stopped');
   const begin=performance.now();
   await page.evaluate(async({mode,time,settle})=>{
    if(mode==='api')await window.htmlIntroVideo.seek(time);
    else{
     const target=1000+time*1000;
     while(window.__introExportMs+100<target-.00001){window.__introExportMs+=100;window.__introExportTick(window.__introExportMs);}
     if(target>window.__introExportMs){window.__introExportTick(target);window.__introExportMs=target;}
    }
    // Let layout/WAAPI changes reach the compositor before reading its surface.
    if(settle)await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   },{mode,time:start+i/fps,settle:!!cdp});
   let jpeg;
   if(cdp){const box=await screen.boundingBox();if(!box)throw Error('Export element is hidden');
    const response=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:94,fromSurface:true,captureBeyondViewport:true,clip:{...box,x:box.x+scroll.x,y:box.y+scroll.y,scale:width/box.width}});jpeg=Buffer.from(response.data,'base64');
   }else jpeg=await screen.screenshot({type:'jpeg',quality:94,animations:'allow'});
   timing.renderMs+=performance.now()-begin;const sending=performance.now();
   if(encoder==='avfoundation'){const header=Buffer.alloc(4);header.writeUInt32BE(jpeg.length);await write(header);}await write(jpeg);
   timing.encodeBackpressureMs+=performance.now()-sending;
   if(i%Math.max(1,fps*5)===0)console.log(`Rendered ${i}/${frames} frames (${Math.floor(i/frames*100)}%)`);
  }
  child.stdin.end();await completed;timing.exportMs=performance.now()-began;
  if(errors.length||httpRequests.length)throw Error(JSON.stringify({errors,httpRequests}));
  const samples=[];let offset=0;
  for(const s of metadata.scenes){const end=offset+s.seconds,lo=Math.max(start,offset),hi=Math.min(start+seconds,end);
   if(hi>lo){const ideal=Math.min(hi-1/fps,Math.max(lo,end-.9));
    const first=Math.ceil((lo-start)*fps-.00001),last=Math.min(frames-1,Math.ceil((hi-start)*fps-.00001)-1);
    if(last>=first){const frame=Math.max(first,Math.min(last,Math.floor((ideal-start)*fps+.00001)));
     samples.push({key:s.key,frame,sourceTime:start+frame/fps,videoTime:frame/fps});}
   }offset=end;
  }
  if(sha(fs.readFileSync(input))!==sourceSha256)throw Error('Source changed during export; use a frozen offline HTML');
  const manifest={version:1,input:path.basename(input),sourceSha256,cssSha256:css?sha(css):null,
   output:path.basename(output),width,height,fps,frames,seconds,sourceDuration:metadata.duration,start,requestedDuration,
   clock:mode,capture,scenes:metadata.scenes,samples,encoderRequested:o.encoder||'auto',encoderSelected:encoder,
   hardwareRequested:encoder==='avfoundation'?hardware:encoder==='software'?'off':'require',
   hardwareUsed:encoder==='avfoundation'?(hardware==='require'?true:hardware==='off'?false:'unknown'):encoder!=='software',
   audio:false,errors,httpRequests,timing};
  const manifestPath=path.join(work,'manifest.json'),checkDir=path.join(work,'checks');fs.mkdirSync(checkDir);fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  console.log('Encoding complete; decoding every frame and extracting scene samples');
  if(native)await run(native.video_check,[temporary,manifestPath,checkDir]);else await checkFFmpeg(temporary,manifest,checkDir,o);
  manifest.validation=JSON.parse(fs.readFileSync(path.join(checkDir,'validation.json'),'utf8'));manifest.videoSha256=sha(fs.readFileSync(temporary));manifest.bytes=fs.statSync(temporary).size;
  // Reserve final names with exclusive operations. Failure never replaces an existing artifact.
  const created=[];try{
   fs.copyFileSync(temporary,output,fs.constants.COPYFILE_EXCL);created.push(output);
   fs.writeFileSync(reportFile,JSON.stringify(manifest,null,2),{flag:'wx'});created.push(reportFile);
   fs.mkdirSync(checks);created.push(checks);for(const f of fs.readdirSync(checkDir))fs.copyFileSync(path.join(checkDir,f),path.join(checks,f),fs.constants.COPYFILE_EXCL);
  }catch(e){for(const f of created.reverse())fs.rmSync(f,{recursive:true,force:true});throw e;}
  console.log(JSON.stringify({output,report:reportFile,checks,seconds,frames,encoder,validation:'passed',visualReview:'pending',timing},null,2));
 }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);if(child&&!childClosed)child.kill('SIGTERM');if(browser)await browser.close().catch(()=>{});fs.rmSync(work,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
