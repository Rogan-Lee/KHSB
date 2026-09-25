// ══ 강한선배 BX 씬 엔진 — 스티키 스크롤 연출 (홈 · 윈터스쿨, bx-core.js 이후 로드) ══
// 각 [data-scene] 섹션의 스크롤 진행도(0~1)를 계산해 씬별 update(p)에 넘긴다.
// 스티키 뷰포트 안에서는 transform · opacity · clip-path 만 바꿔 레이아웃을 흔들지 않는다.
// prefers-reduced-motion 이면 스티키 트랙을 걷어내고 각 씬의 최종 상태를 정적으로 보여준다.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIn = t => t * t * t;
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const root = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (RM) root.classList.add('bx-rm');
  let vw = innerWidth, vh = innerHeight;
  const mobile = () => vw < 861;

  // ── 씬 레지스트리 ──
  const scenes = [];
  function scene(name, setup) {
    const el = $(`[data-scene="${name}"]`);
    if (!el) return;
    scenes.push({ el, ...setup(el) });
  }
  const progressOf = el => {
    const r = el.getBoundingClientRect();
    const len = r.height - vh;
    return len <= 0 ? (r.top <= 0 ? 1 : 0) : clamp(-r.top / len);
  };

  // 카운트업 (proof 씬에서 필이 화면을 덮은 뒤 시작)
  const fmt = (v, dec) => v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  function countUp(els) {
    els.forEach(el => {
      const to = parseFloat(el.dataset.to), dec = parseInt(el.dataset.dec || '0', 10);
      if (RM) { el.textContent = fmt(to, dec); return; }
      const t0 = performance.now(), D = 1500;
      const tick = t => {
        const k = Math.min((t - t0) / D, 1);
        el.textContent = fmt(to * easeOut(k), dec);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // ① HERO — 라운드 카드 → 풀블리드 → 카피 교체 → 푸시인
  scene('hero', el => {
    const media = $('#heroMedia'), img = $('img', media);
    const c1 = $('.hero-copy-1', el), c2 = $('.hero-copy-2', el), cue = $('.scroll-cue', el);
    return {
      rmP: .64,
      update(p) {
        const a = easeInOut(seg(p, 0, .3));
        media.style.clipPath = `inset(${lerp(mobile() ? 10 : 18, 0, a).toFixed(2)}px round ${lerp(28, 0, a).toFixed(2)}px)`;
        const push = easeIn(seg(p, .64, 1));
        img.style.transform = `scale(${(lerp(1.12, 1, a) + push * .24).toFixed(4)})`;
        media.style.setProperty('--hd', (seg(p, .3, .5) * .22 + push * .4).toFixed(3));
        const out = seg(p, .26, .4);
        c1.style.opacity = (1 - out).toFixed(3);
        c1.style.transform = `translateY(${(-70 * out).toFixed(1)}px)`;
        c1.style.filter = out > 0 ? `blur(${(10 * out).toFixed(1)}px)` : '';
        const inn = easeOut(seg(p, .44, .62));
        c2.style.opacity = inn.toFixed(3);
        c2.style.transform = `translateY(${(44 * (1 - inn)).toFixed(1)}px)`;
        c2.classList.toggle('live', inn > .5);
        if (cue) cue.style.opacity = (1 - seg(p, 0, .08)).toFixed(3);
      },
    };
  });

  // ② MANIFESTO — 단어 단위로 켜짐 (<em> 구간은 브랜드 컬러)
  scene('manifesto', el => {
    const t = $('#mfText', el);
    const words = [];
    const walk = (node, em) => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(tok => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
            const s = document.createElement('span');
            s.className = em ? 'w em' : 'w';
            s.textContent = tok;
            frag.appendChild(s);
            words.push(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n, em || n.tagName === 'EM');
      });
    };
    walk(t, false);
    let last = -1;
    return {
      rmP: 1,
      update(p) {
        const n = Math.round(seg(p, .06, .82) * words.length);
        if (n === last) return;
        last = n;
        words.forEach((w, i) => w.classList.toggle('on', i < n));
      },
    };
  });

  // ③ 아이의 하루 — 단계마다 그 기록이 실제로 남는 화면으로 바뀌고, 마지막에 월간 리포트
  scene('day', el => {
    const steps = $$('#daySteps li', el), shots = $$('.day-pf img', el);
    const dcTime = $('#dcTime'), dcLabel = $('#dcLabel'), dcFill = $('#dcFill'), dayCap = $('#dayCap');
    const STEPS = [
      { t: '08:52', l: '입실', f: .06, c: '월간 리포트 · 원생 기록' },
      { t: '11:20', l: '2교시 순찰', f: .21, c: '월간 리포트 · 순찰 점검' },
      { t: '15:40', l: '상벌점', f: .48, c: '학생 앱 · 상벌점 내역' },
      { t: '19:30', l: '멘토링', f: .72, c: '멘토링 리포트' },
      { t: '23:58', l: '하원', f: 1, c: '학생 앱 · 내 일정 · 공부 계획' },
      { t: '매달', l: '월간 리포트', f: 1, c: '월간 리포트 · 첫 화면' },
    ];
    const C = 326.73;
    let cur = -1;
    function set(i) {
      if (i === cur) return;
      cur = i;
      const s = STEPS[i];
      steps.forEach((li, k) => { li.classList.toggle('on', k === i); li.classList.toggle('done', k < i); });
      shots.forEach((im, k) => im.classList.toggle('on', k === i));
      dcTime.textContent = s.t;
      dcLabel.textContent = s.l;
      dcFill.style.strokeDashoffset = (C * (1 - s.f)).toFixed(2);
      if (dayCap) dayCap.textContent = s.c;
    }
    const measure = () => {
      const avail = mobile() ? (vh - 72) * .58 : Math.min(vh * .82, 680);
      el.style.setProperty('--phs', Math.min(1, avail / 620).toFixed(3));
    };
    return {
      measure,
      rm() { set(5); },
      update(p) { set(Math.min(5, Math.floor(seg(p, .03, .97) * 6))); },
    };
  });

  // ④ 결과 — "관리한 만큼 ● 오릅니다" 의 필이 화면을 덮으며 다크 통계로
  scene('pill', el => {
    const pill = $('#pillShape'), a = $('.pl-a', el), b = $('.pl-b', el), dark = $('.proof-dark', el);
    const cnts = $$('.bx-cnt', el);
    let S = 20, counted = false;
    // 스타디움(양끝 둥근) 도형이 화면 모서리까지 덮으려면 cover 배율의 약 2배가 필요
    const measure = () => { S = 2.1 * Math.max(vw / pill.offsetWidth, vh / pill.offsetHeight); };
    return {
      measure,
      rmP: 1,
      update(p) {
        const g = easeIn(seg(p, .06, .42));
        pill.style.transform = `scale(${(1 + (S - 1) * g).toFixed(3)})`;
        const spread = easeOut(seg(p, .04, .32));
        a.style.transform = `translateX(${(-vw * .22 * spread).toFixed(1)}px)`;
        b.style.transform = `translateX(${(vw * .22 * spread).toFixed(1)}px)`;
        const fade = (1 - seg(p, .12, .3)).toFixed(3);
        a.style.opacity = b.style.opacity = fade;
        const d = easeOut(seg(p, .4, .56));
        dark.style.opacity = d.toFixed(3);
        dark.style.transform = `translateY(${(30 * (1 - d)).toFixed(1)}px)`;
        dark.classList.toggle('live', d > .5);
        if (!counted && p > .46) { counted = true; countUp(cnts); }
      },
    };
  });

  // ⑤ 교시제 — 세로 스크롤을 가로 이동으로 (시간표 탭 전환 포함)
  const TT = {
    vac: {
      start: ['하루의 시작', '09:00', '입실 · 휴대폰 보관', '방학에는 오전 9시에 1교시를 시작합니다.'],
      rows: [['1교시', '09:00', '10:30'], ['2교시', '10:40', '12:10'], ['점심', '12:10', '13:20', 1], ['3교시', '13:20', '14:50'],
        ['4교시', '15:00', '16:30'], ['5교시', '16:40', '18:10'], ['저녁', '18:10', '19:20', 1], ['6–9교시', '19:20', '24:00']],
      end: ['하원', '24:00', '연중무휴 교시제', '밤 12시, 마지막 교시가 끝날 때까지 관리합니다.'],
    },
    sem: {
      start: ['하교 후', '16:00', '입실 · 휴대폰 보관', '학기 중에는 학교 끝나고 오면 바로 1교시입니다.'],
      rows: [['1교시', '16:00', '16:50'], ['2교시', '17:00', '17:50'], ['3교시', '18:00', '18:50'], ['4교시', '19:00', '19:50'],
        ['5교시', '20:00', '20:50'], ['6교시', '21:00', '21:50'], ['7교시', '22:00', '22:50'], ['8교시', '23:00', '24:00']],
      end: ['하원', '24:00', '평일 8교시', '평일에는 하교 후 자정까지 8교시로 운영합니다.'],
    },
  };
  const mins = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  function periodCards(key) {
    const d = TT[key];
    const edge = ([no, time, sub, lead]) =>
      `<div class="per-card edge"><span class="pc-no">${no}</span><p class="pc-lead">${lead}</p><p class="pc-time">${time}</p><p class="pc-end">${sub}</p></div>`;
    const DAY0 = 8 * 60, DAY = 16 * 60; // 08:00~24:00 기준 하루 막대
    const rows = d.rows.map(([no, s, e, meal]) => {
      const a = mins(s), b = mins(e);
      const left = ((a - DAY0) / DAY * 100).toFixed(1), w = ((b - a) / DAY * 100).toFixed(1);
      const tags = meal ? '<span>식사 · 휴식</span>' : '<span>출결 확인</span><span>20분 순찰</span>';
      return `<div class="per-card${meal ? ' meal' : ''}"><span class="pc-no">${no}</span><p class="pc-time">${s}</p>` +
        `<p class="pc-end">– ${e} · ${b - a}분</p><div class="pc-day"><i style="left:${left}%;width:${w}%"></i></div><div class="pc-tags">${tags}</div></div>`;
    }).join('');
    return edge(d.start) + rows + edge(d.end);
  }
  scene('periods', el => {
    const track = $('#perTrack'), bar = $('#perBar');
    let dist = 0;
    track.innerHTML = periodCards('vac');
    const measure = () => {
      dist = Math.max(0, track.scrollWidth - vw);
      if (!RM) el.style.height = `${vh + dist + vh * .35}px`;
    };
    $$('.per-tabs button', el).forEach(btn => btn.addEventListener('click', () => {
      $$('.per-tabs button', el).forEach(b => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      track.innerHTML = periodCards(btn.dataset.tt);
      measure();
      request();
    }));
    return {
      measure,
      rm() {},
      update(p) {
        const k = seg(p, .08, .92);
        track.style.transform = `translate3d(${(-dist * k).toFixed(1)}px,0,0)`;
        bar.style.width = `${(k * 100).toFixed(1)}%`;
      },
    };
  });

  // ⑥ 학습 공간 — 3×3 그리드에서 가운데 사진이 화면 전체로
  scene('space', el => {
    const grid = $('#spGrid'), tiles = $$('.sp-tile', grid), center = $('.sp-center', grid), cap = $('.sp-caption', el);
    let S = 3;
    const measure = () => { S = 1.02 * Math.max(vw / center.offsetWidth, vh / center.offsetHeight); };
    return {
      measure,
      rmP: 1,
      update(p) {
        const z = easeInOut(seg(p, .1, .6));
        const s = 1 + (S - 1) * z;
        grid.style.transform = `scale(${s.toFixed(4)})`;
        const fade = 1 - seg(z, 0, .5);
        tiles.forEach(t => {
          if (t === center) return;
          t.style.opacity = fade.toFixed(3);
          t.style.pointerEvents = fade < .2 ? 'none' : '';
        });
        center.style.borderRadius = `${(18 / s).toFixed(2)}px`;
        const c = easeOut(seg(p, .58, .78));
        el.style.setProperty('--spd', c.toFixed(3));
        cap.style.opacity = c.toFixed(3);
        cap.style.transform = `translateY(${(30 * (1 - c)).toFixed(1)}px)`;
        cap.classList.toggle('live', c > .5);
      },
    };
  });

  // ⑧ CLOSING — 작은 카드가 풀블리드로 열리며 상담 카피 등장
  scene('close', el => {
    const media = $('#closeMedia'), img = $('img', media), copy = $('.close-copy', el);
    return {
      rmP: 1,
      update(p) {
        const e = easeInOut(seg(p, 0, .5));
        const my = lerp(vh * .14, 0, e), mx = lerp(vw * (mobile() ? .05 : .16), 0, e);
        media.style.clipPath = `inset(${my.toFixed(1)}px ${mx.toFixed(1)}px round ${lerp(32, 0, e).toFixed(1)}px)`;
        img.style.transform = `scale(${lerp(1.18, 1, e).toFixed(4)})`;
        const c = easeOut(seg(p, .36, .6));
        copy.style.opacity = c.toFixed(3);
        copy.style.transform = `translateY(calc(-50% + ${(40 * (1 - c)).toFixed(1)}px))`;
        copy.classList.toggle('live', c > .5);
      },
    };
  });

  // ── 비-스티키 인터랙션: 스택 카드 · 3단계 라인 · 대표 사진 패럴랙스 ──
  const stackCards = $$('#stack .stack-card');
  let stackTops = [];
  const stack = $('#stack'), steps3 = $('#steps3'), steps3Items = steps3 ? $$('li', steps3) : [];
  const seenIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); seenIO.unobserve(e.target); } }), { threshold: .35 });
  stackCards.forEach(c => seenIO.observe(c));

  function updateExtras() {
    if (stack && inRange(stack) && !mobile()) {
      stackCards.forEach((c, i) => {
        const next = stackCards[i + 1];
        if (!next) return;
        const t = clamp(1 - (next.getBoundingClientRect().top - stackTops[i + 1]) / (vh * .75));
        c.style.transform = `scale(${(1 - .05 * t).toFixed(4)})`;
        c.style.filter = t > 0 ? `brightness(${(1 - .1 * t).toFixed(3)})` : '';
      });
    }
    if (steps3 && inRange(steps3)) {
      const r = steps3.getBoundingClientRect();
      const k = clamp((vh * .78 - r.top) / (r.height * .9));
      steps3.style.setProperty('--sp', k.toFixed(3));
      steps3Items.forEach((li, i) => li.classList.toggle('lit', k >= i / 2 - .02));
    }
  }

  // ── 좌측 레일 ──
  const rail = $('#bxRail');
  const railSecs = $$('[data-rail]');
  railSecs.forEach((s, i) => { if (!s.id) s.id = `sec-${i}`; });
  if (rail) {
    rail.innerHTML = railSecs.map(s => `<span class="rl"><i></i><b>${s.dataset.rail}</b></span>`).join('');
  }
  const railLinks = rail ? $$('.rl', rail) : [];
  let railOn = -1;
  function updateRail() {
    let k = 0;
    railSecs.forEach((s, i) => { if (s.getBoundingClientRect().top <= vh * .45) k = i; });
    if (k === railOn) return;
    railOn = k;
    railLinks.forEach((a, i) => a.classList.toggle('on', i === k));
  }

  // ── 메인 루프 ──
  // 가시성은 IntersectionObserver 대신 매 프레임 rect로 판정한다.
  // (앵커 점프처럼 한 번에 크게 스크롤하면 IO 콜백이 프레임보다 늦게 와서 씬이 초기 상태로 멈춤)
  const inRange = el => { const r = el.getBoundingClientRect(); return r.bottom > -vh * .25 && r.top < vh * 1.25; };

  let raf = 0;
  function frame() {
    raf = 0;
    if (!RM) scenes.forEach(s => { if (inRange(s.el)) s.update(progressOf(s.el)); });
    if (!RM) updateExtras();
    updateRail();
  }
  function request() { if (!raf) raf = requestAnimationFrame(frame); }

  function measureAll() {
    vw = innerWidth; vh = innerHeight;
    scenes.forEach(s => s.measure && s.measure());
    stackTops = stackCards.map(c => parseFloat(getComputedStyle(c).top) || 0);
    if (RM) scenes.forEach(s => (s.rm ? s.rm() : s.update(s.rmP ?? 1)));
    else scenes.forEach(s => s.update(progressOf(s.el)));
    request();
  }
  addEventListener('scroll', request, { passive: true });
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(measureAll, 80); });
  addEventListener('load', measureAll);
  measureAll();

})();
