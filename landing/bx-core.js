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
  function reviewCard(r, feat) {
    return `<figure class="rvc${feat ? ' feat' : ''} r"><blockquote class="rv-q">${esc(r.text)}</blockquote><figcaption class="rv-by"><span>${esc(r.meta)}</span><em class="rv-tag" style="font-style:normal">${esc(r.tag)}</em></figcaption></figure>`;
  }
  // 발행된 후기(type=review)를 후기 카드로 — 본문 대신 요약(없으면 제목)을 인용문으로
  function publishedReviewCard(p, feat) {
    return `<a class="rvc${feat ? ' feat' : ''} r" href="${esc(postHref(p))}"><blockquote class="rv-q">${esc(p.summary || p.title)}</blockquote><figcaption class="rv-by"><span>${esc(p.authorName || '')}${p.authorRole ? ` · ${esc(p.authorRole)}` : ''}</span><span class="rv-tag">후기 전문 →</span></figcaption></a>`;
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
        // 발행된 후기가 3개 미만이면 기본 후기로 채워 그리드가 비지 않게
        const fill = REVIEWS.slice(0, Math.max(0, Math.min(limit, 3) - posts.length));
        el.innerHTML = posts.map((p, i) => publishedReviewCard(p, i === 0 && el.hasAttribute('data-feature'))).join('') +
          fill.map(r => reviewCard(r, false)).join('');
      } else {
        el.innerHTML = posts.map((p, i) => storyCard(p, i === 0 && el.hasAttribute('data-feature'))).join('');
      }
    } catch (e) {
      if (mode === 'reviews') el.innerHTML = REVIEWS.slice(0, limit).map((r, i) => reviewCard(r, i === 0 && el.hasAttribute('data-feature'))).join('');
      else if (el.dataset.empty === 'hide') { const sec = el.closest('[data-stories-section]'); if (sec) sec.hidden = true; }
      else el.innerHTML = `<div class="st-empty"><b>곧 첫 이야기가 발행됩니다</b>강한선배의 후기와 선배 멘토·원장님의 글을 이곳에서 만나보실 수 있어요.</div>`;
    }
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
  window.KHSB = { api, storyCard, reviewCard, publishedReviewCard, TYPE_LABEL, fmtDate, esc, safeUrl, observeNew, openModal, postHref, API: () => API };
})();
