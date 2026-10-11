// S8.5 camera: real app in an Orca-owned iframe, recorded packets only, no PTY.
export function boot(url, sessions) {
  window.__pvBase = 1800000000000; window.__pvMs = 0; window.__pvMotion = 43000;
  Date.now = () => __pvBase + __pvMs;
  Object.defineProperty(performance, 'now', { value: () => __pvMotion });
  const queue = [];
  window.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
  window.__pvTick = () => { for (const fn of queue.splice(0)) fn(__pvMotion); };
  localStorage.setItem('agent-character-status-size', 'small');
  window.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    constructor(address) {
      if (address.includes('/pty')) throw Error('PV: PTY disabled');
      setTimeout(() => this.onopen?.(), 0);
    }
    set onmessage(fn) { window.__pvDeliver = (data) => fn({ data: JSON.stringify(data) }); }
    send() { throw Error('PV: input disabled'); }
    close() {}
  };
  const nativeFetch = fetch.bind(window);
  window.fetch = (resource, options) => {
    const address = new URL(typeof resource === 'string' ? resource : resource.url, url);
    if (options?.method && options.method !== 'GET') throw Error('PV: writes disabled');
    if (address.pathname === '/api/sessions') return Promise.resolve(Response.json(sessions));
    if (address.pathname === '/api/names') return Promise.resolve(Response.json({}));
    if (address.pathname === '/api/towns') return Promise.resolve(Response.json([{
      name: 'tiny-quest', path: '/demo/tiny-quest', firstSeenAt: __pvBase,
      lastActiveAt: __pvBase, pinned: false, theme: 'village',
    }]));
    if (address.pathname === '/api/settings') return Promise.resolve(Response.json({ archiveAfterDays: 30, startupCwd: '/demo/tiny-quest' }));
    if (address.pathname.startsWith('/api/')) address.searchParams.set('token', new URL(url).searchParams.get('token'));
    return nativeFetch(address, options);
  };
}

export async function installCamera(html, init, width, language) {
  document.body.replaceChildren(); document.body.style.margin = '0';
  document.body.style.background = '#0d0b14';
  const frame = document.createElement('iframe'); frame.id = 'pv-app';
  frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:1080px;border:0`;
  frame.srcdoc = html.replace('<head>', `<head><script>${init}<\/script>`);
  document.body.append(frame);
  await new Promise((resolve) => frame.onload = resolve);
  const w = frame.contentWindow, d = frame.contentDocument;
  for (let i = 0; i < 200 && !w.__pvDeliver; i++) await new Promise(r => setTimeout(r, 50));
  if (!w.__pvDeliver) throw Error('PV app did not become ready');
  d.querySelector('#title-screen button')?.click();
  const css = d.createElement('style');
  css.textContent = `body{overflow:hidden;background:#0d0b14}body>header,.map-nav,.sidebar,.first-step,#following,.messages{display:none!important}
    .quest{display:block;padding:0}.stage{width:100%;padding:0}.map-stage{height:1080px}
    .talk-window{left:5%!important;top:290px!important;width:90%!important;height:580px!important;max-height:none!important;padding:28px!important;background:#12101fed!important}
    dialog::backdrop{background:transparent}.talk-heading button,.talk-window>footer,#talk-form,#talk-status{display:none!important}.talk-heading h3{font-size:28px!important}
    #talk-history{overflow:hidden!important}.talk-line.you,.report-card:not(.chest){display:none!important}.report-card.chest{padding:26px!important}
    .report-headline{font-size:38px!important}.report-time{font-size:22px!important}.report-tally{font-size:25px!important}
    .report-files{font-size:25px!important;column-count:2}.talk-body{font-size:32px!important;line-height:1.6!important;max-height:80px;overflow:hidden}.report-card.chest~.report-card{display:none!important}
    #pv-report-title{position:fixed;top:0;left:0;right:0;height:140px;padding:38px 32px;background:#0d0b14;color:#ffe066;text-align:center;font:700 60px/1.3 system-ui;z-index:20;box-sizing:border-box}
    #pv-report-note{position:fixed;bottom:28px;left:0;right:0;color:#c9c3dc;text-align:center;font:26px system-ui;z-index:20}
    #pv-report-translation{position:fixed;top:140px;left:0;right:0;height:110px;padding:18px 6%;background:#0d0b14;color:white;font:30px/1.4 system-ui;text-align:center;z-index:20;box-sizing:border-box}
    @media(max-width:1100px){.report-headline{font-size:30px!important}.talk-body{font-size:28px!important;max-height:110px}.report-files{font-size:23px!important}.talk-window{height:610px!important}#pv-report-title{font-size:48px}}`;
  d.head.append(css);
  const output = document.createElement('canvas'); output.id = 'pv-output'; output.width = width; output.height = 1080;
  output.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:1080px;z-index:1`;
  document.body.append(output);
  const ctx = output.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const title = new Image(); title.src = new URL('/logo/title.png', location.href); await title.decode();
  const square = width === 1080, ja = language === 'ja';
  const note = ja ? '本物の作業記録を短縮再生' : 'Real work recordings, condensed.';
  const headlines = ['', ja ? '退屈なタスクを、冒険に。' : 'Turn routine tasks into an adventure.', '',
    ja ? '作業は、モンスターとの戦い。' : 'Tasks become monster battles.'];
  const tick = async () => { w.__pvTick(); w.__pvTick(); await new Promise(r => setTimeout(r, 0)); };
  const text = (value, x, y, size, color = '#fff', align = 'center') => {
    ctx.font = `600 ${size}px system-ui,sans-serif`; ctx.textAlign = align; ctx.fillStyle = color;
    if (ctx.measureText(value).width > width - 108) throw Error('PV text exceeds safe width: ' + value);
    ctx.fillText(value, x, y);
  };
  const menu = (value) => {
    const b = [...d.querySelectorAll('#town-layer button')].find(b => b.textContent.trim() === value);
    if (!b) throw Error('Missing app menu: ' + value); b.click();
  };
  const pick = async (id, follow = false) => {
    w.__pvMs += 300; await tick();
    const b = d.querySelector(`.compact-hero[data-hero="${id}"]`);
    if (!b) throw Error('Missing real hero: ' + id); b.click();
    if (follow) menu('ついていく'); else d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    w.__pvMotion += 600; await tick();
  };
  window.pv = {
    async shot(events, id, follow, motion) {
      d.querySelector('#talk-close')?.click(); d.querySelector('#following-stop')?.click(); d.querySelector('#world-back').click();
      w.__pvMs += 1000; w.__pvMotion = motion - 1500;
      // Keep original receipt intervals inside each prefix: report durations remain genuine.
      // Shift the prefix to this editorial clock; contents/ts/IDs/results are unchanged.
      const offset = w.__pvBase + w.__pvMs - Math.max(...events.map(row => row.at));
      w.__pvDeliver({ type: 'replay', events: events.map(row => ({ event: row.event, at: row.at + offset })) });
      await tick(); await pick(id, follow); await new Promise(r => setTimeout(r, 80)); await tick();
    },
    async event(event) {
      w.__pvMs += 300;
      w.__pvDeliver({ type: 'event', event, at: w.__pvBase + w.__pvMs });
      // Let the existing message typewriter finish, without advancing the result's receipt clock.
      for (let i = 0; i < 50; i++) await tick();
    },
    async report(id) {
      await pick(id); d.querySelector(`.compact-hero[data-hero="${id}"]`).click(); menu('はなす');
      d.querySelector('#talk-next')?.click(); w.__pvMotion += 10000; await tick();
      const card = d.querySelector('.report-card.chest'); if (!card) throw Error('No genuine chest report');
      const history = d.querySelector('#talk-history'); history.scrollTop = card.offsetTop - history.offsetTop;
      for (const [id, value] of [['pv-report-title', ja ? '成果は、宝箱で届く。' : 'Results arrive as treasure.'],
        ['pv-report-note', note], ['pv-report-translation', ja ? 'Claude Code' : 'Claude Code · translated: Fixed 3 bugs; all 6 tests passed.']]) {
        let p = d.getElementById(id); if (!p) { p = d.createElement('div'); p.id = id; d.body.append(p); } p.textContent = value;
      }
      output.hidden = true; frame.style.left = '0'; await tick();
      return card.innerText;
    },
    proof() { return { place: d.querySelector('#place-name').textContent, canvas: [w.world.width, w.world.height],
      labels: w.world.getAttribute('aria-label'), heroes: [...d.querySelectorAll('.compact-hero')].map(b => b.innerText),
      level: [...d.querySelectorAll('#messages li')].map(b => b.textContent).findLast(t => t.includes('レベル')),
      report: d.querySelector('.report-card.chest')?.innerText }; },
    async frames(scene, start, count) {
      output.hidden = false; frame.style.left = '0';
      const result = [];
      for (let f = start; f < start + count; f++) {
        w.__pvMotion = scene.motion + f * 100;
        w.__pvMs = scene.receipt + ([4, 6].includes(scene.number) ? Math.min(f * 100, 1400) : f * 100);
        await tick();
        ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, width, 1080);
        if (scene.number === 8) {
          // title.png is already 4x pixel art: 1x/1.5x here means 4x/6x original dots.
          const s = square ? 1 : 1.5;
          ctx.drawImage(title, (width - title.width * s) / 2, square ? 110 : 66, title.width * s, title.height * s);
          const copy = ja ? (square ? ['あなたのエージェントが、', '勇者になる。'] : ['あなたのエージェントが、勇者になる。']) : ['Your agents, as heroes.'];
          copy.forEach((v, i) => text(v, width / 2, 535 + i * 72, square ? 48 : 62, '#ffe066'));
          const sub = ja ? (square ? ['使い慣れたAIエージェントを、', 'そのまま使うローカルアプリ'] : ['使い慣れたAIエージェントを、そのまま使うローカルアプリ'])
            : (square ? ['A local app for the AI agents', 'you already use.'] : ['A local app for the AI agents you already use.']);
          sub.forEach((v, i) => text(v, width / 2, 680 + i * 42, 30));
          text('Claude Code / pi', width / 2, 790, 32, '#c9c3dc');
          text('npx agent-quest', width / 2, 875, 58);
          text(ja ? 'npm公開準備中' : 'npm release in preparation', width / 2, 938, 25, '#c9c3dc');
          text(ja ? '町・Claude Codeは別の実記録を編集' : 'Town & Claude Code shots combine real takes.', width / 2, 1024, 26, '#c9c3dc');
        } else {
          const source = w.world, battle = scene.number >= 3 && scene.number <= 6;
          const scale = battle ? 1.5 : square ? 1.5 : 1;
          const dw = source.width * scale, dh = source.height * scale;
          ctx.drawImage(source, (width - dw) / 2, battle ? 92 : square ? (scene.number === 2 ? -420 : -300) : -50, dw, dh);
          // Header/footer reframe decorative outskirts only; four party bodies remain in the real canvas.
          ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, width, battle ? 280 : 185);
          ctx.fillRect(0, battle ? 900 : 925, width, battle ? 180 : 155);
          let head = headlines[scene.number] ?? headlines[3];
          if (scene.number === 2 || scene.number === 6) head = '';
          if (head) {
            if (square && !ja && scene.number === 1) { text('Turn routine tasks', width / 2, 92, 54, '#ffe066'); text('into an adventure.', width / 2, 157, 54, '#ffe066'); }
            else text(head, width / 2, 112, square ? 49 : 64, '#ffe066');
          }
          if (scene.number === 1) {
            text('Claude Code / pi', width / 2, 235, 36);
          } else if (scene.number === 2) {
            text(ja ? '依頼の抜粋 · Claude Code' : 'Request excerpt · translated · Claude Code', width / 2, 65, 28, '#c9c3dc');
            text(ja ? '…3つの小さなバグを修正してテストを通して。' : 'Fix 3 small bugs and pass the tests.', width / 2, 142, square ? 36 : 52);
          } else if (scene.number === 6) {
            text('Claude Code', 54, 65, 32, '#c9c3dc', 'left');
            const line = d.querySelector('#messages').textContent.split('\n').findLast(t => t.includes('レベル'));
            if (!line) throw Error('No actual level-up notice');
            text(line, width / 2, 986, square ? 32 : 40, '#ffe066');
          } else {
            text(scene.number === 5 ? (ja ? 'pi · 別の依頼' : 'pi · separate task') : scene.number === 3 ? (ja ? 'Claude Code ＋ 仲間3人' : 'Claude Code + 3 subagents') : 'Claude Code', 54, 225, 32, '#c9c3dc', 'left');
            const subtitle = scene.number === 3 ? (ja ? 'パーティーで ドラゴンに挑む＝任せた仕事' : 'Party vs dragon = delegated work')
              : scene.number === 4 ? (ja ? 'スライム＝ファイル編集' : 'Slime = file edits') : (ja ? 'ゴーレム＝テスト' : 'Golem = tests');
            text(subtitle, width / 2, 982, square ? 34 : 40);
          }
          text(note, width / 2, 1040, 26, '#c9c3dc');
        }
        result.push(output.toDataURL('image/png').split(',')[1]);
      }
      return result;
    },
    receipt: () => w.__pvMs,
  };
  return 'Orca PV camera ready';
}
