// ── 콘텐츠(팟캐스트·아티클) 공개 피드 API — 운영 중인 앱 도메인 (APPLY_URL 과 동일 앱) ──
const CONTENT_API = 'https://khsb.vercel.app/api/public/content';

// ── 대학 로고 마퀴 (logos/*.png 가 있으면 로고, 없으면 텍스트 칩으로 폴백) ──
// logos/ 폴더에 file 이름에 맞춰 로고 이미지를 넣으면 자동으로 표시됩니다.
const UNIS = [
  { name: '연세대', file: 'yonsei' }, { name: '서울대', file: 'snu' }, { name: '고려대', file: 'korea' },
  { name: '성균관대', file: 'skku' }, { name: '한양대', file: 'hanyang' }, { name: '서강대', file: 'sogang' },
  { name: '이화여대', file: 'ewha' }, { name: '중앙대', file: 'cau' }, { name: '경희대', file: 'khu' },
  { name: '한국외대', file: 'hufs' }, { name: '서울시립대', file: 'uos' },
];
const uniTrack = document.getElementById('uniTrack');
if (uniTrack) {
  const makeItem = (u, hidden) => {
    const img = document.createElement('img');
    img.className = 'uni-logo'; img.src = `logos/${u.file}.png`; img.alt = u.name; img.loading = 'lazy';
    if (hidden) img.setAttribute('aria-hidden', 'true');
    img.onerror = () => {                       // 로고 파일이 없으면 텍스트 칩으로 대체
      const chip = document.createElement('span');
      chip.className = 'uni-chip'; chip.textContent = u.name;
      if (hidden) chip.setAttribute('aria-hidden', 'true');
      img.replaceWith(chip);
    };
    return img;
  };
  [false, true].forEach(hidden => UNIS.forEach(u => uniTrack.appendChild(makeItem(u, hidden))));
}

// ── 후기 2행 마퀴 (위: 학부모·학생 말풍선 우→좌, 아래: 성적 상승 그래프 좌→우) ──
// 내용은 모두 예시입니다. 실제 후기·성적 데이터로 교체하세요.
const REVIEWS = [
  { who: '학부모님', meta: '고2 학부모 · 김OO님', ava: '👩', tag: '월간 리포트',
    text: '매달 오는 리포트로 아이가 뭘 하는지 다 보여요. 잔소리가 줄고 응원이 늘었습니다. 그게 의외로 큰 힘이 됐어요.' },
  { who: '재원생', meta: '고3 · 이OO', ava: '🧑‍🎓', tag: '담임 멘토링',
    text: '슬럼프로 포기하고 싶었는데 담임 멘토 선배가 멘탈까지 챙겨주셔서 끝까지 갈 수 있었어요.' },
  { who: '학부모님', meta: '고1 학부모 · 박OO님', ava: '🧑', tag: '출결·순찰',
    text: '아이가 몇 시에 와서 얼마나 앉아 있었는지까지 공유돼요. 학원 뺑뺑이 돌 때와는 안심의 차원이 다릅니다.' },
  { who: '재원생', meta: '재수생 · 정OO', ava: '🧑‍🎓', tag: '교시제 학습',
    text: '교시제로 하루가 칼같이 굴러가요. 혼자선 절대 못 지켰을 루틴을 매일 지켜주니 공부량 자체가 달라졌습니다.' },
  { who: '학부모님', meta: '고3 학부모 · 최OO님', ava: '👩', tag: '상벌점 관리',
    text: '잘한 것도 못한 것도 점수로 투명하게 보여서 믿음이 갑니다. 막연히 "열심히 한대요"가 아니라 기록이 남아요.' },
];
const GRADES = [
  { name: '김OO', sub: '고3 · 10개월 관리', total: '▲3등급', trend: [5, 5, 4, 3, 2, 2],
    chips: [['국어', '5', '2'], ['탐구', '3', '1'], ['영어', '2', '1']] },
  { name: '이OO', sub: '재수생 · 1년 관리', total: '▲2등급', trend: [4, 4, 3, 3, 2, 2],
    chips: [['수학', '4', '2'], ['영어', '2', '1'], ['한국사', '3', '2']] },
  { name: '박OO', sub: '고2 · 8개월 관리', total: '▲2등급', trend: [6, 5, 5, 4, 4, 3],
    chips: [['국어', '4', '2'], ['탐구', '2', '1'], ['수학', '4', '2']] },
  { name: '정OO', sub: '고3 · 6개월 관리', total: '▲1등급', trend: [3, 3, 2, 2, 2, 1],
    chips: [['국어', '2', '1'], ['수학', '3', '2'], ['탐구', '3', '2']] },
];
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
      <stop offset="0" stop-color="#E8552E" stop-opacity=".22"/>
      <stop offset="1" stop-color="#E8552E" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#riseGrad)"/>
    <polyline points="${line}" fill="none" stroke="#E8552E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#E8552E"/>
  </svg>`;
}
function reviewCardEl(rv) {
  const c = document.createElement('div'); c.className = 'msg-card';
  c.innerHTML = `<div class="msg-from"><span class="msg-ava"></span>
      <div class="msg-id"><p class="msg-who"></p><p class="msg-meta"></p></div>
      <span class="msg-tag"></span></div>
    <div class="msg-bubble"><p></p></div>`;
  c.querySelector('.msg-ava').textContent = rv.ava;
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

// ── 콘텐츠 섹션 — 앱 공개 API에서 팟캐스트·아티클을 불러와 카드 그리드 렌더 ──
// 콘텐츠가 0개이거나 fetch 실패 시 섹션은 hidden 그대로 유지.
(function renderContents() {
  const sec = document.getElementById('contents');
  const grid = document.getElementById('contentGrid');
  if (!sec || !grid) return;

  const TYPE_LABEL = { podcast: '🎙 팟캐스트', article: '📝 아티클' };

  function cardEl(p) {
    const a = document.createElement('a');
    a.className = 'content-card';
    a.href = p.url; a.target = '_blank'; a.rel = 'noopener';
    if (p.coverImageUrl) {
      const img = document.createElement('img');
      img.className = 'content-cover'; img.src = p.coverImageUrl; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => img.remove();
      a.appendChild(img);
    }
    const body = document.createElement('div'); body.className = 'content-body';
    const meta = document.createElement('p'); meta.className = 'content-meta';
    const date = p.publishedAt
      ? new Date(p.publishedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    meta.textContent = `${TYPE_LABEL[p.type] || '콘텐츠'} · ${date}`;
    const title = document.createElement('p'); title.className = 'content-title';
    title.textContent = p.title;
    body.append(meta, title);
    if (p.summary) {
      const sum = document.createElement('p'); sum.className = 'content-sum';
      sum.textContent = p.summary;
      body.appendChild(sum);
    }
    a.appendChild(body);
    return a;
  }

  fetch(CONTENT_API)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then(data => {
      const posts = (data && data.posts) || [];
      if (posts.length === 0) return;
      posts.slice(0, 6).forEach(p => grid.appendChild(cardEl(p)));
      sec.hidden = false;
    })
    .catch(() => {}); // 실패 시 섹션 숨김 유지 — 랜딩은 콘텐츠 없이도 완결
})();
