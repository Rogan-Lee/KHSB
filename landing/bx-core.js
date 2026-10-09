// ══ 강한선배 BX 코어 동작 — 모든 페이지 공용 (body 끝, bx-data.js · bx-shell.js 이후) ══
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const root = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (RM) root.classList.add('bx-rm');
  let vw = innerWidth, vh = innerHeight;
  const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ── 콘텐츠 API (로컬 테스트: ?api=http://localhost:3000 → 세션 동안 유지) ──
  // 보안: API 오버라이드는 로컬에서 띄운 랜딩(localhost/127.0.0.1)에서만 허용.
  // 운영 도메인에서 허용하면 ?api=https://악성서버 링크로 bodyHtml 을 주입(DOM XSS)할 수 있다.
  const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const qApi = IS_LOCAL ? new URLSearchParams(location.search).get('api') : null;
  try { if (qApi) sessionStorage.setItem('khsbApi', qApi); } catch (e) { /* 저장 불가 환경 */ }
  let API = SITE.api;
  try { if (IS_LOCAL) API = sessionStorage.getItem('khsbApi') || SITE.api; } catch (e) { /* 기본값 */ }
  const TYPE_LABEL = { review: '후기', mentor: '선배 아티클', director: '원장 칼럼', podcast: '팟캐스트', article: '아티클' };
  const fmtDate = d => (d ? new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
  // 외부 링크는 http(s) 만 (javascript: 등 차단)
  const safeUrl = u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '#');
  const postHref = p => (p.hasBody || !p.url ? `article.html?id=${encodeURIComponent(p.id)}` : safeUrl(p.url));
  const isExternal = p => !(p.hasBody || !p.url);
  async function api(path) {
    const r = await fetch(API + path, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  // ── 푸터 + 플로팅 CTA ──
  if (!document.body.hasAttribute('data-no-footer')) {
    const col = (h, items) => `<div><p class="gft-h">${h}</p>${items.map(([t, u, ext]) => `<a href="${u}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`).join('')}</div>`;
    document.body.insertAdjacentHTML('beforeend', `
<footer class="gft">
  <div class="gft-top">
    <h2>혼자 두지 않는 독서실,<br>강한선배.</h2>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a class="btn btn-brand" href="${SITE.apply}" target="_blank" rel="noopener">무료 입회 상담${ARROW}</a>
      <a class="btn btn-line" href="tel:${SITE.tel}">전화 상담하기</a>
    </div>
  </div>
  <div class="gft-grid">
    <div class="gft-brand">
      <img src="brand/khsb-logo-white.png" alt="KHSB 강한선배">
      <p>최상위권 대학 선배들이 관리하는 동탄 관리형 독서실<br>${SITE.address}</p>
      <p style="margin-top:12px">강한선배는 매월 수익의 일부를 동물자유연대 · 유니세프 · 월드비전 · 한국소아암재단에 기부합니다.</p>
    </div>
    ${col('강한선배', [['강한선배 소개', 'director.html'], ['관리 시스템', 'program.html'], ['합격 결과', 'results.html'], ['선배 멘토진', 'mentors.html'], ['학습 공간', 'space.html']])}
    ${col('강한 이야기', [['후기', 'stories.html?type=review'], ['선배 아티클', 'stories.html?type=mentor'], ['원장 칼럼', 'stories.html?type=director'], ['전체 보기', 'stories.html']])}
    ${col('모집 · 문의', [['2027 윈터스쿨', 'recruit.html'], ['무료 입회 상담', SITE.apply, 1], ['전화 상담', 'tel:' + SITE.tel], ['Instagram', '#', 1], ['YouTube', '#', 1]])}
  </div>
  <div class="gft-bottom"><span>© 2026 KHSB · 대표 강한지 · 사업자등록번호 678-93-01968</span><span class="gft-legal"><a href="privacy.html">개인정보처리방침</a><a href="support.html">앱 고객지원</a></span></div>
  <p class="gft-giant" aria-hidden="true">강한선배</p>
</footer>
<div class="fab-stack">
  <a href="tel:${SITE.tel}" class="fab fab-tel" aria-label="전화 문의"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span class="lbl">전화</span></a>
  <a href="${SITE.apply}" target="_blank" rel="noopener" class="fab fab-main" aria-label="입회 상담 신청"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg><span class="lbl">입회 상담</span></a>
</div>`);
  }

  // ── GNB: 다크 히어로 구간 · 스크롤 방향 숨김 · 모바일 드로어 ──
  const gnb = $('#gnb');
  const darkZone = $('[data-gnb-dark]');
  const burger = $('.gnb-burger');
  let lastY = scrollY;
  function darkEnd() {
    if (!darkZone) return -1;
    const r = darkZone.getBoundingClientRect();
    const sticky = darkZone.hasAttribute('data-gnb-sticky');
    return r.top + scrollY + darkZone.offsetHeight - (sticky ? vh : 0) - (sticky ? vh * .1 : 72);
  }
  function updateGnb() {
    if (!gnb) return;
    const y = scrollY;
    gnb.classList.toggle('is-dark', !!darkZone && y < darkEnd());
    if (!root.classList.contains('md-open') && !root.classList.contains('drawer-open')) {
      if (y > vh * .8 && y > lastY + 6) gnb.classList.add('hide');
      else if (y < lastY - 6 || y < vh * .8) gnb.classList.remove('hide');
    }
    lastY = y;
  }
  function setDrawer(open) {
    root.classList.toggle('drawer-open', open);
    if (burger) { burger.setAttribute('aria-expanded', open); burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); }
  }
  if (burger) burger.addEventListener('click', () => setDrawer(!root.classList.contains('drawer-open')));
  addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('drawer-open')) setDrawer(false); });
  $$('#gnbDrawer a').forEach(a => a.addEventListener('click', () => setDrawer(false)));
  addEventListener('resize', () => { if (innerWidth > 1120) setDrawer(false); });

  // ── 등장 모션 (.r → .in) · 카운트업 ──
  const fmtNum = (v, dec) => v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  function countUp(el) {
    const to = parseFloat(el.dataset.count), dec = parseInt(el.dataset.dec || '0', 10);
    if (RM) { el.textContent = fmtNum(to, dec); return; }
    const t0 = performance.now(), D = 1500;
    const tick = t => {
      const k = Math.min((t - t0) / D, 1);
      el.textContent = fmtNum(to * (1 - Math.pow(1 - k, 3)), dec);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // data-stat="reenroll" → bx-data.js STATS 값으로 숫자·단위 채움
  $$('[data-stat]').forEach(el => {
    const s = STATS[el.dataset.stat];
    if (!s) return;
    el.innerHTML = `<span data-count="${s.value}" data-dec="${s.dec || 0}">0</span><i>${s.unit}</i>`;
  });
  const revealIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    revealIO.unobserve(e.target);
  }), { threshold: .08, rootMargin: '0px 0px -40px 0px' });
  const countIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    countUp(e.target);
    countIO.unobserve(e.target);
  }), { threshold: .5 });
  function observeNew(scope = document) {
    $$('.r:not(.in)', scope).forEach(el => revealIO.observe(el));
    $$('[data-count]:not([data-manual])', scope).forEach(el => countIO.observe(el));
  }

  // ── 대학 로고: 빈틈 없는 마퀴 · 로고 월 ──
  const logoTile = (u, hidden) => `<div class="lmq-tile"${hidden ? ' aria-hidden="true"' : ''}><img src="logos/${u.file}.png" alt="${hidden ? '' : u.name}" loading="lazy"><span>${u.name}</span></div>`;
  const specialTile = hidden => `<div class="lmq-tile special"${hidden ? ' aria-hidden="true"' : ''}><b>의·치·약</b><span>합격 다수</span></div>`;
  function buildMarquee(el) {
    const list = el.dataset.logos === 'rev' ? [...UNIS].reverse() : UNIS;
    const withSpecial = el.hasAttribute('data-special');
    const set = hidden => list.map(u => logoTile(u, hidden)).join('') + (withSpecial ? specialTile(hidden) : '');
    el.innerHTML = `<div class="lmq-track">${set(false)}</div>`;
    const track = el.firstElementChild;
    if (RM) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 16;
    const shift = track.scrollWidth + gap;                       // 한 세트 폭 = 이동 거리
    const copies = Math.max(1, Math.ceil((el.clientWidth + shift) / shift)); // 화면 폭 + 한 세트를 항상 덮도록
    track.insertAdjacentHTML('beforeend', Array.from({ length: copies }, () => set(true)).join(''));
    track.style.setProperty('--shift', `${shift}px`);
    track.style.setProperty('--dur', `${(shift / parseFloat(el.dataset.speed || 42)).toFixed(1)}s`);
  }
  const marquees = $$('.lmq[data-logos]');
  marquees.forEach(buildMarquee);
  let mw = vw;
  addEventListener('resize', () => {
    clearTimeout(buildMarquee.t);
    buildMarquee.t = setTimeout(() => { if (Math.abs(innerWidth - mw) > 40) { mw = innerWidth; marquees.forEach(buildMarquee); } }, 200);
  });
  $$('[data-uwall]').forEach(el => {
    el.innerHTML = UNIS.map((u, i) => `<div class="utile" style="transition-delay:${i * 40}ms"><img src="logos/${u.file}.png" alt="" loading="lazy"><span>${u.full}</span></div>`).join('') +
      `<div class="utile special" style="transition-delay:${UNIS.length * 40}ms"><b>의·치·약</b><span>의대·치대·약대<br>합격생 다수</span></div>` +
      (el.hasAttribute('data-more') ? `<div class="utile special" style="background:var(--brand);border-color:var(--brand);transition-delay:${(UNIS.length + 1) * 40}ms"><b>+ 2027</b><span style="color:rgba(255,255,255,.9)">다음 합격 소식을<br>기다려 주세요</span></div>` : '');
  });

  // ── 후기 줄: 후기 카드 · 등급 향상 카드 · 흐르는 줄 ──
  // 카드 구성은 고객사가 준 레퍼런스의 후기 줄 코드에서 옮겼다: 두 줄 제목 + 대학 로고 → 본문 → 아래 이름 띠 / 이름 · 총 ○등급 향상 → 과목별 전 → 후 칸 → 성적 향상 TIP.
  const br = s => esc(s).replace(/&lt;br&gt;/g, '<br>'); // 데이터의 <br> 만 줄바꿈으로 허용
  const TRI = '<svg width="9" height="11" viewBox="0 0 12 14" aria-hidden="true"><path d="M12 7 0 0v14z" fill="currentColor"/></svg>';
  const uniOf = file => (file && UNIS.find(u => u.file === file)) || null;
  const uniName = o => { const u = uniOf(o.university); return u ? `${esc(u.full)}${o.dept ? ` ${esc(o.dept)}` : ''}` : ''; };
  const uniLogo = o => { const u = uniOf(o.university); return u ? `<span class="v-logo"><img src="logos/${esc(u.file)}.png" alt="" loading="lazy" draggable="false" onerror="this.parentNode.remove()"></span>` : ''; };
  // 글이 길면 카드를 넓게, 짧으면 좁게 — 줄 수가 비슷해져 카드 높이가 고르게 맞는다
  const fitW = (len, base, per, min, max) => Math.round(Math.min(max, Math.max(min, base + len * per)));
  // v: { title(두 줄, <br>), text, by, name, university?, dept?, href?, wrap? } — href 가 있으면 카드 전체가 링크
  function voiceCard(v) {
    const tag = v.href ? 'a' : 'article', uni = uniName(v);
    return `<${tag} class="vc${v.wrap ? ' wrap' : ''}"${v.href ? ` href="${esc(v.href)}" draggable="false"` : ''} style="--cw:${fitW((v.text || '').length, 176, 2, 300, 520)}px">` +
      `<header class="vc-top"><h4>${br(v.title)}</h4>${uniLogo(v)}</header>` +
      (v.text ? `<p class="vc-body">${esc(v.text)}</p>` : '') +
      `<p class="v-by"><span>${uni ? `<em>${uni}</em>` : ''}${esc(v.by || '')}</span><b>${esc(v.name || '')}${v.href ? ARROW : ''}</b></p></${tag}>`;
  }
  // g: { name, sub?, subjects: [[과목, 전, 후], …] (전 등급이 없으면 null), tip?, university?, dept? } — 합계는 과목별 향상폭을 더한다
  function gradeCard(g) {
    const up = ([, before, after]) => (before == null ? 0 : Math.max(0, before - after));
    const total = g.subjects.reduce((sum, sub) => sum + up(sub), 0);
    const uni = uniName(g);
    const who = (uni ? `<b>${uni} 합격</b>` : '') + (g.sub ? `<span>${esc(g.sub)}</span>` : '');
    return `<article class="gc"><header class="gc-top">${uniLogo(g)}<div class="gc-who"><p class="gc-name">${esc(g.name)}</p>${who ? `<p class="gc-sub">${who}</p>` : ''}</div>` +
      `<p class="gc-sum"><span>총</span><b>${total}</b>등급 향상</p></header>` +
      `<div class="gc-rows">${g.subjects.map(sub => { const [name, before, after] = sub, d = up(sub); return `<div class="gc-row${d ? ' up' : ''}"><span class="gc-s">${esc(name)}</span>` +
        `<p class="gc-v"><i>${before == null ? '–' : esc(before)}</i><span class="sr">등급에서</span>${TRI}<b>${esc(after)}</b><u>등급</u></p>` +
        `<em class="gc-d">${d ? `▲${d}` : '유지'}</em></div>`; }).join('')}</div>` +
      (g.tip ? `<p class="gc-tip-l">성적 향상 <b>TIP</b></p><p class="gc-tip">${esc(g.tip)}</p>` : '') + '</article>';
  }
  // 줄 맨 앞에 끼우는 성과 숫자 카드 — bx-data.js STATS 의 값을 그대로 쓴다 (data-lead="rise")
  const statCard = key => { const st = STATS[key]; return st ? `<article class="gs"><p class="gs-l">${esc(st.label)}</p><p class="gs-n">${fmtNum(st.value, st.dec || 0)}<i>${esc(st.unit)}</i></p><p class="gs-s">${esc(st.sub)}</p></article>` : ''; };
  // 흐르는 줄: 카드 줄이 한쪽으로 천천히 흐르고 끝과 처음이 이어진다.
  // 값은 같은 레퍼런스에서 읽었다: 한 프레임에 .4px(초당 24px), 줄마다 반대 방향, 마우스로 끌면 1.5배, 같은 묶음 세 벌을 이어 붙여 돌린다.
  // 가로 스크롤 위에 얹은 것이라 손가락 · 트랙패드 · 방향키로도 그대로 넘어간다. 마우스를 올리거나 넘기는 동안에는 멈춘다.
  // 카드가 세 장 이상이면 화면이 아무리 넓어도 흐른다 (모자라는 만큼 같은 묶음을 더 이어 붙인다). 움직임 줄이기 설정에서는 흐르지 않는다.
  const FLOW_PX_PER_SEC = 24, FLOW_DRAG = 1.5, FLOW_SETS = 3;
  function flowRail(rail, dir = 1, onMode) {
    const own = [...rail.children];
    let setW = 0, pos = 0, hold = 0, drag = null, dragged = false, hover = false, seen = false, raf = 0, t0 = 0;
    const flowing = () => rail.classList.contains('is-flow');
    function layout() {
      const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
      const w = own.reduce((sum, el) => sum + el.getBoundingClientRect().width + gap, 0);
      const on = !RM && own.length > 2 && w > 0;
      if (on) {
        // 묶음 수: 줄을 다 덮고도 앞뒤로 한 벌씩 남게 (카드가 적거나 화면이 넓으면 더 이어 붙인다)
        const need = Math.max(FLOW_SETS, Math.ceil(rail.clientWidth / w) + 2);
        for (let i = rail.children.length / own.length; i < need; i++) own.forEach(el => {
          const c = el.cloneNode(true);
          c.dataset.clone = '';
          c.setAttribute('aria-hidden', 'true');
          if (c.matches('a')) c.tabIndex = -1;
          rail.append(c);
        });
        if (!flowing()) {
          rail.classList.add('is-flow');
          setW = w;
          rail.scrollLeft = pos = setW;
        } else if (Math.abs(w - setW) > .5) {
          // 폭이 바뀌면 묶음 안에서 보던 자리를 비율로 옮긴다
          pos = w + (((pos % setW) + setW) % setW) / setW * w;
          setW = w;
          rail.scrollLeft = pos;
        }
      } else if (flowing()) {
        $$('[data-clone]', rail).forEach(c => c.remove());
        rail.classList.remove('is-flow', 'is-drag');
        drag = null;
        rail.scrollLeft = 0;
      }
      if (onMode) onMode();
      run();
    }
    function tick(t) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(64, t - (t0 || t));
      t0 = t;
      const cur = rail.scrollLeft;
      if (drag || hover || t < hold) pos = cur; // 사용자가 넘기는 동안에는 그 자리를 따른다
      else pos += dir * FLOW_PX_PER_SEC * dt / 1000;
      // 묶음 하나만큼 건너뛰어 끝과 처음을 잇는다 (가운데 묶음 안에서만 돈다)
      const jump = pos >= setW * 2 ? -setW : pos <= 0 ? setW : 0;
      pos += jump;
      if (drag) drag.left += jump;
      if (pos !== cur) rail.scrollLeft = pos;
    }
    function run() {
      const want = flowing() && seen;
      if (want && !raf) { t0 = 0; raf = requestAnimationFrame(tick); }
      else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    const pause = (ms = 1200) => { hold = Math.max(hold, performance.now() + ms); };
    // 마우스: 6px 넘게 움직이면 끌기로 보고 줄을 넘긴다 (그보다 적으면 카드 링크가 그대로 눌린다)
    rail.addEventListener('pointerdown', e => {
      dragged = false;
      if (!flowing() || e.pointerType !== 'mouse' || e.button) return;
      drag = { x: e.clientX, left: rail.scrollLeft, id: e.pointerId, on: false };
    });
    rail.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.on) {
        if (Math.abs(dx) < 6) return;
        drag.on = true;
        rail.classList.add('is-drag');
        rail.setPointerCapture(drag.id);
      }
      rail.scrollLeft = drag.left - dx * FLOW_DRAG;
    });
    const drop = () => { dragged = !!(drag && drag.on); drag = null; rail.classList.remove('is-drag'); };
    rail.addEventListener('pointerup', drop);
    rail.addEventListener('pointercancel', drop);
    rail.addEventListener('click', e => { if (dragged) { dragged = false; e.preventDefault(); e.stopPropagation(); } }, true);
    rail.addEventListener('dragstart', e => e.preventDefault());
    rail.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hover = true; });
    rail.addEventListener('pointerleave', () => { hover = false; if (drag && !drag.on) drag = null; });
    rail.addEventListener('focusin', () => { hover = true; });
    rail.addEventListener('focusout', () => { hover = false; });
    // 손가락 · 트랙패드: 넘기는 동안과 관성이 남아 있는 동안에는 흐름을 멈춘다
    ['touchstart', 'touchmove', 'wheel'].forEach(ev => rail.addEventListener(ev, () => pause(), { passive: true }));
    rail.addEventListener('touchend', () => pause(1600), { passive: true });
    rail.addEventListener('scroll', () => { if (performance.now() < hold) pause(700); }, { passive: true });
    new IntersectionObserver(es => { seen = es[es.length - 1].isIntersecting; run(); }, { rootMargin: '120px 0px' }).observe(rail);
    new ResizeObserver(layout).observe(rail);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    layout();
  }

  // ── 성적 상승 카드 (예시 데이터) ──
  function riseSvg(trend) {
    const w = 320, h = 72, pad = 8;
    const pts = trend.map((g, i) => [Math.round(pad + i * ((w - 2 * pad) / (trend.length - 1))), Math.round(pad + ((g - 1) / 5) * (h - 2 * pad))]);
    const line = pts.map(p => p.join(',')).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="rise-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="rg${trend.join('')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6600" stop-opacity=".22"/><stop offset="1" stop-color="#ff6600" stop-opacity="0"/></linearGradient></defs>` +
      `<polygon points="${pad},${h - pad} ${line} ${w - pad},${h - pad}" fill="url(#rg${trend.join('')})"/><polyline points="${line}" fill="none" stroke="#ff6600" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#ff6600"/></svg>`;
  }
  $$('[data-grades]').forEach(el => {
    // 흐르는 줄(.vrail)에는 과목별 전 → 후 카드, 그 밖(공부 관리 페이지의 추이 그래프)에는 기존 그래프 카드
    if (el.matches('.vrail')) { el.innerHTML = statCard(el.dataset.lead) + GRADES.map(gradeCard).join(''); flowRail(el, +el.dataset.flow || 1); return; }
    el.innerHTML = GRADES.map(g => `<div class="rise-card"><div class="rise-head"><div><p class="rise-name">${g.name}</p><p class="rise-sub">${g.sub}</p></div><span class="rise-badge">총 <b>${g.total}</b> 상승</span></div>` +
      `<div class="rise-chart">${riseSvg(g.trend)}</div><div class="rise-subjects">${g.chips.map(s => `<span class="rise-chip">${s[0]} <b>${s[1]}</b>▸<b class="up">${s[2]}</b></span>`).join('')}</div></div>`).join('');
  });

  // ── 강한 이야기 (공개 콘텐츠 API) ──
  function storyCard(p, big) {
    const type = TYPE_LABEL[p.type] || '콘텐츠';
    const cover = p.coverImageUrl
      ? `<img src="${esc(p.coverImageUrl)}" alt="" loading="lazy" onerror="this.remove()">`
      : `<div class="stc-art t-${esc(p.type)}"><p>${esc(p.title)}</p></div>`;
    const by = p.authorName ? `<p class="stc-by">${esc(p.authorName)}${p.authorRole ? ` · ${esc(p.authorRole)}` : ''}</p>` : '';
    const ext = isExternal(p) ? ' target="_blank" rel="noopener"' : '';
    return `<a class="stc${big ? ' big' : ''} r" href="${esc(postHref(p))}"${ext}>
      <div class="stc-cover">${cover}<span class="stc-type">${type}${isExternal(p) ? ' ↗' : ''}</span></div>
      <p class="stc-meta"><b>${type}</b>${fmtDate(p.publishedAt)}</p>
      <p class="stc-title">${esc(p.title)}</p>${p.summary ? `<p class="stc-sum">${esc(p.summary)}</p>` : ''}${by}</a>`;
  }
  // 기본 후기(bx-data.js REVIEWS)와 발행된 후기(type=review)를 같은 후기 카드로 — 발행된 후기는 요약을 본문으로 쓰고 카드 전체가 전문 링크
  const reviewCard = r => voiceCard(r);
  const publishedReviewCard = p => voiceCard({ title: p.title, text: p.summary, by: p.authorRole, name: p.authorName, href: postHref(p), wrap: true });
  // 기본 후기(예시)가 화면에 나갈 때는 줄 아래에 예시라는 안내를 붙인다 (이미 안내가 있으면 그대로 둔다)
  function sampleNote(el) {
    const box = el.closest('.vfl');
    if (box && !(box.nextElementSibling && box.nextElementSibling.matches('.vfl-note'))) box.insertAdjacentHTML('afterend', '<p class="vfl-note">개인정보 보호를 위해 이름은 가렸으며, 화면의 후기는 예시입니다.</p>');
  }
  async function renderStories(el) {
    const types = el.dataset.stories || '';
    const limit = parseInt(el.dataset.limit || '6', 10);
    const mode = el.dataset.mode || 'cards'; // cards | reviews
    try {
      const data = await api(`/api/public/content?limit=${limit}${types ? `&type=${encodeURIComponent(types)}` : ''}`);
      const posts = (data && data.posts) || [];
      if (!posts.length) throw new Error('empty');
      if (mode === 'reviews') {
        // 발행된 후기가 적으면 기본 후기로 채워 줄이 비지 않게
        const fill = REVIEWS.slice(0, Math.max(0, Math.min(limit, REVIEWS.length) - posts.length));
        el.innerHTML = posts.map(publishedReviewCard).join('') + fill.map(reviewCard).join('');
        if (fill.length) sampleNote(el);
      } else {
        el.innerHTML = posts.map((p, i) => storyCard(p, i === 0 && el.hasAttribute('data-feature'))).join('');
      }
    } catch (e) {
      if (mode === 'reviews') { el.innerHTML = REVIEWS.slice(0, limit).map(reviewCard).join(''); sampleNote(el); }
      else if (el.dataset.empty === 'hide') { const sec = el.closest('[data-stories-section]'); if (sec) sec.hidden = true; }
      else el.innerHTML = `<div class="st-empty"><b>곧 첫 이야기가 발행됩니다</b>강한선배의 후기와 선배 멘토·원장님의 글을 이곳에서 만나보실 수 있어요.</div>`;
    }
    if (mode === 'reviews' && el.matches('.vrail')) flowRail(el, +el.dataset.flow || 1);
    observeNew(el);
  }
  $$('[data-stories]').forEach(renderStories);

  // ── D-day ──
  $$('[data-dday]').forEach(el => {
    const t = new Date(`${el.dataset.dday}T00:00:00+09:00`).getTime();
    const d = Math.ceil((t - Date.now()) / 86400000);
    el.textContent = d > 0 ? `D-${d}` : d === 0 ? 'D-DAY' : '진행 중';
  });

  // ── 스크롤 연출: 펼쳐지는 미디어 · 패럴랙스 ──
  const expands = $$('[data-expand]');
  const parallax = $$('[data-parallax]');
  const inRange = el => { const r = el.getBoundingClientRect(); return r.bottom > -vh * .2 && r.top < vh * 1.2; };
  function updateFx() {
    if (RM) return;
    const mob = vw < 861;
    expands.forEach(el => {
      if (!inRange(el)) return;
      const r = el.getBoundingClientRect();
      const k = clamp((vh - r.top) / (vh * .85));
      const e = 1 - Math.pow(1 - k, 3);
      el.style.setProperty('--xm', `${((mob ? 16 : Math.max(28, (vw - 1180) / 2)) * (1 - e)).toFixed(1)}px`);
      el.style.setProperty('--xr', `${(34 * (1 - e)).toFixed(1)}px`);
      el.style.setProperty('--xs', (1.12 - .12 * e).toFixed(4));
    });
    parallax.forEach(el => {
      if (!inRange(el)) return;
      const r = el.getBoundingClientRect();
      const off = (r.top + r.height / 2 - vh / 2) / vh;
      const img = $('img', el);
      if (img) img.style.transform = `translate3d(0,${(off * -48).toFixed(1)}px,0)`;
    });
  }

  let raf = 0;
  const frame = () => { raf = 0; updateGnb(); updateFx(); };
  const request = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; request(); });
  frame();

  // ── 모달 · 라이트박스 ──
  function openModal(d) {
    if (!d || d.open) return;
    d.showModal();
    root.classList.add('md-open');
  }
  function wireModal(d) {
    if (d.dataset.wired) return;
    d.dataset.wired = '1';
    d.addEventListener('close', () => root.classList.remove('md-open'));
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  }
  $$('dialog.bx-modal').forEach(wireModal);
  const GAL = window.BX_GALLERY || [];
  let gal = null, gi = 0;
  if (GAL.length) {
    document.body.insertAdjacentHTML('beforeend', `
<dialog class="bx-modal lightbox" id="galModal" aria-label="사진 크게 보기">
  <button class="md-close" data-close aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  <figure class="lb-fig"><img id="galImg" src="" alt=""><figcaption><b id="galCap"></b><span id="galCount"></span></figcaption></figure>
  <button class="lb-nav lb-prev" data-gal-step="-1" aria-label="이전 사진"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 6l-6 6 6 6"/></svg></button>
  <button class="lb-nav lb-next" data-gal-step="1" aria-label="다음 사진"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6"/></svg></button>
  <div class="lb-thumbs">${GAL.map(([src, cap], i) => `<button type="button" data-gi="${i}" aria-label="${esc(cap)}"><img src="${src}" alt="" loading="lazy"></button>`).join('')}</div>
</dialog>`);
    gal = $('#galModal');
    wireModal(gal);
    gal.addEventListener('keydown', e => { if (e.key === 'ArrowRight') showGal(gi + 1); if (e.key === 'ArrowLeft') showGal(gi - 1); });
    let tx = null;
    gal.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    gal.addEventListener('touchend', e => {
      if (tx === null) return;
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 48) showGal(gi + (dx < 0 ? 1 : -1));
      tx = null;
    });
  }
  function showGal(i) {
    gi = (i + GAL.length) % GAL.length;
    $('#galImg').src = GAL[gi][0];
    $('#galImg').alt = GAL[gi][1];
    $('#galCap').textContent = GAL[gi][1];
    $('#galCount').textContent = `${gi + 1} / ${GAL.length}`;
    $$('.lb-thumbs button').forEach((b, k) => b.classList.toggle('on', k === gi));
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-gal]');
    if (g && gal) { showGal(parseInt(g.dataset.gal, 10)); openModal(gal); return; }
    const step = e.target.closest('[data-gal-step]');
    if (step) { showGal(gi + parseInt(step.dataset.galStep, 10)); return; }
    const th = e.target.closest('[data-gi]');
    if (th) { showGal(parseInt(th.dataset.gi, 10)); return; }
    const m = e.target.closest('[data-modal]');
    if (m) { const d = document.getElementById(m.dataset.modal); if (d) { wireModal(d); openModal(d); } }
  });

  // ── 관리 시스템 챕터 탭 · 이전/다음 ──
  const CHAPTERS = [
    { key: 'life', label: '생활 관리', href: 'care-life.html' },
    { key: 'study', label: '학습 관리', href: 'care-study.html' },
    { key: 'ops', label: '운영 관리', href: 'care-ops.html' },
    { key: 'space', label: '공간 관리', href: 'space.html' },
  ];
  const chap = document.body.dataset.chapter;
  $$('[data-chap-nav]').forEach(el => {
    el.innerHTML = `<div class="seg" role="navigation" aria-label="관리 시스템">${CHAPTERS.map((c, i) =>
      `<a href="${c.href}"${c.key === chap ? ' aria-current="true"' : ''}><i>0${i + 1}</i>${c.label}</a>`).join('')}</div>`;
  });
  $$('[data-chap-next]').forEach(el => {
    const i = CHAPTERS.findIndex(c => c.key === chap);
    const prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
    el.innerHTML = (prev ? `<a href="${prev.href}"><span>← 이전 관리</span><b>${prev.label}</b></a>` : '<a class="empty" aria-hidden="true"></a>') +
      (next ? `<a href="${next.href}"><span>다음 관리 →</span><b>${next.label}</b></a>` : `<a href="program.html"><span>관리 시스템 →</span><b>4가지 관리 한눈에 보기</b></a>`);
  });

  // ── 폰 프레임 안전영역 띠 색: 스크린샷 맨 위 · 하단 크롭선 근처 배경색을 읽어 --pf-bar / --pf-bot 로 (같은 출처 이미지) ──
  const tintCanvas = document.createElement('canvas');
  tintCanvas.width = tintCanvas.height = 1;
  const tintCtx = tintCanvas.getContext('2d', { willReadFrequently: true });
  function tintPhone(img) {
    const pf = img.closest('.pf');
    if (!pf || !img.naturalWidth || !tintCtx) return;
    const px = (x, y) => {
      tintCtx.clearRect(0, 0, 1, 1);
      tintCtx.drawImage(img, Math.round(x), Math.round(y), 1, 1, 0, 0, 1, 1);
      const d = tintCtx.getImageData(0, 0, 1, 1).data;
      return `rgb(${d[0]},${d[1]},${d[2]})`;
    };
    try {
      // 한 목업에 화면을 여러 장 겹쳐 두는 경우(아이의 하루)를 위해 img 에도 따로 둔다
      const bar = px(img.naturalWidth / 2, 2), bot = px(3, img.naturalHeight - 2);
      img.style.setProperty('--pf-bar', bar); img.style.setProperty('--pf-bot', bot);
      pf.style.setProperty('--pf-bar', bar);
      // 화면은 상태바 아래 ~ 홈 인디케이터 위(390×756pt)로 캡처돼 있다.
      // 맨 아래 줄(탭바 · 하단 버튼 영역 · 페이지 배경)이 홈 인디케이터 띠로 이어지게 한다.
      pf.style.setProperty('--pf-bot', bot);
    } catch (e) { /* 교차 출처 이미지면 기본 흰색 유지 */ }
  }
  document.addEventListener('load', e => { if (e.target.tagName === 'IMG' && e.target.closest('.pf')) tintPhone(e.target); }, true);
  $$('.pf img').forEach(img => { if (img.complete) tintPhone(img); });

  // ── 기능 탐색기: [data-fx] 안의 .fx-item[data-shot] 을 누르면 .fx-stage 폰 화면 교체 ──
  $$('[data-fx]').forEach(box => {
    const items = $$('.fx-item', box);
    const img = $('.fx-stage .pf img', box);
    const cap = $('.fx-stage [data-fx-cap]', box);
    if (!items.length || !img) return;
    items.forEach(it => { if (it.dataset.shot) { const p = new Image(); p.src = it.dataset.shot; } }); // 미리 로드
    const select = it => {
      if (it.classList.contains('on')) return;
      items.forEach(x => { x.classList.toggle('on', x === it); x.setAttribute('aria-pressed', String(x === it)); });
      if (!it.dataset.shot || img.getAttribute('src') === it.dataset.shot) return;
      img.classList.add('swap');
      setTimeout(() => { img.src = it.dataset.shot; img.alt = it.dataset.alt || ''; img.classList.remove('swap'); }, 180);
      if (cap) cap.textContent = it.dataset.cap || '';
    };
    items.forEach(it => {
      it.addEventListener('click', () => select(it));
      it.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) select(it); });
    });
    select(items[0]);
  });

  // ── 실제 화면 레일: photos/ui/manifest.json → 폰 프레임 목록 ──
  // 실제 화면 이미지 버전 — 스크린샷을 다시 찍으면 올려서 브라우저 캐시를 무효화한다
  const UI_V = 'ui3';
  const rails = $$('[data-ui-rail]');
  if (rails.length) {
    fetch('photos/ui/manifest.json?v=' + UI_V).then(r => (r.ok ? r.json() : [])).then(list => {
      rails.forEach(el => {
        const want = el.dataset.uiRail.split(',').map(s => s.trim()).filter(Boolean);
        // 파일명 목록이면 그 순서대로, surface 이름이면 해당 surface 전부 (스크롤 2번째 컷 제외)
        const pick = want.some(w => w.endsWith('.png'))
          ? want.map(f => list.find(m => m.file === f || m.file.endsWith('/' + f))).filter(Boolean)
          : list.filter(m => want.includes(m.surface) && !m.scroll);
        if (!pick.length) { const sec = el.closest('[data-ui-section]'); if (sec) sec.hidden = true; return; }
        // 한 앱 안의 역할별 화면 — 카드마다 누구의 화면인지 표시
        const ROLE = { portal: '학생', parent: '학부모님', staff: '선생님' };
        el.innerHTML = pick.map(m => {
          const src = (m.file.startsWith('photos/') ? m.file : `photos/ui/${m.file}`) + '?v=' + UI_V;
          const role = ROLE[m.surface] ? `<i class="pf-role" data-role="${esc(m.surface)}">${ROLE[m.surface]}</i>` : '';
          return `<figure class="r"><div class="pf sm"><img src="${esc(src)}" alt="${esc(m.title)}" loading="lazy"></div><figcaption class="pf-cap">${role}<b>${esc(m.title)}</b><span>${esc(m.caption || '')}</span></figcaption></figure>`;
        }).join('');
        observeNew(el);
        const ctl = el.nextElementSibling && el.nextElementSibling.matches('.ui-rail-ctl') ? el.nextElementSibling : null;
        if (ctl) $$('button', ctl).forEach(b => b.addEventListener('click', () => el.scrollBy({ left: parseInt(b.dataset.dir, 10) * 528, behavior: RM ? 'auto' : 'smooth' })));
      });
    }).catch(() => rails.forEach(el => { const sec = el.closest('[data-ui-section]'); if (sec) sec.hidden = true; }));
  }

  // FAQ 아코디언 (onclick="toggleAcc(this)")
  if (!window.toggleAcc) {
    window.toggleAcc = el => {
      const item = el.parentElement;
      const open = item.classList.contains('open');
      item.parentElement.querySelectorAll('.acc-item').forEach(i => i.classList.remove('open'));
      if (!open) item.classList.add('open');
    };
  }

  observeNew();
  window.KHSB = { api, storyCard, reviewCard, publishedReviewCard, voiceCard, gradeCard, flowRail, fitW, TYPE_LABEL, fmtDate, esc, safeUrl, observeNew, openModal, postHref, API: () => API };
})();
