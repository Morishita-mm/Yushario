// Genuine app canvas/DOM; editorial framing and larger copy only.
export async function installCamera(html, init, width, language) {
  document.body.replaceChildren(); document.body.style.cssText = 'margin:0;background:#0d0b14';
  const frame = document.createElement('iframe'); frame.id = 'pv2-app';
  // A fixed wide app canvas keeps real party coordinates identical in both aspect ratios.
  frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0';
  frame.srcdoc = html.replace('<head>', `<head><script>${init}<\/script>`); document.body.append(frame);
  await new Promise(r => frame.onload = r);
  const w = frame.contentWindow, d = frame.contentDocument;
  for (let i = 0; i < 200 && !w.__pvDeliver; i++) await new Promise(r => setTimeout(r, 50));
  if (!w.__pvDeliver) throw Error('PV2 real app not ready');
  d.querySelector('#title-screen button')?.click();
  const css = d.createElement('style');
  css.textContent = `body{overflow:hidden;background:#0d0b14}body>header,.map-nav,.sidebar,.first-step,#following,.messages{display:none!important}
    .quest{display:block;padding:0}.stage{width:100%;padding:0}.map-stage{height:1080px}`;
  d.head.append(css); await d.fonts.ready;
  const output = document.createElement('canvas'); output.width = width; output.height = 1080;
  output.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:1080px;z-index:1`; document.body.append(output);
  const ctx = output.getContext('2d'), square = width === 1080, ja = language === 'ja', margin = square ? 64 : 96;
  ctx.imageSmoothingEnabled = false;
  const title = new Image(); title.src = new URL('/logo/title.png', location.href); await title.decode();
  let receipt = 0, state, delivered = new Set(), notice, noticeRect, noticeStyle, motionBase = 0, previousKind;
  const clocks = [];
  const textChecks = new Map(), framing = [], titles = [];
  let noticeProof;
  let view;
  const tick = async () => { w.__pvTick(); w.__pvTick(); await new Promise(r => setTimeout(r, 0)); };
  const menu = label => {
    const b = [...d.querySelectorAll('#town-layer button')].find(b => b.textContent.trim() === label);
    if (!b) throw Error('Missing real menu: ' + label); b.click();
  };
  const words = (lines, x, y, size, color = '#ffe066', align = 'center', safe = width - 2 * margin) => {
    ctx.font = `800 ${size}px system-ui,sans-serif`; ctx.textAlign = align; ctx.fillStyle = color;
    for (const [i, line] of lines.entries()) {
      const measured = ctx.measureText(line).width;
      if (measured > safe) throw Error(`PV2 unsafe copy: ${line} (${measured}/${safe})`);
      textChecks.set(line, { line, size, measured, safe }); ctx.fillText(line, x, y + i * size * 1.28);
    }
  };
  const fit = (image, r, box) => {
    const scale = Math.min(box[2] / r[2], box[3] / r[3]);
    const dw = r[2] * scale, dh = r[3] * scale;
    const destination = [Math.round(box[0] + (box[2] - dw) / 2), Math.round(box[1] + (box[3] - dh) / 2), Math.round(dw), Math.round(dh)];
    ctx.drawImage(image, ...r, ...destination);
    if (image === w.world || image === w.__pvBattlePlate) view = { crop: r, destination };
  };
  // Recover the original canvas crop from the 1920x1080 storyboard coordinates.
  const original = ([x, y, sw, sh]) => [(x - 124.5) / 1.5, (y - 92) / 1.5, sw / 1.5, sh / 1.5];
  const full = square ? [155, 115, 800, 490] : [175, 115, 760, 460];
  // Five genuine party members; one uninterrupted pullback from dragon to full party.
  const back = [216, 350, 165, 225];
  const dragon = original([720, 330, 490, 380]);
  const hands = original([550, 620, 900, 276]);
  const blend = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);
  const draw = (shot, f) => {
    const p = Math.min(1, f / Math.max(1, shot.seconds * 30 - 1));
    ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, width, 1080);
    const k = shot.kind;
    const source = w.__pvBattleDrawn && ['back', 'challenge', 'reveal', 'party', 'hero-hit', 'return', 'hit', 'test', 'level'].includes(k) ? w.__pvBattlePlate : w.world;
    view = undefined;
    if (k === 'opening') words([ja ? 'はじめよう' : "Let's begin"], width / 2, 550, square ? 64 : 84);
    else if (k === 'beyond') words([ja ? 'ひとりじゃない' : 'Not alone'], width / 2, 550, square ? 76 : 96);
    else if (k === 'title' || k === 'cta') {
      // The 684×282 Yushario artwork has a six-pixel grid: 4/3× and 2× keep it crisp.
      const scale = square ? 4 / 3 : 2;
      const progress = k === 'cta' ? 1 : Math.max(0, Math.min(1, (f - 3) / 33));
      const revealed = Math.floor(title.width * progress / 6) * 6;
      const left = (width - title.width * scale) / 2, top = square ? 170 : 92;
      if (revealed) ctx.drawImage(title, 0, 0, revealed, title.height, left, top, revealed * scale, title.height * scale);
      const tagline = [ja ? '退屈な仕事を冒険に' : 'Turn dull work into adventure'];
      if (progress === 1) words(tagline, width / 2, square ? 675 : 785, square ? (ja ? 64 : 54) : 78);
      titles.push({ frame: Math.round(shot.start * 30 + f), revealed, scale, tagline: progress === 1, smoothing: ctx.imageSmoothingEnabled });
      // Only one editorial flash; three 30fps frames, no repetitive flicker.
      if (k === 'title' && f < 3) { ctx.fillStyle = `rgba(255,255,255,${[0.30, 0.15, 0.05][f]})`; ctx.fillRect(0, 0, width, 1080); }
    } else if (k !== 'black') {
      if (k === 'world') {
        const s = 0.92 + p * 0.08, sw = source.width * s, sh = source.height * s;
        fit(source, [(source.width - sw) / 2, (source.height - sh) / 2, sw, sh], [0, 30, width, 970]);
      } else if (k === 'town') {
        const r = square ? [640, 200, 1280, 780] : [0, 200, 1920, 780];
        fit(source, r, [0, 50, width, 915]);
      } else if (k === 'heroes') {
        words([ja ? 'あなたのエージェントが' : 'Your agent'], width / 2, 165, square ? 76 : 100);
        const people = ['Claude Code', 'Claude Code (2)'].map(name => w.__pvLabels[name]?.bounds);
        if (people.some(p => !p)) throw Error('Missing actual introduction heroes');
        const left = Math.min(...people.map(p => p[0])), right = Math.max(...people.map(p => p[2]));
        const top = Math.min(...people.map(p => p[1])), bottom = Math.max(...people.map(p => p[3]));
        const sw = Math.max(440, right - left + 140), sh = Math.max(330, bottom - top + 185);
        fit(source, [(left + right - sw) / 2, bottom + 45 - sh, sw, sh], [30, 245, width - 60, 545]);
        words([ja ? '勇者に' : 'becomes a hero'], width / 2, 908, square ? 86 : 104, '#fff');
      } else if (k === 'biome') {
        const hero = w.__pvLabels['quiet-quest'];
        if (w.__pvWalking && hero) {
          // Fixed camera for the entire continuous walk; changing the theme never reframes it.
          fit(source, square ? [720, 100, 1200, 950] : [0, 0, 1920, 1080], [0, 45, width, 950]);
        } else fit(source, square ? [390, 0, 1200, 1080] : [0, 0, 1920, 1080], [0, 45, width, 950]);
      } else if (k === 'church' || k === 'inn') {
        const prayer = k === 'church';
        words([ja ? (prayer ? '祈りを捧げて' : 'ひと息つこう') : (prayer ? 'A moment of prayer' : 'Take a breather')], width / 2, 115, square ? 60 : 82);
        const crop = prayer ? (square ? [500, 150, 920, 820] : [380, 120, 1160, 850])
          : (square ? [180, 160, 1080, 820] : [180, 120, 1320, 850]);
        fit(source, crop, [20, 185, width - 40, 800]);
      } else if (k === 'level') {
        fit(source, full, [30, 125, width - 60, 725]);
        words([ja ? 'レベルアップ' : 'Level up'], width / 2, 90, square ? 76 : 90);
        if (!notice) throw Error('Missing real level notice pixels');
        fit(notice, noticeRect, [margin, 891, width - 2 * margin, 88]);
      } else {
        let r = full, box = [0, 44, width, 920];
        if (['back', 'challenge', 'reveal', 'party'].includes(k)) box = [0, 175, width, 790];
        if (k === 'back') r = back;
        if (k === 'challenge') r = dragon;
        if (k === 'reveal') r = blend(dragon, full, 1 - (1 - p) ** 2);
        if (k === 'dragon' || k === 'dragon-hit') { r = dragon; box = [margin, 70, width - 2 * margin, 880]; }
        if (k === 'hands' || k === 'party-hit') { r = hands; box = [margin, 70, width - 2 * margin, 880]; }
        fit(source, r, box);
      }
      if (k === 'back') words([ja ? 'ひとりじゃない' : 'Not alone'], width / 2, 115, square ? 76 : 90);
      if (k === 'challenge') words([ja ? '困難には' : 'When the going gets tough'], width / 2, 115, square ? (ja ? 76 : 60) : 90);
      if (['reveal', 'party'].includes(k)) words([ja ? 'みんなで挑め' : 'Face it together'], width / 2, 115, square ? 76 : 90);
    }
  };
  window.pv2 = {
    async prepare(shot) {
      output.hidden = false;
      const continuous = (['back', 'challenge', 'reveal'].includes(previousKind) && ['challenge', 'reveal', 'party'].includes(shot.kind))
        || (previousKind === 'town' && shot.kind === 'heroes');
      previousKind = shot.kind;
      // Preserve battle phase modulo 9000 while NEVER rewinding the filming clock.
      motionBase = shot.motion + Math.max(0, Math.ceil((w.__pvMotion + 1500 - shot.motion) / 9000)) * 9000;
      if (continuous) { motionBase = w.__pvMotion + 1000 / 30; return this.proof(); }
      state = shot.state; delivered = new Set();
      if (!state) return;
      receipt = shot.number * 1000000; w.__pvMs = receipt + shot.ageStart;
      w.__pvMotion = motionBase - 1500;
      const baseTown = { name: 'tiny-quest', path: '/demo/tiny-quest', firstSeenAt: w.__pvBase, lastActiveAt: w.__pvBase, pinned: false, theme: 'village' };
      w.__pvDeliver({ type: 'towns', towns: state.towns ?? [baseTown] });
      d.querySelector('#following-stop')?.click(); d.querySelector('#world-back').click();
      if (shot.kind === 'town') w.__pvDeliver({ type: 'replay', events: [] });
      const offset = w.__pvBase + receipt - state.anchor;
      w.__pvDeliver({ type: 'replay', events: state.events.map(row => ({
        event: state.projectAliases?.[row.event.agent] ? { ...row.event, project: state.projectAliases[row.event.agent], name: state.projectAliases[row.event.agent] } : row.event,
        at: row.at + offset + (state.receiptShift?.[row.event.agent] ?? 0),
      })) });
      await tick();
      if (!state.world) {
        const b = d.querySelector(`.compact-hero[data-hero="${state.id}"]`);
        if (!b) throw Error('Missing recorded hero: ' + state.id); b.click();
        menu('ついていく');
      }
      w.__pvMotion = motionBase - 800; await tick(); await new Promise(r => setTimeout(r, 80)); await tick();
      if (shot.kind === 'town') {
        for (let i = 0; i < 60; i++) { w.__pvMotion += 100; await tick(); }
        motionBase = w.__pvMotion + 1000 / 30;
      }
      if (shot.kind === 'level') {
        w.__pvDeliver({ type: 'event', event: state.live[0].event, at: w.__pvBase + receipt }); delivered.add(0);
        for (let i = 0; i < 60; i++) await tick();
      }
      return this.proof();
    },
    noticeArea() {
      const root = d.querySelector('#messages'), lines = root.textContent.split('\n');
      const index = lines.findLastIndex(t => t.includes('レベル3'));
      if (index < 0) throw Error('No genuine Lv2→3 notification');
      noticeStyle = d.createElement('style');
      noticeStyle.textContent = `#messages{display:block!important;position:fixed!important;left:0;top:0;width:${width}px;height:500px;margin:0;padding:0;z-index:999;background:#0d0b14;font-size:${square ? 40 : 48}px;line-height:72px;letter-spacing:0;text-align:center;white-space:pre;color:#ffe066}`;
      d.head.append(noticeStyle); output.hidden = true;
      // Measure the genuine DOM line: earlier messages can wrap at square width.
      const range = d.createRange(), start = lines.slice(0, index).join('\n').length + (index ? 1 : 0);
      range.setStart(root.firstChild, start); range.setEnd(root.firstChild, start + lines[index].length);
      let bounds = range.getBoundingClientRect();
      if (bounds.width > width - 48) {
        const size = Math.floor((square ? 40 : 48) * (width - 48) / bounds.width);
        noticeStyle.textContent += `#messages{font-size:${size}px}`;
        bounds = range.getBoundingClientRect();
      }
      noticeProof = { text: lines[index], bounds: [bounds.left, bounds.top, bounds.right, bounds.bottom], width };
      if (bounds.left < 0 || bounds.right > width || bounds.bottom > 1080) throw Error('Level notice outside screenshot');
      return [0, Math.max(0, Math.floor(bounds.top) - 8), width, Math.ceil(bounds.height) + 16];
    },
    async setNotice(data, rect) {
      notice = new Image(); notice.src = 'data:image/png;base64,' + data; await notice.decode(); noticeRect = rect;
      noticeStyle.remove(); output.hidden = false;
    },
    async frames(shot, start, count) {
      const result = [];
      for (let f = start; f < start + count; f++) {
        let age = shot.ageStart + (shot.ageEnd - shot.ageStart) * f / Math.max(1, shot.seconds * 30 - 1);
        if (shot.kind === 'test') age = f < 30 ? 576 * f / 30 : 577 + (850 - 577) * (f - 30) / 14;
        const nextMotion = (shot.filmMotion ?? motionBase) + f * 1000 / 30;
        if (nextMotion < w.__pvMotion - .001) throw Error('Filming clock moved backwards');
        w.__pvMs = receipt + age; w.__pvMotion = nextMotion;
        clocks.push({ frame: Math.round(shot.start * 30 + f), motion: nextMotion });
        for (const [i, row] of (state?.live ?? []).entries()) if (!delivered.has(i) && row.at - state.anchor <= age) {
          w.__pvDeliver({ type: 'event', event: row.event, at: w.__pvBase + receipt + row.at - state.anchor }); delivered.add(i);
        }
        await tick(); draw(shot, f);
        if (view && ['town', 'heroes', 'biome', 'back', 'challenge', 'reveal', 'party', 'hero-hit', 'return'].includes(shot.kind)) {
          const { crop: r, destination: b } = view;
          const project = bounds => bounds.map((v, i) => b[i % 2] + (v - r[i % 2]) * b[2 + i % 2] / r[2 + i % 2]);
          const actors = w.__pvActors.map(actor => ({ ...actor, output: project(actor.bounds) }));
          const name = w.__pvWalking ? w.__pvLabels['quiet-quest'] : undefined;
          framing.push({ frame: Math.round(shot.start * 30 + f), kind: shot.kind, ...view, actors,
            name: name ? project(name.bounds) : undefined,
            introduction: shot.kind === 'heroes' ? ['Claude Code', 'Claude Code (2)'].map(name => ({ name, bounds: project(w.__pvLabels[name].bounds) })) : undefined,
            townHeroes: ['town', 'heroes'].includes(shot.kind) ? ['Claude Code', 'pi', 'pi (2)', 'Claude Code (2)'].map(name => ({
              name, x: w.__pvLabels[name].x, y: w.__pvLabels[name].y - 13, output: project(w.__pvLabels[name].bounds) })) : undefined,
            sourceSize: [w.world.width, w.world.height] });
        }
        result.push(output.toDataURL('image/png').split(',')[1]);
      }
      return result;
    },
    proof() { return { place: d.querySelector('#place-name').textContent, canvas: [w.world.width, w.world.height],
      labels: w.world.getAttribute('aria-label'), heroes: [...d.querySelectorAll('.compact-hero')].map(b => b.innerText),
      level: d.querySelector('#messages').textContent.split('\n').findLast(t => t.includes('レベル3')), noticeProof, age: w.__pvMs - receipt, framing, clocks, titles }; },
    textChecks: () => [...textChecks.values()],
  };
  return 'Orca PV2 camera ready';
}
