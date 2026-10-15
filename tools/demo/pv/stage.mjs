// Continuous natural walking and report capture; application code and results are unchanged.
import { installCamera as previousCamera } from './camera.mjs';
export function enableTownWrites(url) {
  const guarded = window.fetch;
  // The native network path is saved by film before the replay guard is installed.
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
  window.__pvTownWrites = []; window.__pvLabels = {}; window.__pvPlaceLabels = {};
  localStorage.removeItem('yushario-read-reports'); // Only the isolated film origin, before app initialization.
  Math.random = () => 0.88; // A repeatable natural walking route, not a fabricated agent state.
  const proto = CanvasRenderingContext2D.prototype, fillText = proto.fillText, fillRect = proto.fillRect;
  // Observe real report sprite draws without hiding, replacing or inventing app pixels.
  const setTransform = proto.setTransform, drawImage = proto.drawImage;
  const sheets = new WeakMap(), extents = new WeakMap();
  window.__pvSignDraws = []; window.__pvActors = [];
  const bounds = (transform, x, y, width, height) => {
    const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
      .map(([x, y]) => transform.transformPoint({ x, y }));
    return [Math.min(...corners.map(p => p.x)), Math.min(...corners.map(p => p.y)),
      Math.max(...corners.map(p => p.x)), Math.max(...corners.map(p => p.y))];
  };
  proto.setTransform = function(...args) {
    if (this.canvas.id === 'world') { window.__pvSignDraws = []; window.__pvActors = []; window.__pvLabels = {}; window.__pvPlaceLabels = {}; window.__pvBattleDrawn = false; }
    return setTransform.apply(this, args);
  };
  proto.drawImage = function(...args) {
    const image = args[0], sheet = image?.src?.match(/\/([^/]+)\.png$/)?.[1] ?? sheets.get(image);
    if (sheet?.startsWith('hero-') && this.canvas.id !== 'world') sheets.set(this.canvas, sheet);
    if (this.canvas.id === 'world' && /^(hero-|party-|monster-|ui-weapons$|church-priest$)/.test(sheet) && args.length === 9) {
      // Measure genuine opaque sprite pixels (including sword/feet), not a guessed walker radius.
      let frames = extents.get(image); if (!frames) { frames = new Map(); extents.set(image, frames); }
      const key = args.slice(1, 5).join(','); let extent = frames.get(key);
      if (!extent) {
        const probe = document.createElement('canvas'); probe.width = args[3]; probe.height = args[4];
        const pixels = probe.getContext('2d'); drawImage.call(pixels, image, ...args.slice(1, 5), 0, 0, probe.width, probe.height);
        const data = pixels.getImageData(0, 0, probe.width, probe.height).data;
        let left = probe.width, top = probe.height, right = 0, bottom = 0;
        for (let y = 0; y < probe.height; y++) for (let x = 0; x < probe.width; x++) if (data[(y * probe.width + x) * 4 + 3]) {
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
        }
        extent = [left, top, right - left, bottom - top]; frames.set(key, extent);
      }
      const [x, y, width, height] = extent, sx = args[7] / args[3], sy = args[8] / args[4], transform = this.getTransform();
      window.__pvActors.push({ sheet, sprite: args[1] / args[3],
        facing: sheet === 'hero-walk' ? (args[1] / args[3] >= 4 ? (transform.a < 0 ? 'left' : 'right') : 'front') : sheet === 'hero-walk-back' ? 'back' : null,
        bounds: bounds(transform, args[5] + x * sx, args[6] + y * sy, width * sx, height * sy) });
    }
    if (this.canvas.id === 'world' && ['ui-report', 'ui-balloons'].includes(sheet) && args.length === 9) {
      const scale = args[7] / args[3];
      if (Math.abs(scale - (sheet === 'ui-report' ? .65 : .85)) < .00001)
        window.__pvSignDraws.push({ sheet, sprite: args[1] / args[3], scale, transform: this.getTransform().toJSON() });
    }
    return drawImage.apply(this, args);
  };
  proto.fillText = function(text, x, y, ...rest) {
    // Place titles now repeat the project name above y=60; do not overwrite hero labels.
    if (this.canvas.id === 'world') {
      const measure = this.measureText(text), labels = y > 60 ? window.__pvLabels : window.__pvPlaceLabels;
      labels[text] = { x, y, motion: window.__pvMotion,
        bounds: bounds(this.getTransform(), x - measure.actualBoundingBoxLeft - 2, y - measure.actualBoundingBoxAscent - 2,
          measure.actualBoundingBoxLeft + measure.actualBoundingBoxRight + 4, measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent + 4) };
    }
    return fillText.call(this, text, x, y, ...rest);
  };
  proto.fillRect = function(x, y, width, height) {
    // Photograph the genuine battle canvas before its bottom HUD overlays the feet.
    // The app still draws its HUD unchanged; only the editorial camera uses this plate.
    if (this.canvas.id === 'world' && x === 6 && y === this.canvas.height / 2 - 46 && height === 40 && width === this.canvas.width / 2 - 12) {
      const plate = window.__pvBattlePlate ??= document.createElement('canvas');
      plate.width = this.canvas.width; plate.height = this.canvas.height;
      drawImage.call(plate.getContext('2d'), this.canvas, 0, 0); window.__pvBattleDrawn = true;
    }
    // Keep the continuous take visible while the real chooser changes town appearance.
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
  const captions = ja ? ['草原の村', '海辺の港町', '雪国の町', '砂漠のオアシス', '火山の町']
    : ['Meadow Village', 'Seaside Port', 'Snow Town', 'Desert Oasis', 'Volcano Town'];
  let walkingMotion = 0, walkingAge = 0, treasureMotion = 0, themeIndex = -1, treasureImage, treasureCrop, treasureProof, unreadBefore, treasureId;
  const continuity = [], positions = [], signFrames = [];
  const tick = async () => { w.__pvTick(); w.__pvTick(); await new Promise(r => setTimeout(r, 0)); };
  const position = name => { const p = w.__pvLabels[name]; if (!p) throw Error('Missing actual hero label: ' + name); return { x: p.x, y: p.y - 13 }; };
  const bitmap = async data => { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image; };
  const words = (text, y, size, color = '#ffe066') => {
    ctx.font = `800 ${size}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = color;
    if (ctx.measureText(text).width > width - 128) throw Error('Unsafe v4 copy: ' + text);
    ctx.fillText(text, width / 2, y);
  };
  const choose = async (index, shot) => {
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
    if (Math.hypot(after.x - before.x, after.y - before.y) > .001) throw Error('Theme chooser moved the hero');
    continuity.push({ theme: themes[index], before, after, motion: w.__pvMotion,
      persisted: saved, frame: 240 + index * 45, transition: 'continuous walk / fixed camera / native theme change' });
    themeIndex = index;
  };
  window.pv2 = {
    ...base,
    async prepare(shot) {
      d.querySelector('#talk-close')?.click(); w.__pvWalking = false;
      frame.style.width = '1920px';
      if (shot.kind === 'walk') { w.Math.random = () => .12; w.__pvDeliver({ type: 'replay', events: [] }); }
      const result = await base.prepare(shot);
      if (shot.kind === 'walk') {
        w.__pvWalking = true; themeIndex = -1; w.Math.random = () => .12;
        await choose(0, shot);
        // Wait once for a real walk along the common east lane; never seek again per theme.
        let previous = position('quiet-quest'), moving = 0;
        for (let i = 0; i < 2500 && moving < 2; i++) {
          w.__pvMs += 100; w.__pvMotion += 100; await tick();
          const next = position('quiet-quest');
          moving = next.x - previous.x > 3.59 && Math.abs(next.y - previous.y) < .001
            && next.y === 250 && next.x > 550 && next.x < 575 ? moving + 1 : 0;
          previous = next;
        }
        if (moving < 2) throw Error('No continuous east-lane take');
        walkingMotion = w.__pvMotion; walkingAge = w.__pvMs - shot.number * 1000000;
        continuity[0].before = continuity[0].after = position('quiet-quest');
        continuity[0].motion = walkingMotion;
      }
      if (shot.kind === 'treasure') {
        treasureId = shot.state.id;
        for (let i = 0; i < 8; i++) { w.__pvMotion += 100; await tick(); }
        // base.frames must start at this clock, not move backwards during badge capture.
        treasureMotion = w.__pvMotion;
        const reportsRead = JSON.parse(w.localStorage.getItem('yushario-read-reports') ?? '[]');
        unreadBefore = !reportsRead.some(([id, at]) => id === shot.state.id && at === w.__pvBase + shot.number * 1000000);
        if (!unreadBefore) throw Error('Treasure must be unread before the actual click');
      }
      return { ...result, heroPosition: shot.kind === 'walk' ? position('quiet-quest') : undefined };
    },
    async openTreasure() {
      const hero = position('Claude Code (2)'), rect = w.world.getBoundingClientRect();
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
        .talk-body{font-size:${square ? 29 : 34}px!important;line-height:1.5!important;overflow:hidden!important}.talk-body code{font-size:1em!important;line-height:inherit!important}.report-more{display:none!important}
        #pv4-chest-heading{position:fixed;top:0;left:0;width:${width}px;padding:55px 0 40px;background:#0d0b14;color:#ffe066;text-align:center;font:800 ${square ? 64 : 82}px/1.4 system-ui;z-index:999}`;
      d.head.append(css);
      for (const [id, text] of [['pv4-chest-heading', ja ? '開けてみよう' : 'See what awaits']]) {
        const el = d.createElement('div'); el.id = id; el.textContent = text; d.body.append(el);
      }
      const history = d.querySelector('#talk-history'); history.scrollTop = card.offsetTop - history.offsetTop;
      // Clip at the measured end of the genuine first paragraph; leave the stored/DOM text intact.
      const body = card.querySelector('.talk-body'), paragraph = body.querySelector(':scope > p');
      if (!paragraph) throw Error('Missing genuine Markdown conclusion paragraph');
      const bodyText = body.textContent, range = d.createRange();
      range.selectNodeContents(paragraph);
      let conclusionBounds = range.getBoundingClientRect();
      const conclusionHeight = Math.ceil(conclusionBounds.bottom - body.getBoundingClientRect().top + 4);
      body.style.setProperty('height', `${conclusionHeight}px`, 'important');
      body.style.setProperty('max-height', `${conclusionHeight}px`, 'important');
      output.hidden = true; await tick();
      // Wait for two real outer-document compositor frames, not the replay iframe's queued clock.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      conclusionBounds = range.getBoundingClientRect(); // Clipping can change the history scroll position.
      treasureProof = { unreadBefore, realBadgeClicked: true, dialogOpen: true, card: card.innerText,
        files: [...card.querySelectorAll('.report-files li')].map(el => el.textContent),
        tests: card.querySelector('.report-tally p').textContent, firstLine: paragraph.textContent,
        ui: ['.talk-heading h3', '.report-headline', '.report-time', '.report-tally p'].map(selector => {
          const el = selector.startsWith('.talk-heading') ? d.querySelector(selector) : card.querySelector(selector);
          const range = d.createRange(); range.selectNodeContents(el);
          return { text: el.textContent, textBounds: range.getBoundingClientRect().toJSON(), box: el.getBoundingClientRect().toJSON() };
        }),
        conclusionBounds: conclusionBounds.toJSON(), conclusionHeight, bodyTextIntact: body.textContent === bodyText,
        read: JSON.parse(w.localStorage.getItem('yushario-read-reports')).filter(([id]) => id === treasureId),
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
      // Reject that first compositor frame and let film take another native screenshot;
      // enlarging half-resolution pixels would blur Japanese text relative to v6.
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
      if (extent < treasureCrop[2] * 0.75 && extent > treasureCrop[2] * 0.45) return false;
      treasureProof.capture.pixels = [treasureImage.width, treasureImage.height];
      treasureProof.capture.contentRight = extent;
      treasureProof.capture.crop = treasureCrop;
      output.hidden = false;
      return true;
    },
    async frames(shot, start, count) {
      const result = [];
      for (let f = start; f < start + count; f++) {
        if (shot.kind === 'walk') {
          const index = Math.floor(f / 45);
          if (index !== themeIndex) await choose(index, shot);
          const localShot = { ...shot, kind: 'biome', filmMotion: walkingMotion,
            ageStart: walkingAge, ageEnd: walkingAge + 224 * 1000 / 30 };
          await base.frames(localShot, f, 1);
          const p = position('quiet-quest'), previous = positions.at(-1);
          if (previous && f === previous.frame - 240 + 1 && (p.x <= previous.x || p.x - previous.x > 1.201 || p.y !== 250))
            throw Error(`Continuous walk stopped or turned at frame ${240 + f}: ${JSON.stringify(p)}`);
          positions.push({ frame: 240 + f, theme: themes[index], motion: w.__pvMotion, ...p });
          result.push(output.toDataURL('image/png').split(',')[1]);
        } else if (shot.kind === 'treasure') {
          if (f < 60) {
            await base.frames({ ...shot, kind: 'biome', filmMotion: treasureMotion }, f, 1);
            const hero = position('Claude Code (2)'), source = w.world;
            ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, width, 1080);
            const scale = Math.min((width - 80) / 720, 735 / 720);
            ctx.drawImage(source, hero.x * 2 - 360, hero.y * 2 - 440, 720, 720,
              (width - 720 * scale) / 2, 245, 720 * scale, 720 * scale);
            words(ja ? '戦いが終わると' : 'When the battle ends', 100, square ? 64 : 78);
            words(ja ? '報酬が届く' : 'the rewards arrive', 196, square ? 64 : 78);
          } else {
            if (!treasureImage) throw Error('Native DOM screenshot missing');
            ctx.drawImage(treasureImage, ...treasureCrop, 0, 0, width, 1080);
            // Hand attention to the genuine report after the two-second invitation.
            if (f >= 120) { ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, width, 205); }
          }
          result.push(output.toDataURL('image/png').split(',')[1]);
        } else {
          result.push(...await base.frames(shot, f, 1));
          // Preserve the approved title card's dark band, including its flash frames.
          if (['title', 'cta'].includes(shot.kind)) {
            ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 924, width, 68);
            result[result.length - 1] = output.toDataURL('image/png').split(',')[1];
          }
        }
        signFrames.push({ frame: Math.round(shot.start * 30 + f), kind: shot.kind,
          place: w.world.getAttribute('aria-label')?.split(ja ? '。' : '. ')[0], labels: w.world.getAttribute('aria-label'),
          canvasText: [...Object.keys(w.__pvPlaceLabels), ...Object.keys(w.__pvLabels)], draws: w.__pvSignDraws });
      }
      return result;
    },
    proof() { return { ...base.proof(), continuity, positions, signFrames, treasure: treasureProof, townWrites: w.__pvTownWrites }; },
  };
  return 'PV continuous town walk and native report camera ready';
}
