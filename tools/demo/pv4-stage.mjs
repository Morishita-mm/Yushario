// Extend the v3 camera without altering application code or generating result UI.
import { installCamera as previousCamera } from './pv3-stage.mjs';
export function enableTownWrites(url) {
  const guarded = window.fetch;
  // The native network path is saved by pv4-film before the replay guard is installed.
  window.fetch = (resource, options) => {
    const address = new URL(typeof resource === 'string' ? resource : resource.url, url);
    if (options?.method === 'PATCH' && address.pathname.startsWith('/api/towns/')) {
      address.searchParams.set('token', new URL(url).searchParams.get('token'));
      return window.__pvOriginalFetch(address, options).then(async response => {
        if (response.ok) window.__pvTownWrites.push({ method: 'PATCH', path: address.pathname,
          body: JSON.parse(options.body), result: await response.clone().json() });
        return response;
      });
    }
    return guarded(resource, options);
  };
  window.__pvTownWrites = []; window.__pvLabels = {};
  localStorage.removeItem('agent-quest-read-reports'); // Only the isolated film origin, before app initialization.
  Math.random = () => 0.88; // A repeatable natural walking route, not a fabricated agent state.
  const proto = CanvasRenderingContext2D.prototype, fillText = proto.fillText, fillRect = proto.fillRect;
  // Observe real report sprite draws without hiding, replacing or inventing app pixels.
  const setTransform = proto.setTransform, drawImage = proto.drawImage;
  window.__pvSignDraws = [];
  proto.setTransform = function(...args) {
    if (this.canvas.id === 'world') window.__pvSignDraws = [];
    return setTransform.apply(this, args);
  };
  proto.drawImage = function(...args) {
    const sheet = args[0]?.src?.match(/\/(ui-report|ui-balloons)\.png$/)?.[1];
    if (this.canvas.id === 'world' && sheet && args.length === 9) {
      const scale = args[7] / args[3];
      if (Math.abs(scale - (sheet === 'ui-report' ? .65 : .85)) < .00001)
        window.__pvSignDraws.push({ sheet, sprite: args[1] / args[3], scale, transform: this.getTransform().toJSON() });
    }
    return drawImage.apply(this, args);
  };
  proto.fillText = function(text, x, y, ...rest) {
    if (this.canvas.id === 'world') window.__pvLabels[text] = { x, y, motion: window.__pvMotion };
    return fillText.call(this, text, x, y, ...rest);
  };
  proto.fillRect = function(x, y, width, height) {
    // Replace the app's navigation fade with the film's short biome crossfade only.
    const fill = typeof this.fillStyle === 'string' ? this.fillStyle.replaceAll(' ', '') : '';
    if (window.__pvWalking && this.canvas.id === 'world' && width === 960 && height === 540
      && (['#000000', '#ffffff', 'rgb(0,0,0)', 'rgb(255,255,255)'].includes(fill)
        || /^rgba\((0,0,0|255,255,255),/.test(fill))) return;
    return fillRect.call(this, x, y, width, height);
  };
}
export const cameraSource = `(${previousCamera.toString()})`;
export async function extendCamera(width, language) {
  const base = window.pv2, w = document.querySelector('#pv2-app').contentWindow, d = w.document;
  const frame = document.querySelector('#pv2-app'), output = document.querySelector('body > canvas');
  const ctx = output.getContext('2d'), square = width === 1080, ja = language === 'ja';
  const themes = ['village', 'port', 'snow', 'desert', 'volcano'];
  const captions = ['草原の村', '海辺の港町', '雪国の町', '砂漠のオアシス', '火山の町'];
  let walkingMotion = 0, treasureMotion = 0, themeIndex = -1, walkState, treasureImage, treasureCrop, treasureProof, unreadBefore;
  const continuity = [], positions = [], signFrames = [];
  const tick = async () => { w.__pvTick(); w.__pvTick(); await new Promise(r => setTimeout(r, 0)); };
  const position = name => { const p = w.__pvLabels[name]; if (!p) throw Error('Missing actual hero label: ' + name); return { x: p.x, y: p.y - 13 }; };
  const bitmap = async data => { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image; };
  const words = (text, y, size, color = '#ffe066') => {
    ctx.font = `800 ${size}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = color;
    if (ctx.measureText(text).width > width - 128) throw Error('Unsafe v4 copy: ' + text);
    ctx.fillText(text, width / 2, y);
  };
  const choose = async index => {
    const before = position('quiet-quest');
    d.querySelector('#town-look').click();
    const button = [...d.querySelectorAll('.theme-option')].find(b => b.textContent.trim() === captions[index]);
    if (!button) throw Error('Missing actual theme chooser'); button.click();
    for (let i = 0; i < 100; i++) {
      if (w.__pvTownWrites.at(-1)?.result.theme === themes[index]) break;
      await new Promise(r => setTimeout(r, 20));
    }
    const saved = w.__pvTownWrites.at(-1)?.result;
    if (saved?.theme !== themes[index]) throw Error('Real theme PATCH did not persist');
    await tick();
    const after = position('quiet-quest');
    if (Math.hypot(after.x - before.x, after.y - before.y) > 0.001) throw Error('Theme UI reset hero position');
    continuity.push({ theme: themes[index], before, after, persisted: saved, frame: 240 + index * 45 });
    themeIndex = index;
  };
  window.pv2 = {
    ...base,
    async prepare(shot) {
      d.querySelector('#talk-close')?.click(); w.__pvWalking = false;
      frame.style.width = '1920px';
      const result = await base.prepare(shot);
      if (shot.kind === 'walk') {
        walkState = shot.state; w.__pvWalking = true;
        // Natural app walk: wait then follow its shared street graph; never move the hero manually.
        for (let i = 0; i < 30; i++) { w.__pvMotion += 100; await tick(); }
        walkingMotion = w.__pvMotion; themeIndex = -1;
        await choose(0);
      }
      if (shot.kind === 'treasure') {
        for (let i = 0; i < 8; i++) { w.__pvMotion += 100; await tick(); }
        // base.frames must start at this clock, not move backwards during badge capture.
        treasureMotion = w.__pvMotion;
        const reportsRead = JSON.parse(w.localStorage.getItem('agent-quest-read-reports') ?? '[]');
        unreadBefore = !reportsRead.some(([id, at]) => id === shot.state.id && at === w.__pvBase + shot.number * 1000000);
        if (!unreadBefore) throw Error('Treasure must be unread before the actual click');
      }
      return { ...result, heroPosition: shot.kind === 'walk' ? position('quiet-quest') : undefined };
    },
    async openTreasure() {
      const hero = position('Claude Code'), rect = w.world.getBoundingClientRect();
      // The badge is at the walker's y-60. Actual Scene.hit dispatches talk(id, report.at).
      w.world.dispatchEvent(new w.MouseEvent('click', { bubbles: true,
        clientX: rect.left + hero.x / 960 * rect.width,
        clientY: rect.top + (hero.y - 70) / 540 * rect.height }));
      await tick();
      if (!d.querySelector('#talk-dialog').open) throw Error('Unread chest badge did not open real dialog');
      d.querySelector('#talk-next').click(); await tick();
      const card = d.querySelector('.report-card.chest');
      if (!card) throw Error('Actual recorded chest missing');
      frame.style.width = `${width}px`; w.dispatchEvent(new w.Event('resize'));
      const css = d.createElement('style'); css.id = 'pv4-report-style';
      css.textContent = `.talk-window{left:${square ? 40 : 96}px!important;top:225px!important;width:${width - (square ? 80 : 192)}px!important;height:770px!important;max-height:none!important;padding:26px!important;background:#12101f!important}
        dialog::backdrop{background:rgba(0,0,0,.25)}.talk-heading h3{font-size:28px!important}.talk-heading button,#talk-form,#talk-status,#talk-foreign,.talk-pages,.talk-window>footer{display:none!important}
        #talk-history{overflow:hidden!important}.talk-line.you,.report-card:not(.chest){display:none!important}.report-card.chest{padding:22px!important;margin:6px 0!important}.report-headline{font-size:${square ? 32 : 40}px!important}
        .report-time{font-size:22px!important}.report-files{column-count:2;font-size:${square ? 29 : 32}px!important;line-height:1.4!important;padding-left:28px!important;margin:14px 0!important}.report-tally p{font-size:${square ? 29 : 34}px!important;padding:10px 0!important}
        .talk-body{font-size:${square ? 29 : 34}px!important;line-height:1.5!important;max-height:${square ? 225 : 160}px!important;overflow:hidden!important}.report-more{display:none!important}
        #pv4-chest-heading{position:fixed;top:0;left:0;width:${width}px;padding:55px 0 40px;background:#0d0b14;color:#ffe066;text-align:center;font:800 ${square ? 64 : 82}px/1.4 system-ui;z-index:999}
        #pv4-chest-note{position:fixed;bottom:0;left:0;width:${width}px;padding:14px 0;background:#0d0b14;color:#c9c3dc;text-align:center;font:800 28px system-ui;z-index:999}`;
      d.head.append(css);
      for (const [id, text] of [['pv4-chest-heading', ja ? '冒険の成果を、手に。' : 'Claim your quest’s rewards.'],
        ['pv4-chest-note', ja ? '本物の報告・UIを拡大' : 'Real report · enlarged app UI']]) {
        const el = d.createElement('div'); el.id = id; el.textContent = text; d.body.append(el);
      }
      const history = d.querySelector('#talk-history'); history.scrollTop = card.offsetTop - history.offsetTop;
      output.hidden = true; await tick();
      // Wait for two real outer-document compositor frames, not the replay iframe's queued clock.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      treasureProof = { unreadBefore, realBadgeClicked: true, dialogOpen: true, card: card.innerText,
        files: [...card.querySelectorAll('.report-files li')].map(el => el.textContent),
        tests: card.querySelector('.report-tally p').textContent, firstLine: card.querySelector('.talk-body').innerText.split('\n')[0],
        read: JSON.parse(w.localStorage.getItem('agent-quest-read-reports')).filter(([id]) => id === '1672e701-61d6-4358-b2b6-c365b580b900'),
        bounds: card.getBoundingClientRect().toJSON(), bodyBounds: card.querySelector('.talk-body').getBoundingClientRect().toJSON(),
        capture: { viewport: [innerWidth, innerHeight], iframe: frame.getBoundingClientRect().toJSON() } };
      return treasureProof;
    },
    async setTreasure(data) {
      treasureImage = await bitmap(data);
      const { viewport, iframe } = treasureProof.capture;
      const sx = treasureImage.width / viewport[0], sy = treasureImage.height / viewport[1];
      treasureCrop = [iframe.x * sx, iframe.y * sy, iframe.width * sx, iframe.height * sy];
      // Orca's first native screenshot can place a half-size page in a full-size PNG.
      // Detect the actual rendered extent against the known empty page background; crop pixels only.
      const probe = document.createElement('canvas'); probe.width = treasureImage.width; probe.height = treasureImage.height;
      const pixels = probe.getContext('2d', { willReadFrequently: true }); pixels.drawImage(treasureImage, 0, 0);
      const rgba = pixels.getImageData(0, 0, probe.width, probe.height).data;
      const last = rgba.length - 4, background = [rgba[last], rgba[last + 1], rgba[last + 2]];
      let right = 0;
      for (let y = 0; y < probe.height; y++) for (let x = right + 1; x < probe.width; x++) {
        const i = (y * probe.width + x) * 4;
        if (Math.max(...background.map((value, channel) => Math.abs(rgba[i + channel] - value))) > 24) right = x;
      }
      const extent = right + 1;
      if (extent < treasureCrop[2] * 0.75 && extent > treasureCrop[2] * 0.45) { treasureCrop[2] /= 2; treasureCrop[3] /= 2; }
      treasureProof.capture.pixels = [treasureImage.width, treasureImage.height];
      treasureProof.capture.contentRight = extent;
      treasureProof.capture.crop = treasureCrop;
      output.hidden = false;
    },
    async frames(shot, start, count) {
      const result = [];
      for (let f = start; f < start + count; f++) {
        if (shot.kind === 'walk') {
          const index = Math.floor(f / 45), transition = f % 45;
          if (index !== themeIndex) await choose(index);
          const localShot = { ...shot, kind: 'biome', motion: walkingMotion, ageStart: 3000, ageEnd: 10500 };
          const [current] = await base.frames(localShot, f, 1);
          const p = position('quiet-quest'); positions.push({ frame: 240 + f, theme: themes[index], ...p });
          if (index && transition < 6) {
            w.__pvDeliver({ type: 'towns', towns: [{ ...walkState.towns[0], theme: themes[index - 1] }] });
            const [previous] = await base.frames(localShot, f, 1);
            const oldPosition = position('quiet-quest');
            if (Math.hypot(oldPosition.x - p.x, oldPosition.y - p.y) > 0.001) throw Error('Crossfade hero misalignment');
            w.__pvDeliver({ type: 'towns', towns: [{ ...walkState.towns[0], theme: themes[index] }] });
            await tick();
            ctx.drawImage(await bitmap(previous), 0, 0); ctx.globalAlpha = (transition + 1) / 6;
            ctx.drawImage(await bitmap(current), 0, 0); ctx.globalAlpha = 1;
          }
          result.push(output.toDataURL('image/png').split(',')[1]);
        } else if (shot.kind === 'treasure') {
          if (f < 60) {
            await base.frames({ ...shot, kind: 'biome', motion: treasureMotion }, f, 1);
            const hero = position('Claude Code'), source = w.world;
            ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, width, 1080);
            const scale = Math.min((width - 80) / 720, 800 / 720);
            ctx.drawImage(source, hero.x * 2 - 360, hero.y * 2 - 440, 720, 720,
              (width - 720 * scale) / 2, 190, 720 * scale, 720 * scale);
            words(ja ? '冒険の成果を、手に。' : 'Claim your quest’s rewards.', 115, square ? 64 : 82);
            words(ja ? '本物の作業記録・短縮' : 'Real work, condensed.', 1040, 28, '#c9c3dc');
          } else {
            if (!treasureImage) throw Error('Native DOM screenshot missing');
            ctx.drawImage(treasureImage, ...treasureCrop, 0, 0, width, 1080);
          }
          result.push(output.toDataURL('image/png').split(',')[1]);
        } else {
          result.push(...await base.frames(shot, f, 1));
          // Remove the v3 music credit: this delivery is genuinely silent, with no reused audio.
          if (['title', 'cta'].includes(shot.kind)) {
            ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 924, width, 68);
            result[result.length - 1] = output.toDataURL('image/png').split(',')[1];
          }
        }
        signFrames.push({ frame: Math.round(shot.start * 30 + f), kind: shot.kind,
          place: d.querySelector('#place-name').textContent, labels: w.world.getAttribute('aria-label'), draws: w.__pvSignDraws });
      }
      return result;
    },
    proof() { return { ...base.proof(), continuity, positions, signFrames, treasure: treasureProof, townWrites: w.__pvTownWrites }; },
  };
  return 'PV4 continuous walk and native report camera ready';
}
