// Read-only staging, confined to the camera's own CDP Target. App/core remain unchanged.
export async function stage(cdp, url, kind, language, ratio, sessions) {
  const width = ratio === '1x1' ? 1080 : 1920;
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__movieBase=1800000000000;window.__movieMs=-1000;window.__motion=18500;window.__clockOffset=0;
    Date.now=()=>__movieBase+__movieMs+__clockOffset;
    Object.defineProperty(performance,'now',{value:()=>__motion});
    const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>fn(__motion));
    localStorage.clear();localStorage.setItem('agent-character-status-size','small');
    const NativeSocket=WebSocket;
    window.WebSocket=class extends NativeSocket {
      constructor(address,...args){if(new URL(address).pathname==='/pty')throw Error('Filming: PTY disabled');super(address,...args);}
      set onmessage(fn){
        window.__deliver=data=>fn(new MessageEvent('message',{data:JSON.stringify(data)}));
        super.onmessage=message=>{const data=JSON.parse(message.data);if(data.type==='replay')data.events=[];fn(new MessageEvent('message',{data:JSON.stringify(data)}));};
      }
      send(data){const message=JSON.parse(data);if(message.type!=='permission-decision')throw Error('Filming: input disabled');}
    };
    const realFetch=fetch.bind(window);
    window.fetch=(resource,init)=>{
      const u=new URL(typeof resource==='string'?resource:resource.url,location.href);
      if(u.pathname.startsWith('/api/')&&init?.method&&init.method!=='GET')throw Error('Filming: mutations disabled');
      if(u.pathname==='/api/sessions')return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(sessions))},{headers:{'Content-Type':'application/json'}}));
      if(u.pathname==='/api/settings')return Promise.resolve(new Response(JSON.stringify({archiveAfterDays:30,startupCwd:'/demo/tiny-quest'}),{headers:{'Content-Type':'application/json'}}));
      return realFetch(resource,init);
    };` });
  await cdp.send('Page.navigate', { url });
  await cdp.send('Page.bringToFront');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await cdp.evaluate(`Boolean(window.__deliver&&document.querySelector('#connection')?.textContent.includes('ずみ'))`)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 99) throw new Error('App/relay did not become ready');
  }
  await cdp.evaluate(`(() => {
    document.body.classList.add('movie',${JSON.stringify(kind)},${JSON.stringify(ratio)},${JSON.stringify(language)});
    const style=document.createElement('style');style.textContent=${JSON.stringify(`
      body{overflow:hidden;background:#0d0b14}body>header{position:fixed;left:24px;right:760px;top:16px;z-index:4;background:#0d0b14f2;padding:12px 16px;border:1px solid #6e6a8a}
      body>header h1{font-size:26px}body>header button{font-size:17px}#connection{font-size:15px}
      .quest{display:block;padding:0}.stage{position:absolute;left:24px;top:100px;width:1120px;gap:10px}
      .map-stage{height:626px;display:flex;justify-content:center;align-items:center;overflow:hidden}
      #world{flex:none;width:auto;border:0;border-radius:0;image-rendering:pixelated}.map-nav{min-height:28px;font-size:17px}
      .messages{font-size:20px;min-height:80px;max-height:110px;overflow:hidden;padding:10px 16px;line-height:1.5}
      .sidebar{position:absolute;left:24px;top:860px;width:1120px;max-height:74px;overflow:hidden;display:block;padding:0}
      .movie .messages{display:none}.demo:not(.permission-scene) #party>.hero{display:none}.demo .compact-hero{width:1120px}
      #herald,.status-size,.hero-picker,.hero .log,.hero .section,.hero .party,.hero .hint,.hero>.actions,.hero>.bar{display:none}
      #party{padding:0;display:flex;flex-direction:row;gap:16px}.compact-hero{width:520px;flex:none;font-size:20px;grid-template-columns:170px 70px 100px 1fr;height:66px;padding:10px}
      .compact-hero .level{font-size:23px}.compact-hero .compact-bars{font-size:13px}.hero{padding:10px 16px;font-size:18px;min-width:480px}.hero header strong{font-size:22px}.hero header .level{font-size:24px}.hero>.doing{font-size:20px}
      #following{font-size:17px;padding:6px 10px}dialog::backdrop{background:transparent}
      dialog.report-window,dialog.talk-window{font-size:20px}#expedition-dialog{position:fixed;left:200px;top:150px;right:auto;margin:0;width:740px;max-height:720px;padding:22px 30px}
      #expedition-form{gap:12px}#expedition-form label,#expedition-form select,#expedition-form input,#expedition-form button{font-size:20px}
      #expedition-support{font-size:18px}.talk-window{left:32px!important;top:160px!important;width:1100px!important;height:720px!important}
      .report-headline{font-size:24px!important}.report-tally{font-size:19px}.report-time{font-size:16px}.report-card{padding:18px 22px}.talk-body{font-size:20px;line-height:1.55}
      #talk-history{font-size:20px}#talk-status,#talk-form label{font-size:17px}.report-files{column-count:2}
      #movie-caption{position:fixed;left:0;right:0;bottom:0;height:132px;background:#0d0b14f8;border-top:2px solid #6e6a8a;padding:20px 28px;z-index:50}
      #movie-caption h2{font:34px/1.35 system-ui,sans-serif;font-weight:600;color:#ffe066;margin:0}
      #movie-caption small{display:block;font:17px/1.4 system-ui;color:#b9b1ce;margin-top:9px}
      #movie-terminal{position:fixed;left:1180px;right:24px;top:110px;bottom:158px;background:#10141c;border:1px solid #6e6a8a;padding:22px;overflow:hidden;z-index:5}
      #movie-terminal h3{font:22px/1.4 system-ui;color:#9fd3ff;margin:0 0 20px}#movie-terminal pre{font:20px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:#e4e8f2;margin:0}
      #movie-ending{position:fixed;left:90px;top:280px;width:980px;min-height:340px;background:#0d0b14ed;border:2px solid #ffe066;padding:56px 28px;text-align:center;z-index:8}
      #movie-ending h2{font:58px/1.4 system-ui;font-weight:700;letter-spacing:5px;color:#ffe066;margin:0 0 28px}#movie-ending code{font:46px ui-monospace,SFMono-Regular,Menlo,monospace;color:white}
      #movie-ending[hidden],#movie-terminal[hidden]{display:none}
      .permission-scene .sidebar{left:650px;top:190px;width:490px;max-height:640px;z-index:6;overflow:hidden}
      .permission-scene #party{display:block}.permission-scene .compact-hero{display:none}.permission-scene .hero{min-width:0;font-size:22px}
      .permission-scene .permission{font-size:22px;padding:16px;line-height:1.5}.permission-scene .permission button{font-size:24px;padding:8px}
      .permission-scene #herald{display:block;max-height:130px;overflow:hidden;margin-bottom:12px;font-size:20px}
      .permission-scene #herald h2{font-size:20px}.permission-scene #herald button{font-size:18px}
      .promo>header,.promo .map-nav,.promo #following,.promo .first-step{display:none!important}
      .promo .stage{left:0;top:172px;width:1920px}.promo .map-stage{height:626px}.promo .messages{position:fixed;left:390px;right:390px;bottom:110px;max-height:112px;font-size:24px;text-align:center}
      .promo .sidebar{top:822px;left:400px;width:1120px;max-height:100px}.promo .compact-hero{font-size:22px;width:330px;grid-template-columns:170px 75px 1fr}.promo .compact-bars,.promo .compact-doing{display:none}
      .promo #party>.hero{display:none}.promo #movie-caption{top:0;bottom:auto;height:160px;padding:34px 40px;border:0;text-align:center}
      .promo #movie-caption h2{font-size:62px}.promo #movie-caption small{font-size:19px}
      .promo #movie-terminal{display:none}.promo #movie-ending{left:390px;top:250px;width:1140px;padding:80px 30px}
      .promo #movie-ending h2{font-size:84px}.promo #movie-ending code{font-size:68px}
      .promo.permission-scene .sidebar{display:block;left:630px;top:235px;width:660px;max-height:540px;z-index:7}
      .promo.permission-scene #party>.hero{display:block;font-size:27px}.promo.permission-scene .permission{font-size:27px}
      .promo.permission-scene .permission button{font-size:30px}.promo.permission-scene #herald{display:none}
      .promo.permission-scene .messages{display:none}
      .promo.terminal-insert #movie-terminal{display:block;left:500px;right:500px;top:320px;bottom:300px;box-shadow:0 0 0 100vmax #0d0b14a8}
      .promo.terminal-insert #movie-terminal pre{font-size:26px}.promo.terminal-insert #movie-terminal h3{font-size:23px}
      .promo[class~="1x1"] .stage{width:1080px;top:195px}.promo[class~="1x1"] .map-stage{height:626px}
      .promo[class~="1x1"] #movie-caption{padding:24px 28px;height:180px}.promo[class~="1x1"] #movie-caption h2{font-size:54px}
      .promo[class~="1x1"] .sidebar{left:36px;top:846px;width:1008px}.promo[class~="1x1"] .compact-hero{width:310px;font-size:20px}
      .promo[class~="1x1"] .messages{left:36px;right:36px;bottom:64px;font-size:22px;max-height:94px}
      .promo[class~="1x1"] #movie-ending{left:36px;top:305px;width:1008px;padding:90px 24px}
      .promo[class~="1x1"] #movie-ending h2{font-size:70px}.promo[class~="1x1"] #movie-ending code{font-size:58px}
      .promo[class~="1x1"].permission-scene .sidebar{left:95px;top:270px;width:890px;max-height:590px}
      .promo[class~="1x1"].terminal-insert #movie-terminal{left:60px;right:60px;top:350px;bottom:220px}
      /* Revised SNS camera: fill the frame, not a small app window inside it. */
      .promo .stage,.promo[class~="1x1"] .stage{left:0;top:0;width:100vw;gap:0}
      .promo .map-stage,.promo[class~="1x1"] .map-stage{height:1080px;position:relative;display:block}
      .promo #world{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
      .promo .sidebar,.promo[class~="1x1"] .sidebar,.promo .compact-hero{display:none!important}
      .promo.permission-scene .sidebar,.promo[class~="1x1"].permission-scene .sidebar{display:block!important}
      .promo #movie-caption{background:#0d0b14f8;z-index:50}
      .promo #movie-game-hud{position:fixed;left:20px;top:174px;width:552px;height:132px;image-rendering:pixelated;z-index:6}
      .promo #movie-game-dialogue{position:fixed;left:0;right:0;bottom:0;height:100px;background:#080718;z-index:6;display:flex;justify-content:center;align-items:flex-end}
      .promo #movie-game-dialogue canvas{width:1114px;height:92px;flex:none;image-rendering:pixelated}
      .promo #movie-level{position:fixed;left:36px;right:36px;bottom:36px;padding:18px 26px;border:2px solid #ffe066;background:#0b091be8;color:#ffe066;font:36px/1.3 system-ui;z-index:7;text-align:center}
      #movie-game-hud[hidden],#movie-game-dialogue[hidden],#movie-level[hidden]{display:none!important}
      .promo.terminal-insert #movie-game-hud,.promo.terminal-insert #movie-game-dialogue{visibility:hidden}
    `)};document.head.append(style);
    const terminal=document.createElement('section');terminal.id='movie-terminal';terminal.innerHTML='<h3></h3><pre></pre>';document.body.append(terminal);
    const caption=document.createElement('section');caption.id='movie-caption';caption.innerHTML='<h2></h2><small></small>';document.body.append(caption);
    const ending=document.createElement('section');ending.id='movie-ending';ending.hidden=true;ending.innerHTML='<h2>AGENT QUEST</h2><code>npx agent-quest</code>';document.body.append(ending);
    const hud=document.createElement('canvas');hud.id='movie-game-hud';hud.width=368;hud.height=88;hud.hidden=true;document.body.append(hud);
    const dialogue=document.createElement('section');dialogue.id='movie-game-dialogue';dialogue.hidden=true;dialogue.innerHTML='<canvas width="1114" height="92"></canvas>';document.body.append(dialogue);
    const level=document.createElement('p');level.id='movie-level';level.hidden=true;document.body.append(level);
    window.__menu=text=>{const b=[...document.querySelectorAll('#town-layer button')].find(b=>b.textContent.trim()===text);if(!b)throw Error('Menu missing: '+text);b.click();};
    window.__pick=(id,follow=false)=>{const b=document.querySelector('.compact-hero[data-hero="'+id+'"]');if(!b)throw Error('Hero missing: '+id);b.click();if(follow)__menu('ついていく');else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));};
    window.__mapClick=(x,y)=>{const c=document.querySelector('#world'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+x/(c.width/2)*r.width,clientY:r.top+y/(c.height/2)*r.height}));};
  })()`);
  return { width, height: 1080 };
}
export async function renderStage(cdp, ms, caption, language, kind, ratio, terminal, permission, ending, insert = false) {
  await cdp.evaluate(`(() => {
    __movieMs=${ms};
    document.body.classList.toggle('permission-scene',${permission});document.body.classList.toggle('terminal-insert',${insert});
    document.querySelector('#movie-caption h2').textContent=${JSON.stringify(caption[language === 'ja' ? 1 : 2])};
    document.querySelector('#movie-caption small').textContent=${JSON.stringify(language === 'ja' ? '本物の作業記録を短縮再生 · 許可は手動' : 'Edited real work replay · permissions were manual')};
    document.querySelector('#movie-terminal h3').textContent=${JSON.stringify(language === 'ja' ? '本物の Claude Code — 記録時の出力' : 'Original Claude Code — recorded output')};
    document.querySelector('#movie-terminal pre').textContent=${JSON.stringify(terminal.text)};
    document.querySelector('#movie-ending').hidden=${!ending};
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const canvas=document.querySelector('#world'),w=canvas.width/2,h=canvas.height/2;
      const promo=${kind === 'promo'},square=${ratio === '1x1'},battle=w===557;
      const scale=promo?(battle?4:square?3:2):(w===960?1:2);
      canvas.style.width=(w*scale)+'px';canvas.style.height=(h*scale)+'px';
      canvas.style.marginLeft=promo&&square&&!battle?'-120px':'0';canvas.style.marginTop=promo&&square&&!battle?'-120px':'0';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const hud=document.querySelector('#movie-game-hud'),dialogue=document.querySelector('#movie-game-dialogue'),level=document.querySelector('#movie-level');
        hud.hidden=dialogue.hidden=!promo||!battle;
        if(promo&&battle){
          // Reframe only decorative outskirts. Preserve real HUD/story pixels from the SAME live canvas.
          hud.getContext('2d').drawImage(canvas,0,0,368,88,0,0,368,88);
          dialogue.querySelector('canvas').getContext('2d').drawImage(canvas,0,canvas.height-92,1114,92,0,0,1114,92);
        }
        const line=document.querySelector('#messages').textContent.split('\\n').findLast(text=>text.includes('レベル'))||'';
        level.hidden=!promo||${ms}<8800||${ms}>=10000||!line.includes('レベル');level.textContent=line;
        resolve();
      }));
    })));
  })()`);
}
