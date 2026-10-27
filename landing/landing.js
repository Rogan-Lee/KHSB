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

// ── 영상 — 어드민 콘텐츠 > 팟캐스트 탭 '홈페이지 영상'에서 고른 기본 영상 1 + 추가 영상 최대 2 (홈 #videos, 0개면 섹션 숨김) ──
// 순서는 [추가 1, 기본, 추가 2] 로 깔고 기본 영상을 가운데에 세운다. 양옆은 작고 흐리게 — 크기 · 투명도를 스크롤 위치에
// 맞춰 매 프레임 계산해서(transform · opacity 만) 손가락을 그대로 따라온다. 썸네일만 깔아 두고 누른 영상에만 플레이어(iframe)를 넣는다.
// KHSB(api · esc)는 이 파일 뒤에 로드되는 bx-core.js 가 만들므로 DOMContentLoaded 에서 돈다.
document.addEventListener('DOMContentLoaded', async () => {
  const sec = document.getElementById('videos');
  if (!sec || !window.KHSB) return;
  const { api, esc, safeUrl } = window.KHSB;
  let posts = [];
  try {
    posts = ((await api('/api/public/landing-videos')).posts || []).filter(p => /^[\w-]{11}$/.test(p.videoId || ''));
  } catch (e) { /* 불러오지 못하면 숨긴 채로 둔다 */ }
  if (!posts.length) return;
  const [main, ...extra] = posts;
  const list = [extra[0], main, extra[1]].filter(Boolean);

  const rail = sec.querySelector('.vid-rail'), ctl = sec.querySelector('.vid-ctl');
  const [prev, next] = ctl.querySelectorAll('.vid-arrow');
  // 커버를 따로 올렸으면 그것, 아니면 유튜브 썸네일 (maxres 가 없는 영상은 hq 로)
  const thumb = p => esc(p.coverImageUrl ? safeUrl(p.coverImageUrl) : `https://i.ytimg.com/vi/${p.videoId}/maxresdefault.jpg`);
  const toHq = img => { if (img.src.includes('/maxresdefault.')) img.src = img.src.replace('/maxresdefault.', '/hqdefault.'); };
  const facade = (media, p) => {
    media.innerHTML = `<button type="button" class="vid-play" aria-label="영상 재생: ${esc(p.title)}"><img src="${thumb(p)}" alt=""><i></i></button>`;
    const img = media.querySelector('img');
    img.onerror = () => toHq(img);
    img.onload = () => img.naturalWidth < 200 && toHq(img);
  };
  const by = p => (p.authorName ? `출연 ${esc(p.authorName)}${p.authorRole ? ` · ${esc(p.authorRole)}` : ''}` : '');
  rail.innerHTML = list.map((p, i) => `<article class="vid-slide" data-i="${i}"><div class="vid-card"><div class="vid-media"></div><div class="vid-cap"><p class="vid-title">${esc(p.title)}</p>${p.summary ? `<p class="vid-sum">${esc(p.summary)}</p>` : ''}${p.authorName ? `<p class="vid-by">${by(p)}</p>` : ''}</div></div></article>`).join('');
  const slides = [...rail.querySelectorAll('.vid-slide')];
  slides.forEach((s, i) => facade(s.querySelector('.vid-media'), list[i]));
  sec.hidden = false;

  // 슬라이드 위치는 한 번 재 두고(창 크기가 바뀔 때만 다시) 스크롤 중엔 계산만 한다
  let centers = [], w = 1, step = 1, active = -1, ticking = false;
  const measure = () => {
    centers = slides.map(s => s.offsetLeft + s.offsetWidth / 2);
    w = slides[0].offsetWidth;
    step = w + parseFloat(getComputedStyle(rail).columnGap);
  };
  const paint = () => {
    ticking = false;
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let near = 0;
    slides.forEach((s, i) => {
      const off = centers[i] - mid;
      const d = Math.min(1, Math.abs(off) / step); // 0 = 가운데, 1 = 바로 옆자리
      // 옆자리는 86% 크기 · 45% 불투명, 가운데 쪽으로 7% 당겨 화면에 더 걸쳐 보이게.
      // 스냅 위치는 변형된 상자로 계산되므로 슬라이드 자체가 아니라 안쪽 카드를 움직인다
      const card = s.firstElementChild;
      card.style.transform = `translateX(${(-Math.sign(off) * d * .07 * w).toFixed(1)}px) scale(${(1 - .14 * d).toFixed(4)})`;
      card.style.opacity = (1 - .55 * d).toFixed(3);
      if (Math.abs(off) < Math.abs(centers[near] - mid)) near = i;
    });
    if (near === active) return;
    active = near;
    slides.forEach((s, i) => {
      s.classList.toggle('on', i === near);
      const media = s.querySelector('.vid-media');
      if (i !== near && media.querySelector('iframe')) facade(media, list[i]); // 옆으로 밀려나면 멈춤
    });
    prev.disabled = near === 0;
    next.disabled = near === slides.length - 1;
  };
  const queue = () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } };
  const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const go = (i, behavior = smooth) => {
    i = Math.max(0, Math.min(slides.length - 1, i));
    rail.scrollTo({ left: centers[i] - rail.clientWidth / 2, behavior });
  };
  measure();
  go(list.indexOf(main), 'auto'); // 기본 영상을 가운데에
  paint();
  rail.addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => { measure(); go(active, 'auto'); queue(); });

  rail.addEventListener('click', e => {
    const slide = e.target.closest('.vid-slide');
    if (!slide) return;
    const i = +slide.dataset.i;
    if (i !== active) { go(i); return; } // 옆 영상을 누르면 가운데로 데려온다
    if (!e.target.closest('.vid-play')) return;
    const media = slide.querySelector('.vid-media'), p = list[i];
    media.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${p.videoId}?autoplay=1&rel=0&playsinline=1" title="${esc(p.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>`;
    media.querySelector('iframe').focus();
    if (window.gtag) gtag('event', 'play_video', { video_title: p.title });
  });
  if (slides.length > 1) {
    prev.hidden = next.hidden = false;
    prev.addEventListener('click', () => go(active - 1));
    next.addEventListener('click', () => go(active + 1));
  }
});

// ── 홈 공지 팝업 — 어드민 콘텐츠 > '홈페이지 팝업'이 켜져 있고 기간 안일 때만 ──
// '오늘 하루 보지 않기'는 이 브라우저에만 저장(KST 날짜 + 팝업 저장 시각 → 내용을 바꾸면 다시 뜬다).
// 본문 HTML 은 서버(renderContentMarkdown)가 안전하게 렌더한 것.
document.addEventListener('DOMContentLoaded', async () => {
  if (!window.KHSB) return;
  const { api, esc, safeUrl } = window.KHSB;
  let p = null;
  try { p = (await api('/api/public/landing-popup')).popup; } catch (e) { /* 못 불러오면 안 띄운다 */ }
  if (!p) return;
  const KEY = 'khsbPopupHide';
  const stamp = `${p.id}|${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}`;
  try { if (localStorage.getItem(KEY) === stamp) return; } catch (e) { /* 저장소가 막혀 있으면 그냥 띄운다 */ }

  document.body.insertAdjacentHTML('beforeend', `
<dialog class="bx-modal sheet pop" id="popModal" aria-labelledby="popTitle">
  <div class="sheet-card pop-card">
    <div class="pop-scroll">
      <p class="eyebrow">공지</p>
      <h2 class="pop-title" id="popTitle">${esc(p.title)}</h2>
      <div class="pop-body">${p.bodyHtml}</div>
      ${p.cta ? `<a class="btn btn-brand pop-cta" href="${esc(safeUrl(p.cta.url))}" target="_blank" rel="noopener">${esc(p.cta.label)}</a>` : ''}
    </div>
    <div class="pop-foot"><button type="button" data-today>오늘 하루 보지 않기</button><button type="button" data-close>닫기</button></div>
  </div>
</dialog>`);
  const d = document.getElementById('popModal');
  const root = document.documentElement;
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.querySelector('[data-today]').addEventListener('click', () => {
    try { localStorage.setItem(KEY, stamp); } catch (e) { /* 저장 못 하면 이번만 닫힘 */ }
    d.close();
  });
  d.addEventListener('close', () => root.classList.remove('md-open'));
  d.showModal();
  root.classList.add('md-open');
});
