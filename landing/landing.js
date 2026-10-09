// 대학 목록(UNIS)·후기(REVIEWS)·성적(GRADES)·로고 마퀴·콘텐츠 피드는 bx-data.js / bx-core.js 로 이전

// ── 대표 멘토 카드 — mentors-data.js 의 데이터로 생성 ──
if (typeof MENTOR_FEATURED !== 'undefined') {
  mountMentorCards(document.getElementById('mentorCards'), MENTOR_FEATURED);
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
const APPLY_URL = 'https://apply.kanghanseonbae.com/apply';

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
