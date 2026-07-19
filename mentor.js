// 멘토 상세 페이지 렌더링. 데이터는 mentors-data.js(MENTORS)에서 가져옵니다.
// ⚠ mentor.html 은 mentors-data.js 를 이 파일보다 먼저 로드해야 합니다.
const id = new URLSearchParams(location.search).get('id') || 'seo';
const m = MENTORS[id] || MENTORS.seo;

document.getElementById('pageTitle').textContent = `${m.name} | 강한선배`;
const hero = document.getElementById('mHero');
hero.style.background = m.tint || 'var(--lav)';
const ava = document.getElementById('mAva');
if (m.photo) {
  ava.innerHTML = `<img src="${m.photo}" alt="${m.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
} else {
  ava.textContent = m.avatar; ava.style.background = m.grad;
}
document.getElementById('mBadges').innerHTML = m.badges.map(b => `<span class="m-badge">${b}</span>`).join('');
document.getElementById('mName').textContent = m.name;
document.getElementById('mRole').textContent = m.role;
document.getElementById('mOneliner').textContent = m.oneliner;
document.getElementById('mBio').textContent = m.bio;
document.getElementById('mSubjects').innerHTML = m.subjects.map(s => `<span>${s}</span>`).join('');
document.getElementById('mTimeline').innerHTML = m.timeline
  .map(t => `<li><div class="m-tl-year">${t.year}</div><div class="m-tl-text">${t.text}</div></li>`).join('');
document.getElementById('mInterview').innerHTML = m.interview.map(qa => `
  <div class="acc-item">
    <div class="acc-q" onclick="toggleAcc(this)">${qa.q}<span class="acc-pm">+</span></div>
    <div class="acc-a"><div class="acc-a-inner">${qa.a}</div></div>
  </div>`).join('');

function toggleAcc(el) {
  const item = el.parentElement;
  const open = item.classList.contains('open');
  item.parentElement.querySelectorAll('.acc-item').forEach(i => i.classList.remove('open'));
  if (!open) item.classList.add('open');
}
window.toggleAcc = toggleAcc;
