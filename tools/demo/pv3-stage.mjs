// S8.7 camera: genuine app canvas/DOM; editorial framing and larger copy only.
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
  let receipt = 0, state, delivered = new Set(), notice, noticeRect, noticeStyle;
  const textChecks = new Map();
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
  const note = () => words([ja ? '本物の作業記録・短縮' : 'Real work, condensed.'], width / 2, 1040, 28, '#c9c3dc');
  const fit = (image, r, box) => {
    const scale = Math.min(box[2] / r[2], box[3] / r[3]);
    const dw = r[2] * scale, dh = r[3] * scale;
    ctx.drawImage(image, ...r, Math.round(box[0] + (box[2] - dw) / 2), Math.round(box[1] + (box[3] - dh) / 2), Math.round(dw), Math.round(dh));
  };
  // Storyboard coordinates were on v1's 1920x1080 output; recover the original canvas crop.
  const original = ([x, y, sw, sh]) => [(x - 124.5) / 1.5, (y - 92) / 1.5, sw / 1.5, sh / 1.5];
  const full = original(square ? [565, 280, 810, 616] : [395, 280, 1130, 616]);
  const back = original([570, 620, 225, 276]);
  const dragon = original([720, 330, 490, 380]);
  const hands = original([550, 620, 900, 276]);
  const blend = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);
  const draw = (shot, f) => {
    const p = Math.min(1, f / Math.max(1, shot.seconds * 30 - 1));
    ctx.fillStyle = '#0d0b14'; ctx.fillRect(0, 0, width, 1080);
    const k = shot.kind, source = w.world;
    if (k === 'opening') words([ja ? 'その仕事に、冒険を。' : 'Make work an adventure.'], width / 2, 550, square ? 64 : 84);
    else if (k === 'beyond') words(ja ? ['ひとりでは、', '届かない場所へ。'] : ['Beyond what one', 'can do alone.'], width / 2, 465, square ? 76 : 96);
    else if (k === 'title' || k === 'cta') {
      fit(title, [0, 0, title.width, title.height], [margin, 95, width - 2 * margin, square ? 335 : 370]);
      words(ja ? ['いつもの仕事が、', '冒険になる。'] : ['Your next task.', 'Your next adventure.'], width / 2, 565, square ? 70 : 86);
      words([ja ? '音楽：魔王魂' : 'Music: Maou Damashii'], width / 2, 963, 38, '#c9c3dc');
      if (k === 'cta') {
        words([ja ? 'Claude Code / pi / ほか順次' : 'Claude Code / pi / more to come'], width / 2, 754, square ? 34 : 40, '#c9c3dc');
        words(['npx agent-quest'], width / 2, 833, 54, '#fff');
        words([ja ? 'npm公開準備中' : 'npm release in preparation'], width / 2, 895, 30, '#c9c3dc');
        words([ja ? '複数の実記録を編集' : 'Edited from multiple real takes.'], width / 2, 1040, 28, '#c9c3dc');
      }
      // Only one editorial flash; three 30fps frames, no repetitive flicker.
      if (k === 'title' && f < 3) { ctx.fillStyle = `rgba(255,255,255,${[0.30, 0.15, 0.05][f]})`; ctx.fillRect(0, 0, width, 1080); }
    } else if (k !== 'black') {
      if (k === 'world') {
        const s = 0.92 + p * 0.08, sw = source.width * s, sh = source.height * s;
        fit(source, [(source.width - sw) / 2, (source.height - sh) / 2, sw, sh], [0, 30, width, 970]);
      } else if (k === 'town') {
        const r = square ? [620 + p * 35, 330, 820, 620] : [p * 24, 300, 1872, 650];
        fit(source, r, [0, 50, width, 915]);
      } else if (k === 'heroes') {
        words([ja ? 'あなたのエージェントが' : 'Your agents.'], width / 2, 165, square ? 76 : 100);
        fit(source, square ? [480, 220, 1120, 740] : [440, 220, 1200, 740], [30, 250, width - 60, 570]);
        words([ja ? '勇者になる。' : 'Become heroes.'], width / 2, 908, square ? 86 : 104, '#fff');
        words([ja ? 'Claude Code / pi / ほか順次' : 'Claude Code / pi / more to come'], width / 2, 984, square ? 34 : 40, '#c9c3dc');
      } else if (k === 'biome') {
        fit(source, square ? [390, 0, 1200, 1080] : [0, 0, 1920, 1080], [0, 45, width, 950]);
      } else if (k === 'church' || k === 'inn') {
        const prayer = k === 'church';
        words([ja ? (prayer ? '明日へ、祈りを。' : 'ひと息も、冒険のうち。') : (prayer ? 'Pray for the road ahead.' : 'A moment to rest.')], width / 2, 115, square ? 64 : 82);
        const crop = prayer ? (square ? [500, 150, 920, 820] : [380, 120, 1160, 850])
          : (square ? [180, 160, 1080, 820] : [180, 120, 1320, 850]);
        fit(source, crop, [20, 185, width - 40, 800]);
      } else if (k === 'level') {
        fit(source, full, [30, 125, width - 60, 725]);
        words([ja ? '冒険のたびに、強くなる。' : 'Grow with every quest.'], width / 2, 90, square ? 58 : 72, '#c9c3dc');
        if (!notice) throw Error('Missing real level notice pixels');
        fit(notice, noticeRect, [margin, 891, width - 2 * margin, 88]);
      } else {
        let r = full, box = [0, 44, width, 920];
        if (k === 'back') { r = back; box = [margin, 70, width - 2 * margin, 880]; }
        if (k === 'reveal') r = blend(back, full, 1 - (1 - p) ** 2);
        if (k === 'dragon' || k === 'dragon-hit') { r = dragon; box = [margin, 70, width - 2 * margin, 880]; }
        if (k === 'hands' || k === 'party-hit') { r = hands; box = [margin, 70, width - 2 * margin, 880]; }
        fit(source, r, box);
      }
      if (k !== 'world') note();
    }
  };
  window.pv2 = {
    async prepare(shot) {
      output.hidden = false; state = shot.state; delivered = new Set();
      if (!state) return;
      receipt = shot.number * 1000000; w.__pvMs = receipt + shot.ageStart;
      w.__pvMotion = shot.motion - 1500;
      const baseTown = { name: 'tiny-quest', path: '/demo/tiny-quest', firstSeenAt: w.__pvBase, lastActiveAt: w.__pvBase, pinned: false, theme: 'village' };
      w.__pvDeliver({ type: 'towns', towns: state.towns ?? [baseTown] });
      d.querySelector('#following-stop')?.click(); d.querySelector('#world-back').click();
      const offset = w.__pvBase + receipt - state.anchor;
      w.__pvDeliver({ type: 'replay', events: state.events.map(row => ({ event: row.event, at: row.at + offset })) });
      await tick();
      if (!state.world) {
        const b = d.querySelector(`.compact-hero[data-hero="${state.id}"]`);
        if (!b) throw Error('Missing recorded hero: ' + state.id); b.click();
        menu('ついていく');
      }
      w.__pvMotion = shot.motion - 800; await tick(); await new Promise(r => setTimeout(r, 80)); await tick();
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
      noticeStyle.textContent = `#messages{display:block!important;position:fixed!important;left:0;top:0;width:${width}px;height:500px;margin:0;padding:0;z-index:999;background:#0d0b14;font-size:${square ? 40 : 48}px;line-height:72px;letter-spacing:0;text-align:center;white-space:pre-line;color:#ffe066}`;
      d.head.append(noticeStyle); output.hidden = true;
      return [0, index * 72, width, 72];
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
        w.__pvMs = receipt + age; w.__pvMotion = shot.motion + f * 1000 / 30;
        for (const [i, row] of (state?.live ?? []).entries()) if (!delivered.has(i) && row.at - state.anchor <= age) {
          w.__pvDeliver({ type: 'event', event: row.event, at: w.__pvBase + receipt + row.at - state.anchor }); delivered.add(i);
        }
        await tick(); draw(shot, f); result.push(output.toDataURL('image/png').split(',')[1]);
      }
      return result;
    },
    proof() { return { place: d.querySelector('#place-name').textContent, canvas: [w.world.width, w.world.height],
      labels: w.world.getAttribute('aria-label'), heroes: [...d.querySelectorAll('.compact-hero')].map(b => b.innerText),
      level: d.querySelector('#messages').textContent.split('\n').findLast(t => t.includes('レベル3')), age: w.__pvMs - receipt }; },
    textChecks: () => [...textChecks.values()],
  };
  return 'Orca PV2 camera ready';
}
