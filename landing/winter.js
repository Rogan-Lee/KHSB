// ══ 2027 윈터스쿨 전용 동작 — recruit.html (bx-core.js · winter-data.js · vendor/rough-notation 다음) ══
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { esc, observeNew, voiceCard, gradeCard, flowRail, fitW } = window.KHSB;
  const root = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 고객사 확인 전 블록(confirmed: false)은 WINTER.showSamples 가 켜져 있으면 운영에서도 예시 안내와 함께 보인다.
  // 예약 현황 예시 · 카카오톡 채널 자리는 로컬에서만 보인다. ?live=1 이면 로컬에서도 운영과 같은 화면.
  const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const PREVIEW = IS_LOCAL && !new URLSearchParams(location.search).has('live');
  const ready = block => !!block && (block.confirmed || PREVIEW || WINTER.showSamples === true);
  const SAMPLE = '<em class="w-sample">확인 전 예시</em>';
  const sampleTag = block => (block.confirmed ? '' : SAMPLE);
  // 등장 · 글자 효과는 이 표시가 붙은 뒤에만 숨긴다 (스크립트가 실패하면 내용은 그대로 보인다)
  if (!RM) root.classList.add('w-fx');

  const svg = (d, w = 20, extra = 'fill="none" stroke="currentColor" stroke-width="2.2"') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" ${extra}>${d}</svg>`;
  const ICON = {
    prev: svg('<path d="M15 6l-6 6 6 6"/>'),
    next: svg('<path d="M9 6l6 6-6 6"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 15, 'fill="none" stroke="currentColor" stroke-width="2"'),
    phone: svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>', 19, 'fill="none" stroke="currentColor" stroke-width="2"'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16, 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'),
    // 카카오 공식 말풍선 심볼 (어드민 KakaoButton 과 같은 도형)
    kakao: svg('<path d="M12 3.2c-5.52 0-10 3.48-10 7.78 0 2.78 1.87 5.22 4.69 6.6l-.96 3.5c-.08.3.25.54.52.37l4.14-2.72c.53.06 1.07.09 1.61.09 5.52 0 10-3.49 10-7.8S17.52 3.2 12 3.2Z"/>', 19, 'aria-hidden="true" fill="currentColor"'),
  };

  // ── 플립 숫자판: 시험장 시계처럼 위 · 아래 판이 넘어간다 ──
  const half = (cls, ch) => { const b = document.createElement('b'); b.className = cls; b.innerHTML = `<i>${ch}</i>`; return b; };
  function flipTo(tile, ch) {
    const old = tile.dataset.v;
    if (old === ch) return;
    tile.dataset.v = ch;
    const [top, bot] = tile.children;
    $$('.ft, .fb', tile).forEach(n => n.remove());
    if (old === undefined || RM || document.hidden) { top.firstElementChild.textContent = bot.firstElementChild.textContent = ch; return; }
    bot.firstElementChild.textContent = old; // 아래 판은 넘어오는 판이 덮을 때까지 이전 숫자
    top.firstElementChild.textContent = ch;  // 위 판은 넘어가는 판 뒤에서 새 숫자로 대기
    const ft = half('t ft', old), fb = half('b fb', ch);
    tile.append(ft, fb);
    fb.addEventListener('animationend', () => { bot.firstElementChild.textContent = ch; ft.remove(); fb.remove(); }, { once: true });
  }
  function flipNumber(box, str) {
    while (box.children.length < str.length) box.insertAdjacentHTML('beforeend', '<span class="fl"><b class="t"><i></i></b><b class="b"><i></i></b></span>');
    while (box.children.length > str.length) box.lastElementChild.remove();
    [...box.children].forEach((tile, i) => flipTo(tile, str[i]));
  }
  // 한 줄 글자 교체(예약 현황): 새 줄이 아래에서 올라오고 이전 줄이 위로 빠진다
  function roll(slot, text) {
    if (slot.dataset.v === text) return;
    const first = slot.dataset.v === undefined;
    slot.dataset.v = text;
    $$('.out', slot).forEach(n => n.remove());
    const old = slot.firstElementChild;
    const cur = document.createElement('i');
    cur.textContent = text;
    if (!old || first || RM || document.hidden) { slot.replaceChildren(cur); return; }
    old.classList.add('out');
    slot.append(cur);
    cur.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2, .7, .2, 1)' });
    old.animate([{ transform: 'none' }, { transform: 'translateY(-100%)' }], { duration: 280, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'forwards' }).onfinish = () => old.remove();
  }

  // ── R6. 개강 카운트다운 — 히어로 · 등록 안내의 플립 시계, '개강까지' 칸, 아래 고정 바가 모두 같은 값 ──
  const T0 = new Date(WINTER.start).getTime();
  const pad = n => String(n).padStart(2, '0');
  const UNITS = [['d', '일'], ['h', '시간'], ['m', '분'], ['s', '초']];
  const clocks = $$('[data-clock]').map(el => {
    const kind = el.dataset.clock;
    if (kind !== 'facts') {
      $('.wc-digits', el).innerHTML = UNITS.map(([u, t]) => `<span class="wc-g ${u}"><span class="wc-n" data-u="${u}"></span><i>${t}</i></span>`).join('<span class="wc-sep" aria-hidden="true"><i></i><i></i></span>');
      el.hidden = false;
    }
    return { el, kind, n: Object.fromEntries($$('[data-u]', el).map(n => [n.dataset.u, n])) };
  });

  // 아래 고정 예약 바 — 히어로를 지나면 계속 따라온다 (이 페이지에서는 플로팅 버튼을 대신한다)
  document.body.insertAdjacentHTML('beforeend', `<aside class="w-bar" aria-label="2027 윈터스쿨 사전 예약">
  <div class="wb-info"><span class="wb-label">개강까지</span>
    <span class="wb-time" aria-hidden="true"><b data-wb="d">0</b><small>일</small><b data-wb="h">00</b>:<b data-wb="m">00</b>:<b data-wb="s">00</b><em data-cs>.00</em></span>
    <span class="wb-seat" data-wb-seat hidden></span></div>
  <a class="wb-tel" href="tel:${SITE.tel}" aria-label="전화 상담">${ICON.phone}</a>
  <a class="wb-go" href="${SITE.apply}" target="_blank" rel="noopener">온라인 사전 예약${ICON.arrow}</a></aside>`);
  const bar = $('.w-bar'), barLabel = $('.wb-label', bar), barTime = $('.wb-time', bar), barCs = $('[data-cs]', bar);
  const barN = Object.fromEntries($$('[data-wb]', bar).map(n => [n.dataset.wb, n]));
  if (RM) barCs.remove();

  let cdTimer = 0, csRaf = 0, started = false;
  const csActive = () => !RM && !document.hidden && !started && bar.classList.contains('on');
  function csLoop() {
    csRaf = 0;
    if (!csActive()) return;
    const t = `.${pad(Math.floor((Math.max(0, T0 - Date.now()) % 1000) / 10))}`;
    if (barCs.textContent !== t) barCs.textContent = t;
    csRaf = requestAnimationFrame(csLoop);
  }
  // 같은 예약 버튼이 화면에 이미 크게 보일 때(등록 안내 · 마지막 안내)는 바를 내려 둔다
  const ctaInView = new Set();
  const ctaIo = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) ctaInView.add(e.target); else ctaInView.delete(e.target); });
    syncBar();
  }, { threshold: .6 });
  $$('.wh-actions .btn-brand, .w-deadline .w-cta-bar, .ctab .ctab-actions, .gft-top').forEach(el => ctaIo.observe(el));
  function syncBar() {
    bar.classList.toggle('on', scrollY > 320 && ctaInView.size === 0);
    if (!csRaf && csActive()) csRaf = requestAnimationFrame(csLoop);
  }
  function tick() {
    const left = T0 - Date.now();
    if (left <= 0) {
      // 개강 이후 — 카운트다운 대신 진행 중 표시
      started = true;
      clocks.forEach(c => { if (c.kind === 'facts') c.el.textContent = '진행 중'; else c.el.hidden = true; });
      barLabel.textContent = '2027 윈터스쿨 진행 중';
      barTime.hidden = true;
      return;
    }
    const sec = Math.floor(left / 1000);
    const parts = { d: String(Math.floor(sec / 86400)), h: pad(Math.floor(sec / 3600) % 24), m: pad(Math.floor(sec / 60) % 60), s: pad(sec % 60) };
    clocks.forEach(c => {
      c.el.setAttribute('aria-label', `개강까지 ${parts.d}일 ${+parts.h}시간 남음`);
      if (c.kind === 'facts') c.el.innerHTML = `D-${parts.d}<small>${parts.h}시간 ${parts.m}분 ${parts.s}초</small>`;
      else for (const u in c.n) flipNumber(c.n[u], parts[u]);
    });
    for (const u in barN) barN[u].textContent = parts[u];
    cdTimer = setTimeout(tick, 1000 - (Date.now() % 1000) + 4);
  }
  tick();
  syncBar();
  addEventListener('scroll', syncBar, { passive: true });
  document.addEventListener('visibilitychange', () => { clearTimeout(cdTimer); if (!document.hidden) { tick(); syncBar(); } });

  // ── R7. 잔여 좌석 · 예약 현황 — 실제 신청 내역(API)만 쓴다. 없으면 "좌석 한정" 그대로 ──
  const MIN_RECENT = 3; // 이보다 적으면 굴릴 게 없어 예약 현황을 숨긴다
  const cleanStatus = d => ({
    remaining: d && Number.isInteger(d.remaining) && d.remaining >= 0 ? d.remaining : null,
    recent: ((d && Array.isArray(d.recent) && d.recent) || []).filter(n => /^[가-힣]○○$/.test(n)),
  });
  const hasStatus = s => s.remaining !== null || s.recent.length >= MIN_RECENT;
  function renderStatus(s, demo) {
    const rolling = s.recent.length >= MIN_RECENT;
    const count = s.remaining === null ? '좌석 한정' : s.remaining === 0 ? '정원 마감 · 대기 접수 중' : `잔여 좌석 <b>${s.remaining}</b>석`;
    const html = `<i class="ws-dot" aria-hidden="true"></i><span class="ws-count">${count}</span>` +
      (rolling ? '<i class="ws-div" aria-hidden="true"></i><span class="ws-roll" aria-live="off"></span>' : '') + (demo ? SAMPLE : '');
    // 히어로의 좌석 줄 · 등록 안내의 현황 줄 · 아래 고정 바
    $$('[data-seats], [data-seats-line]').forEach(el => { el.innerHTML = html; el.hidden = false; });
    if (s.remaining > 0) { const seat = $('[data-wb-seat]', bar); seat.textContent = `잔여 ${s.remaining}석`; seat.hidden = false; }
    if (!rolling) return;
    const slots = $$('.ws-roll');
    const label = n => `${n}님 예약 완료`;
    let i = 0;
    slots.forEach(slot => roll(slot, label(s.recent[0])));
    setInterval(() => {
      if (document.hidden) return;
      i = (i + 1) % s.recent.length;
      slots.forEach(slot => roll(slot, label(s.recent[i])));
    }, 2800);
  }
  if ($('[data-seats]')) {
    window.KHSB.api('/api/public/winter').catch(() => null).then(data => {
      let s = cleanStatus(data), demo = false;
      if (!hasStatus(s) && PREVIEW) { s = cleanStatus(WINTER.demoStatus); demo = true; }
      if (hasStatus(s)) renderStatus(s, demo);
    });
  }

  // ── 구획 이동: 좁은 화면은 위쪽 탭, 넓은 화면은 왼쪽 목차 — 지금 보고 있는 구획을 같이 표시한다 ──
  const tabs = $('.w-tabs-in');
  const navLinks = $$('.w-tabs-in a, .w-rail a');
  if (navLinks.length) {
    const setCurrent = id => navLinks.forEach(a => {
      const on = a.getAttribute('href') === `#${id}`;
      if (on === a.hasAttribute('aria-current')) return;
      a.toggleAttribute('aria-current', on);
      if (on && tabs && tabs.contains(a) && tabs.offsetParent) tabs.scrollTo({ left: a.offsetLeft - (tabs.clientWidth - a.offsetWidth) / 2, behavior: RM ? 'auto' : 'smooth' });
    });
    const secs = [...new Set(navLinks.map(a => a.getAttribute('href')))].map(h => $(h)).filter(Boolean);
    const spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setCurrent(e.target.id); }), { rootMargin: '-40% 0px -55% 0px' });
    secs.forEach(sec => spy.observe(sec));
    // 첫 구획보다 위에 있으면 아무것도 표시하지 않는다
    addEventListener('scroll', () => { if (secs[0] && secs[0].getBoundingClientRect().top > innerHeight * .6) setCurrent(''); }, { passive: true });
    // 누르면 구획 머리말이 메뉴 바로 아래에 오도록 맞춰 내려간다 (구획 위 여백만큼 덜 내려가지 않게)
    navLinks.forEach(a => a.addEventListener('click', e => {
      const sec = $(a.getAttribute('href'));
      if (!sec) return;
      e.preventDefault();
      const pad = sec.matches('.bx-sec') ? parseFloat(getComputedStyle(sec).paddingTop) : 0;
      const tabsH = tabs && tabs.offsetParent ? tabs.parentElement.offsetHeight : 0;
      scrollTo({ top: sec.getBoundingClientRect().top + scrollY + pad - (tabsH + 96), behavior: RM ? 'auto' : 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    }));
  }

  // ── 가로 레일: 이전/다음 버튼, 넘칠 때만 버튼 노출 (흐르는 줄일 때는 숨긴다) ──
  function wireRail(rail, ctl) {
    if (!ctl) return () => {};
    const [prev, next] = $$('button', ctl);
    const step = () => (rail.firstElementChild ? rail.firstElementChild.getBoundingClientRect().width + (parseFloat(getComputedStyle(rail).columnGap) || 0) : 300);
    const sync = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      ctl.hidden = max < 8 || rail.classList.contains('is-flow');
      prev.disabled = rail.scrollLeft < 8;
      next.disabled = rail.scrollLeft > max - 8;
    };
    prev.addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: RM ? 'auto' : 'smooth' }));
    next.addEventListener('click', () => rail.scrollBy({ left: step(), behavior: RM ? 'auto' : 'smooth' }));
    rail.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync);
    sync();
    return sync;
  }

  // ── R10 · R11. 등급 향상(검정 면) · 재원생 설문 · 학부모 후기(주황 면) ──
  // 등급 카드 · 후기 카드 · 흐르는 줄은 메인과 같은 공용 조각이다 (bx-core.js voiceCard · gradeCard · flowRail). 설문 카드만 이 페이지 것.
  const surveyCard = h => `<figure class="hs" style="--cw:${fitW(h.a.length, 168, 4.6, 320, 480)}px"><p class="hs-q"><b>Q</b>${esc(h.q)}</p><blockquote class="hs-a">${esc(h.a)}</blockquote><figcaption class="hs-who">${esc(h.who)}</figcaption></figure>`;
  const parentCard = p => voiceCard({ ...p, text: p.body });
  const br = s => esc(s).replace(/&lt;br&gt;/g, '<br>'); // 데이터의 <br> 만 줄바꿈으로 허용
  const proof = $('[data-w-proof]');
  if (proof) {
    const blocks = [
      // masked: 실제 자료일 때 줄 아래에 붙는 안내 / sample: 예시일 때 붙는 안내 (예시라는 말은 실제 자료로 바꾸기 전에는 빼지 않는다)
      { data: WINTER.gradeImprovements, tone: 'night', kicker: '성적 상승', title: '등급으로 확인한<br>변화입니다.', card: gradeCard, label: '등급 향상 사례',
        masked: '개인정보 보호를 위해 이름은 가렸습니다.', sample: '개인정보 보호를 위해 이름은 가렸으며, 화면의 성적 사례는 예시입니다.' },
      { data: WINTER.habitSurveys, tone: 'paper', kicker: '습관 형성', title: '재원생이 직접 답한<br>설문입니다.', card: surveyCard, label: '재원생 설문',
        masked: '', sample: '화면의 설문 응답은 예시입니다.' },
      { data: WINTER.parentReviews, tone: 'brand', kicker: '학부모 후기', title: '학부모님이 보내 주신<br>후기입니다.', card: parentCard, label: '학부모 후기', cta: true,
        masked: '개인정보 보호를 위해 이름은 가렸습니다.', sample: '개인정보 보호를 위해 이름은 가렸으며, 화면의 후기는 예시입니다.' },
    ].filter(b => ready(b.data) && b.data.items.length);
    if (blocks.length) {
      // 줄 아래 안내: 예시면 예시 안내, 실제 자료면 이름 가림 안내 + 자료에 딸린 각주(비교 기준 시험 등)
      const foot = b => (b.data.confirmed ? [b.masked, b.data.note].filter(Boolean).join(' ') : b.sample);
      proof.innerHTML = blocks.map(b => `<div class="wp-band ${b.tone}"><div class="wp-head"><p class="w-label">${b.kicker}</p><h3>${b.title}</h3></div>` +
        `<div class="wp-rail vrail" tabindex="0" role="group" aria-label="${b.label}">${b.data.items.map(g => b.card(g)).join('')}</div>` +
        `<div class="wp-ctl" hidden><button type="button" aria-label="이전 ${b.label}">${ICON.prev}</button><button type="button" aria-label="다음 ${b.label}">${ICON.next}</button></div>` +
        (foot(b) ? `<p class="wp-foot">* ${esc(foot(b))}</p>` : '') +
        (b.cta ? `<a class="btn btn-dark w-cta-bar" href="${SITE.apply}" target="_blank" rel="noopener">온라인 사전 예약${ICON.arrow}</a>` : '') + '</div>').join('');
      proof.hidden = false;
      // 줄마다 반대 방향으로 흐른다 (첫 줄은 왼쪽으로)
      $$('.wp-band', proof).forEach((el, i) => { const rail = $('.wp-rail', el); flowRail(rail, i % 2 ? -1 : 1, wireRail(rail, $('.wp-ctl', el))); });
      $$('.w-cta-bar', proof).forEach(el => ctaIo.observe(el)); // 후기 아래 예약 버튼이 보이는 동안에도 아래 바는 내려 둔다
      // 새 카드가 기존 '성적 상승 · 습관 형성' 후기 두 장을 대신한다
      const old = $('[data-w-fallback]');
      if (old && ready(WINTER.gradeImprovements) && ready(WINTER.habitSurveys)) old.hidden = true;
      observeNew(proof);
    }
  }

  // ── QR 모양 예시 무늬 — 실제 QR 인코딩이 아니라 스캔되지 않는다 (예시 화면용) ──
  function fauxQr(seed) {
    const N = 21;
    let s = (seed * 7919 + 104729) % 233280;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    let d = '';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x >= N - 7 ? x - (N - 7) : x, fy = y >= N - 7 ? y - (N - 7) : y;
      const inFinder = (x < 7 || x >= N - 7) && (y < 7 || y >= N - 7) && !(x >= N - 7 && y >= N - 7);
      const nearFinder = (x < 8 || x >= N - 8) && (y < 8 || y >= N - 8) && !(x >= N - 8 && y >= N - 8);
      const on = inFinder ? Math.max(Math.abs(fx - 3), Math.abs(fy - 3)) !== 2
        : nearFinder ? false
          : x === 6 || y === 6 ? (x + y) % 2 === 0 : rnd() > .5;
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
    return `<svg width="84" height="84" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
  }

  // ── R5. 밀착 학습 관리 — 시간표 · 좌석 · 순찰 · QR 기록을 누르지 않아도 보이게 구획 안에 펼쳐 둔다 ──
  const F = WINTER.focus;
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
  const cares = $('[data-cares]');
  if (cares) {
    const rows = F.time.blocks.flatMap(b => b.rows), D0 = toMin(rows[0][1]), D1 = toMin(rows[rows.length - 1][2]);
    const pct = m => (((m - D0) / (D1 - D0)) * 100).toFixed(3);
    const head = (n, f) => `<header class="wm-head"><p class="wm-k"><b>0${n}</b>${esc(f.label)}</p><h3>${br(f.title)}</h3><p class="wm-sub">${esc(f.sub)}</p></header>`;
    // 01 시간표: 하루 막대 위에 지금 시각을 찍고, 아래에 오전 · 오후 · 야간 교시를 모두 적는다
    // 식사 칸은 앞뒤 교시와 시간이 맞닿아 있어 그대로 그리면 붙어 보인다 → 쉬는 시간(교시 사이 간격)만큼 양쪽을 들여 다른 칸과 같은 간격을 둔다
    const BREAK = toMin(rows[1][1]) - toMin(rows[0][2]);
    const span = r => { const g = r[3] ? BREAK : 0; return `left:${pct(toMin(r[1]) + g)}%;width:${pct(toMin(r[2]) - toMin(r[1]) - g * 2 + D0)}%`; };
    const time = `<p class="wd-now"></p>` +
      `<div class="wd-bar" aria-hidden="true">${rows.map(r => `<span class="wd-b${r[3] ? ' meal' : ''}" style="${span(r)}"><b>${esc(r[3] ? r[0] : r[0].replace('교시', ''))}</b></span>`).join('')}<i class="wd-needle" hidden><em></em></i></div>` +
      `<div class="wd-axis" aria-hidden="true">${[9, 12, 15, 18, 21, 24].map(h => `<span style="left:${pct(h * 60)}%">${pad(h)}:00</span>`).join('')}</div>` +
      `<div class="wd-cols">${F.time.blocks.map(b => `<div class="wd-col"><h4>${esc(b.name)}<span>${b.rows[0][1]} – ${b.rows[b.rows.length - 1][2]}</span></h4>` +
        `<ol>${b.rows.map(r => `<li${r[3] ? ' class="meal"' : ''}><b>${esc(r[0])}</b><span>${r[1]} – ${r[2]}</span><em>${toMin(r[2]) - toMin(r[1])}분</em></li>`).join('')}</ol></div>`).join('')}</div>`;
    // 02 좌석: 학습 공간 페이지와 같은 사진
    const seat = `<div class="wm-seats">${F.seat.cards.map(c => `<figure class="wm-seat"><div class="wm-ph"><img src="${esc(c.photo)}" alt="${esc(c.name)}" loading="lazy"></div>` +
      `<figcaption><b>${esc(c.name)}</b><p>${esc(c.desc)}</p><div class="wf-chips">${c.chips.map(t => `<span>${esc(t)}</span>`).join('')}</div></figcaption></figure>`).join('')}</div>`;
    // 03 순찰: 관리자 '순찰 관리' 화면 구성. 화면에 들어오면 기록이 한 줄씩 적히듯 나타난다 (--k 순서)
    let k = 0;
    const patrol = `<div class="wm-ui"><div class="wm-ui-h"><b>순찰 기록</b><span>${esc(F.patrol.note)}</span></div><ol class="wm-log">${F.patrol.rounds.map(r =>
      `<li class="rd" style="--k:${k++}"><span class="wf-pt-time">${ICON.clock}${esc(r.time)}</span><em class="wf-tag">점검 ${r.checked}</em><em class="wf-tag warn">특이 ${r.items.length}</em></li>` +
      r.items.map(it => `<li style="--k:${k++}"><b>${esc(it.seat)}</b><span>${esc(it.name)}</span><em class="wf-tag warn">특이사항</em><p>${esc(it.note)}</p></li>`).join('') +
      `<li class="rest" style="--k:${k++}"><span>그 외 ${r.checked - r.items.length}명</span><em class="wf-tag ok">양호</em></li>`).join('')}</ol></div>`;
    // 04 QR: 스캔 → 상태 선택 → 유형 선택 → 기록, 실제 순찰 화면의 순서를 되풀이해 보여 주고, 그 기록이 실리는 리포트를 붙인다
    const q = F.qr, who = q.seats[0];
    const qr = `<div class="wm-ui">` + (q.photo ? `<div class="wf-photo"><img src="${esc(q.photo.src)}" alt="${esc(q.photo.caption)}" loading="lazy"></div>` : '') +
      `<div class="wm-ui-h"><b>순찰 점검</b><span>${esc(q.note)}</span></div>` +
      `<div class="wf-scan wf-demo"><div class="wf-scan-who"><span class="wf-scan-qr">${fauxQr(1)}</span><div><b>${esc(who.name)}</b><span>좌석 ${esc(who.seat)} · ${esc(who.grade)}</span></div></div>` +
      `<div class="wf-seg">${q.statuses.map((t, i) => `<span${i === 1 ? ' class="pick"' : ''}>${esc(t)}</span>`).join('')}</div><div class="wf-presets">${q.presets.map((t, i) => `<span${i === 0 ? ' class="pick"' : ''}>${esc(t)}</span>`).join('')}</div>` +
      `<p class="wf-save"><span>점검 기록</span><span>${ICON.check}기록 완료</span></p></div>` +
      `<p class="wm-cap">기록은 학부모님 월간 리포트에 그대로 실립니다.</p>` +
      `<ul class="wf-rep"><li class="h"><b>순찰 점검</b><span>자습 시간 순찰에서 확인한 내용이에요</span></li>${q.report.map(r => `<li><em>${esc(r.date)}</em>${esc(r.note)}</li>`).join('')}</ul></div>`;
    cares.innerHTML = [[F.time, time, 'wide'], [F.seat, seat, 'wide'], [F.patrol, patrol, ''], [F.qr, qr, '']]
      .map(([f, body, cls], i) => `<article class="w-care ${cls} r${i === 3 ? ' d1' : ''}">${head(i + 1, f)}<div class="wm-body">${body}</div></article>`).join('');

    // 지금 시각(한국 시각) 표시 — 30초마다 다시 그린다
    const nowText = $('.wd-now', cares), needle = $('.wd-needle', cares), bars = $$('.wd-b', cares), lis = $$('.wd-col li', cares);
    const paint = () => {
      const kst = new Date(Date.now() + 9 * 3600e3);
      const m = kst.getUTCHours() * 60 + kst.getUTCMinutes();
      const inDay = m >= D0 && m < D1;
      const at = rows.findIndex(r => m >= toMin(r[1]) && m < toMin(r[2]));
      const row = rows[at];
      const what = !inDay ? '' : row ? (row[3] ? `${row[0]} 시간` : row[0]) : '쉬는 시간';
      nowText.innerHTML = inDay ? `윈터스쿨 시간표로는 지금 <b>${esc(what)}</b>입니다.` : `윈터스쿨의 하루는 <b>${rows[0][1]}</b>에 시작해 <b>${rows[rows.length - 1][2]}</b>에 끝납니다.`;
      needle.hidden = !inDay;
      if (inDay) { needle.style.left = `${pct(m)}%`; needle.firstElementChild.textContent = `지금 ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`; }
      [bars, lis].forEach(list => list.forEach((el, i) => el.classList.toggle('now', inDay && i === at)));
    };
    paint();
    setInterval(() => { if (!document.hidden) paint(); }, 30000);
  }

  // ── R3 · R4. 전화 상담 가능 시간 · 관리자 상주 시간 · 카카오톡 채널 — 자주 묻는 질문 아래 ──
  // 윗줄: 시간 카드 두 장(학기 중 · 방학 × 평일 · 주말 · 공휴일 표) · 아랫줄: 카카오톡 채널
  const contact = $('[data-w-contact]');
  const hoursSlot = $('[data-w-hours]');
  if (hoursSlot && ready(WINTER.callHours)) {
    const h = WINTER.callHours;
    hoursSlot.innerHTML = `<div class="wh-grid">${h.groups.map(g => `<div class="w-hours"><div class="wh-top"><p class="w-label">${esc(g.title)}</p>${sampleTag(h)}</div>` +
      // 줄 = 학기 중 · 방학, 열 = 평일 · 주말 · 공휴일 (긴 이름이 열 머리에 오도록)
      `<table class="wh-t"><thead><tr><td></td>${g.rows.map(r => `<th scope="col">${esc(r.label)}</th>`).join('')}</tr></thead>` +
      `<tbody>${h.seasons.map((season, i) => `<tr><th scope="row">${esc(season)}</th>${g.rows.map(r => `<td>${esc(r.times[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>` +
      (g.away && g.away.length ? `<p class="wh-meal"><b>${g.away.map(esc).join(' · ')}</b>${esc(g.awayText || '')}</p>` : '') +
      (g.call ? `<a class="btn btn-brand" href="tel:${SITE.tel}">${ICON.phone}전화 상담하기</a>` : '') + '</div>').join('')}</div>`;
  }

  // 카카오톡 채널 추가 — 모바일은 버튼(카카오톡 앱으로 이동), PC 는 QR 을 함께 보여 준다
  const kakaoSlot = $('[data-w-kakao]');
  const channelId = WINTER.kakao.channelId.trim();
  if (kakaoSlot && (channelId || PREVIEW)) {
    const url = channelId ? `https://pf.kakao.com/${encodeURIComponent(channelId)}/friend` : '#faq';
    const chName = WINTER.kakao.name ? `<p class="wk-name">채널 이름 <b>${esc(WINTER.kakao.name)}</b></p>` : '';
    kakaoSlot.innerHTML = `<div class="w-kakao"><div class="wk-txt"><div class="wh-top"><p class="w-label">카카오톡 채널</p>${channelId ? '' : SAMPLE}</div>` +
      `<p class="wk-big">채널을 추가하고<br>채팅으로 물어보셔도 됩니다.</p>${chName}</div>` +
      `<div class="wk-qr" data-wk-qr hidden><span>휴대폰으로 스캔</span></div>` +
      `<a class="wk-btn" href="${url}"${channelId ? ' target="_blank" rel="noopener"' : ''}>${ICON.kakao}카카오톡 채널 추가</a></div>`;
    // PC 에서만 QR 을 만든다 (QR 생성기는 필요할 때 한 번 내려받는다). 채널 ID 가 없으면 로컬 미리보기용 예시 무늬.
    const qrBox = $('[data-wk-qr]', kakaoSlot);
    const showQr = html => { qrBox.insertAdjacentHTML('afterbegin', html); qrBox.hidden = false; };
    if (matchMedia('(min-width: 861px)').matches) {
      if (!channelId) showQr(fauxQr(7));
      else {
        const lib = document.createElement('script');
        lib.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
        lib.onload = () => {
          const qr = window.qrcode(0, 'M');
          qr.addData(url);
          qr.make();
          showQr(qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }));
        };
        document.head.append(lib);
      }
    }
  }
  // 채워지지 않은 칸은 빼고, 둘 다 없으면 줄 자체를 숨긴다 (운영에서 값이 확정되기 전)
  if (contact) {
    [hoursSlot, kakaoSlot].forEach(el => { if (el && !el.firstElementChild) el.remove(); });
    contact.hidden = !contact.firstElementChild;
  }

  // ── 전용 앱: 핵심 기능을 폰 한 대에서 차례로 넘겨 보여 준다 (화면 교체 자체는 bx-core.js [data-fx]) ──
  // 진행 줄(CSS 애니메이션)이 다 차면 다음 기능으로 넘어간다. 마우스를 올리면 멈추고, 직접 고르면 자동 넘김을 끝낸다.
  const appFx = $('[data-fx-auto]');
  if (appFx && !RM) {
    const items = $$('.fx-item', appFx);
    let auto = false, done = false;
    appFx.addEventListener('animationend', e => {
      if (e.animationName !== 'wfx-prog' || done) return;
      const at = items.findIndex(it => it.classList.contains('on'));
      auto = true;
      items[(at + 1) % items.length].click();
      auto = false;
    });
    items.forEach(it => it.addEventListener('click', () => { if (!auto) { done = true; appFx.classList.remove('w-run'); } }));
    appFx.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') appFx.classList.add('w-hold'); });
    appFx.addEventListener('pointerleave', () => appFx.classList.remove('w-hold'));
    new IntersectionObserver(es => { if (!done) appFx.classList.toggle('w-run', es[es.length - 1].isIntersecting); }, { threshold: .5 }).observe($('.fx-stage', appFx));
    // 좁은 화면의 가로 탭: 고른 기능이 보이도록 탭 줄을 옮긴다
    const list = $('.fx-list', appFx);
    new MutationObserver(() => {
      const on = items.find(it => it.classList.contains('on'));
      if (on && list.scrollWidth > list.clientWidth) list.scrollTo({ left: on.offsetLeft - (list.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
    }).observe(list, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  // ══ 움직임 — 값은 토스 소개 페이지(toss.im/business/shopping, /service/public-civil) 코드에서 읽어 옮긴 것 ══
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();

  // ── 손표시: 선생님이 펜으로 긋듯 밑줄 · 형광펜을 그린다 (Rough Notation, MIT — vendor/README.txt) ──
  // 라이브러리가 없으면 표시만 빠지고 글은 그대로 보인다.
  const MARK = {
    underline: { type: 'underline', color: '#ff6600', strokeWidth: 3, padding: 2, iterations: 2 },
    highlight: { type: 'highlight', color: '#ffd2b6', padding: [2, 6], iterations: 1, multiline: true },
    circle: { type: 'circle', color: '#ff6600', strokeWidth: 2.5, padding: 8 },
  };
  function drawMark(el, delay) {
    if (!window.RoughNotation || el.dataset.drawn) return;
    el.dataset.drawn = '1';
    // 글꼴이 바뀌면 글자 폭이 달라지므로 글꼴을 다 받은 뒤에 긋는다
    setTimeout(() => fontsReady.then(() => window.RoughNotation.annotate(el, { ...MARK[el.dataset.mark], animate: !RM, animationDuration: 700 }).show()), delay);
  }

  // ── 글자 쪼개기: 낱말을 줄바꿈 단위(inline-block)로 묶고 그 안의 글자를 하나씩 감싼다. <br> · <em> · [data-mark] 는 그대로 둔다 ──
  function splitChars(el) {
    const chars = [];
    let lastW = null; // 바로 앞 낱말 묶음 (뒤에 공백이 없었다면 다음 글자와 붙어 있어야 한다)
    const charSpan = (c, cls) => {
      const sp = document.createElement('span');
      sp.className = cls;
      sp.textContent = c;
      sp.style.setProperty('--i', chars.length);
      chars.push(sp);
      return sp;
    };
    const walk = node => [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 1) { if (ch.tagName === 'BR') lastW = null; else walk(ch); return; }
      if (ch.nodeType !== 3) return;
      if (!ch.nodeValue.trim()) { lastW = null; return; }
      const frag = document.createDocumentFragment();
      const toks = ch.nodeValue.split(/(\s+)/);
      toks.forEach((tok, i) => {
        if (!tok) return;
        if (!tok.trim()) { if (i <= 1 && !toks[0]) { frag.append(' '); lastW = null; } return; } // 맨 앞 공백만 따로 두고, 낱말 뒤 공백은 그 낱말 묶음 안에 넣는다
        const spaceAfter = toks[i + 1] !== undefined && toks[i + 1] !== '';
        // 강조(<em>) 바로 뒤에 붙은 조사('15시간' + '을')는 앞 낱말 묶음에 넣어 줄이 그 사이에서 갈리지 않게 한다.
        // 색은 .x 로 바깥 글자색을 되돌린다. 손표시([data-mark]) 안으로는 넣지 않는다 (표시가 조사까지 늘어나므로).
        if (i === 0 && lastW && !lastW.closest('[data-mark]')) {
          [...tok].forEach(c => lastW.append(charSpan(c, 'c x')));
          if (spaceAfter) { lastW.append(' '); lastW = null; }
          return;
        }
        const w = document.createElement('span');
        w.className = 'w';
        [...tok].forEach(c => w.append(charSpan(c, 'c')));
        if (spaceAfter) w.append(' ');
        frag.append(w);
        lastW = spaceAfter ? null : w;
      });
      ch.replaceWith(frag);
    });
    walk(el);
    return chars;
  }

  // ── 구획 제목: 글자마다 흐림 3px → 또렷하게, 0.05초 간격 (제목이 절반쯤 보일 때 시작) ──
  // 화면 낭독기는 쪼갠 글자 대신 aria-label 의 온전한 문장을 읽는다.
  const heads = RM ? [] : $$('.w-main .bx-h2');
  heads.forEach(h => {
    h.setAttribute('aria-label', h.innerText.replace(/\s+/g, ' ').trim());
    const inner = document.createElement('span');
    inner.setAttribute('aria-hidden', 'true');
    inner.append(...h.childNodes);
    h.append(inner);
    splitChars(inner);
    h.classList.add('w-chars');
  });
  function go(h) {
    h.classList.add('w-go');
    // 손표시는 그 글자가 다 나타난 뒤에
    $$('[data-mark]', h).forEach(m => {
      const last = $$('.c', m).pop();
      drawMark(m, 200 + (last ? +last.style.getPropertyValue('--i') : 0) * 50 + 450);
    });
  }

  // ── 스크롤로 들어올 때: 절반이 보이면 80px(카드는 40px) 아래에서 .6초에 올라온다 ──
  // 키가 화면보다 큰 묶음은 화면의 30%만큼 보이면 시작한다. 화면 아래로 다시 빠지면 되돌려 두어, 내려올 때 다시 보인다.
  if (RM) {
    // 움직임 줄이기: 등장 없이, 손표시만 화면에 들어올 때 바로 그린다
    const mio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { mio.unobserve(e.target); drawMark(e.target, 150); } }), { threshold: .9 });
    $$('[data-mark]').forEach(el => mio.observe(el));
  } else {
    const headsIn = el => (el.matches('.w-chars') ? [el] : $$('.w-chars', el));
    const fxIo = new IntersectionObserver(es => es.forEach(e => {
      const el = e.target, box = e.boundingClientRect;
      if (e.isIntersecting && e.intersectionRect.height >= Math.min(box.height * .5, innerHeight * .3)) {
        if (el.classList.contains('w-on')) return;
        el.classList.add('w-on');
        headsIn(el).forEach(go);
      } else if (!e.isIntersecting && box.top > innerHeight * .5) {
        el.classList.remove('w-on');
        headsIn(el).forEach(h => h.classList.remove('w-go'));
      }
    }), { threshold: Array.from({ length: 11 }, (_, i) => i * .05) });
    const watch = scope => $$('.r', scope).forEach(el => fxIo.observe(el));
    watch(document);
    heads.filter(h => !h.closest('.r')).forEach(h => fxIo.observe(h));
    // 나중에 채워지는 내용(앱 화면 · 대학 로고 등)에 붙은 .r 도 같은 방식으로
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(nd => {
      if (nd.nodeType !== 1 || nd.classList.contains('c') || nd.classList.contains('w')) return;
      if (nd.matches('.r')) fxIo.observe(nd);
      watch(nd);
    }))).observe($('#main'), { childList: true, subtree: true });

    // ── 스크롤에 맞춘 움직임: 소개 문장 · 사진 시차 (한 프레임에 한 번만 계산) ──
    // cubic-bezier 를 숫자로 풀기 (x → y)
    const bezier = (x1, y1, x2, y2) => {
      const at = (a, b, t) => (((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t + 3 * a) * t;
      return x => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let lo = 0, hi = 1, t = x;
        for (let i = 0; i < 22; i++) { t = (lo + hi) / 2; if (at(x1, x2, t) < x) lo = t; else hi = t; }
        return at(y1, y2, t);
      };
    };
    const jobs = [];
    let raf = 0;
    const frame = () => { raf = 0; jobs.forEach(j => { if (j.on) j.paint(); }); };
    const queue = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const addJob = (el, paint, rootMargin) => {
      const job = { on: false, paint };
      new IntersectionObserver(es => { job.on = es[es.length - 1].isIntersecting; if (job.on) queue(); }, { rootMargin }).observe(el);
      jobs.push(job);
    };

    // 소개 문장: 글자 i 의 위치 s = (문장 위쪽 + 간격 × (i − n/2)) ÷ 화면 높이. s 가 1 → .5 로 줄어드는 동안
    // 투명 · 흐림 1px · 20px 위에서 제자리로 온다. 곡선은 cubic-bezier(.44, 0, .56, 1).
    const say = $('[data-say]');
    if (say) {
      const full = document.createElement('span');
      full.className = 'w-sr';
      full.textContent = say.textContent;
      const inner = document.createElement('span');
      inner.setAttribute('aria-hidden', 'true');
      inner.append(...say.childNodes);
      say.append(full, inner);
      const chars = splitChars(inner), n = chars.length, ease = bezier(.44, 0, .56, 1);
      let lastTop = null, lastVh = 0;
      const paint = () => {
        const top = say.getBoundingClientRect().top, vh = innerHeight;
        if (top === lastTop && vh === lastVh) return;
        lastTop = top; lastVh = vh;
        // 글자 사이 간격은 15px. 문장이 길어 끝 글자가 화면 위로 넘어간 뒤에야 나타나는 일이 없게 화면 높이에 맞춰 줄인다
        const gap = Math.min(15, (vh * .7) / n);
        chars.forEach((c, i) => {
          const pos = (top + gap * (i - n / 2)) / vh;
          const p = ease(Math.max(0, Math.min(1, (1 - pos) / .5)));
          if (c._p === p) return;
          c._p = p;
          c.style.opacity = p;
          c.style.filter = p < 1 ? `blur(${(1 - p).toFixed(2)}px)` : '';
          c.style.transform = p < 1 ? `translateY(${(-20 * (1 - p)).toFixed(1)}px)` : '';
        });
      };
      paint();
      addJob(say, paint, '80% 0px');
    }

    // 사진 시차: 사진을 칸 높이의 25%(40~480px)만큼 키우고, 칸이 화면을 지나는 동안 그만큼 위에서 아래로 옮긴다
    $$('[data-parallax]').forEach(box => {
      const img = $('img', box);
      if (!img) return;
      const rate = Math.max(5, Math.min(60, +box.dataset.parallax || 25)) / 100;
      const paint = () => {
        const r = box.getBoundingClientRect(), h = r.height;
        if (!h) return;
        const room = Math.max(40, Math.min(480, h * rate));
        const prog = Math.max(0, Math.min(1, (innerHeight - r.top) / (innerHeight + h)));
        img.style.transform = `translate3d(0, ${((prog - .5) * room).toFixed(1)}px, 0) scale(${(1 + room / h).toFixed(4)})`;
      };
      paint();
      addJob(box, paint, '20% 0px');
    });
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
  }

  // ── 버튼 화살표를 두 장으로 감싼다: 올리면 오른쪽으로 빠지고 왼쪽에서 새로 들어온다 ──
  $$('a > svg').forEach(v => {
    const d = v.firstElementChild && v.firstElementChild.getAttribute('d');
    if (d !== 'M5 12h14M13 6l6 6-6 6') return;
    const box = document.createElement('span');
    box.className = 'w-arr';
    box.setAttribute('aria-hidden', 'true');
    v.replaceWith(box);
    box.append(v, v.cloneNode(true));
  });

  // ── 로컬 미리보기 안내 ──
  if (IS_LOCAL) {
    const q = new URLSearchParams(location.search);
    if (PREVIEW) q.set('live', '1'); else q.delete('live');
    const qs = q.toString();
    document.body.insertAdjacentHTML('beforeend', `<div class="w-preview"><span>${PREVIEW ? '로컬 미리보기 · 확인 전 예시 포함' : '운영과 같은 화면'}</span><a href="${location.pathname}${qs ? `?${qs}` : ''}">${PREVIEW ? '운영 화면으로 보기' : '예시 포함해서 보기'}</a></div>`);
  }
})();
