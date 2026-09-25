// 대학 목록(UNIS)·후기(REVIEWS)·성적(GRADES)·로고 마퀴·콘텐츠 피드는 bx-data.js / bx-core.js 로 이전

// ── 후기 2행 마퀴 (위: 학부모·학생 말풍선 우→좌, 아래: 성적 상승 그래프 좌→우) ──
// 내용은 모두 예시입니다. 실제 후기·성적 데이터로 교체하세요.


// 등급 추이를 미니 라인그래프로 (등급 1=상단, 6=하단 → 향상될수록 선이 위로)
function riseChartSvg(trend) {
  const w = 320, h = 72, pad = 8, lo = 1, hi = 6;
  const pts = trend.map((g, i) => {
    const x = pad + i * ((w - 2 * pad) / (trend.length - 1));
    const y = pad + ((g - lo) / (hi - lo)) * (h - 2 * pad);
    return [Math.round(x), Math.round(y)];
  });
  const line = pts.map(p => p.join(',')).join(' ');
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  const last = pts[pts.length - 1];
  return `<svg class="rise-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="riseGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff6600" stop-opacity=".22"/>
      <stop offset="1" stop-color="#ff6600" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#riseGrad)"/>
    <polyline points="${line}" fill="none" stroke="#ff6600" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#ff6600"/>
  </svg>`;
}
function reviewCardEl(rv) {
  const c = document.createElement('div'); c.className = 'msg-card';
  c.innerHTML = `<div class="msg-from"><span class="msg-ava"></span>
      <div class="msg-id"><p class="msg-who"></p><p class="msg-meta"></p></div>
      <span class="msg-tag"></span></div>
    <div class="msg-bubble"><p></p></div>`;
  // 아바타는 모노라인 유저 글리프로 통일 (rv.ava 이모지는 미사용)
  c.querySelector('.msg-ava').innerHTML =
    '<svg class="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  c.querySelector('.msg-who').textContent = rv.who;
  c.querySelector('.msg-meta').textContent = rv.meta;
  c.querySelector('.msg-tag').textContent = rv.tag;
  c.querySelector('.msg-bubble p').textContent = rv.text;
  return c;
}
function gradeCardEl(g) {
  const c = document.createElement('div'); c.className = 'rise-card';
  const chips = g.chips.map(s => `<span class="rise-chip">${s[0]} <b>${s[1]}</b>▸<b class="up">${s[2]}</b></span>`).join('');
  c.innerHTML = `<div class="rise-head">
      <div><p class="rise-name">${g.name}</p><p class="rise-sub">${g.sub}</p></div>
      <span class="rise-badge">총 <b>${g.total}</b> 상승</span></div>
    <div class="rise-chart">${riseChartSvg(g.trend)}</div>
    <div class="rise-subjects">${chips}</div>`;
  return c;
}
// 한 세트를 만든 뒤, 화면 폭보다 넓어지도록 복제 → 초광폭(32")에서도 우측 여백/끊김 없음
function setupMarquee(track, items, build, pxPerSec) {
  if (!track) return;
  const GAP = 18; // .tm-track gap 과 동일
  items.forEach(d => track.appendChild(build(d)));        // 1세트
  const shift = track.scrollWidth + GAP;                  // 1세트 폭 + 세트 간 gap = 이동 거리
  const need = Math.max(2, Math.ceil(window.innerWidth / shift) + 2);
  for (let i = 1; i < need; i++) items.forEach(d => track.appendChild(build(d)));
  track.style.setProperty('--shift', shift + 'px');
  track.style.setProperty('--dur', (shift / pxPerSec).toFixed(1) + 's');
}
setupMarquee(document.getElementById('rvTrack'), REVIEWS, reviewCardEl, 52);
setupMarquee(document.getElementById('grTrack'), GRADES, gradeCardEl, 46);

// ── 대표 멘토 5인 카드 (가운데 featured) — mentors-data.js 의 데이터로 생성 ──
const mentorCards = document.getElementById('mentorCards');
if (mentorCards && typeof MENTOR_FEATURED !== 'undefined') {
  mentorCards.innerHTML = MENTOR_FEATURED
    .map(id => `<article class="flip">${mentorCardInner(id, false)}</article>`)
    .join('');
}

// ── 운영진(조교) 카드 — 사진 영역 없는 텍스트 카드 ──
const staffTeam = document.getElementById('staffTeam');
if (staffTeam && typeof STAFF_TEAM !== 'undefined') {
  staffTeam.innerHTML = STAFF_TEAM.map(id => staffCardInner(id)).join('');
}

// ── Stripe 인터랙션: 네비 투명→솔리드 전환 ──
const topNav = document.getElementById('topNav');
if (topNav && document.querySelector('.sthero')) {
  topNav.classList.add('on-hero');
  const onScroll = () => {
    topNav.classList.toggle('scrolled', window.scrollY > 24);
    topNav.classList.toggle('on-hero', window.scrollY <= 24);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ── Stripe 인터랙션: 통계 숫자 카운트업 ──
const cntIO = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  cntIO.unobserve(e.target);
  const el = e.target;
  const to = parseFloat(el.dataset.to);
  const dec = parseInt(el.dataset.dec || '0', 10);
  const t0 = performance.now(), DUR = 1400;
  const tick = t => {
    const p = Math.min((t - t0) / DUR, 1);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = (to * eased).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), { threshold: 0.5 });
document.querySelectorAll('.cnt[data-to]').forEach(el => cntIO.observe(el));

// reveal on scroll
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); }),
  { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.r').forEach(el => io.observe(el));

// smooth anchor scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    if (href === '#') return;
    const t = document.querySelector(href);
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});

// 시즌 특별 모집 탭 (윈터·섬머스쿨)
function switchSeason(key) {
  document.querySelectorAll('.season-tab').forEach(t => t.classList.toggle('on', t.dataset.season === key));
  document.querySelectorAll('.season-panel').forEach(p => p.classList.toggle('on', p.dataset.season === key));
}
window.switchSeason = switchSeason;

// FAQ accordion
function toggleAcc(el) {
  const item = el.parentElement;
  const open = item.classList.contains('open');
  item.parentElement.querySelectorAll('.acc-item').forEach(i => i.classList.remove('open'));
  if (!open) item.classList.add('open');
}
window.toggleAcc = toggleAcc;

// 입회 상담 신청 페이지 (운영 중인 앱의 /apply)
const APPLY_URL = 'https://khsb.vercel.app/apply';

// hero lead bar → 연락처를 들고 /apply 신청 페이지로 이동
function goContact(e) {
  e.preventDefault();
  const v = document.getElementById('leadPhone').value.trim();
  window.location.href = v ? `${APPLY_URL}?phone=${encodeURIComponent(v)}` : APPLY_URL;
  return false;
}
window.goContact = goContact;

// 입회 상담은 운영 중인 /apply 신청 페이지로 연결 (별도 폼 없음)

// 콘텐츠(강한 이야기) 미리보기는 bx-core.js 가 렌더링
