// ── 멘토 · 운영진 공용 데이터 (landing.js · mentors.js · mentor.js 가 공유) ──
// 상세 소개·인터뷰 문구는 강한선배 제공 해시태그·이력을 바탕으로 작성. 사진은 photo 필드로 교체.
// avatar = 사진 없을 때 표시할 한글 이니셜(성 한자 사용 금지), grad = 카드 사진영역 그라데이션, tint = 상세 히어로 배경
const MENTORS = {
  // ── 선배 멘토진 (실제 인물, 사진순서) ──────────────────────
  naeun: {
    name: '김나은 멘토', avatar: '나', photo: 'photos/naeun.jpg', grad: 'linear-gradient(135deg,#F2754A,#D8431C)', tint: '#FBE7DE',
    badges: ['서울대 재학', '전교 1등', '수시 학종'], role: '서울대 재학 · 사회탐구·생기부 담당',
    cardLine: '“전교 1등의 노트가 아니라, 그걸 만든 습관을 알려드립니다.”',
    oneliner: '"전교 1등의 노트가 아니라, 그걸 만든 습관을 알려드립니다. 생기부부터 사탐까지 함께 설계합니다."',
    bio: '삼괴고에서 전 학년 전교 1등을 지킨 경험이 있습니다. 특별한 재능보다, 매일을 흐트러짐 없이 쌓는 습관이 결과를 만든다고 믿습니다.\n서울대 재학 중 얻은 시야로 수시 학종의 큰 그림을 함께 그리고, 사회탐구와 생활기록부를 하나의 이야기로 엮어 강점을 드러내 드립니다.',
    subjects: ['사회탐구', '생기부 관리', '수시 학종', '학습 습관'],
    timeline: [
      { year: '현재', text: '강한선배 사회탐구·생기부 담당 멘토' },
      { year: '고교', text: '삼괴고 전 학년 전교 1등' },
      { year: '대학', text: '서울대학교 재학 중' },
    ],
    interview: [
      { q: '어떤 멘토가 되어주실 건가요?', a: '노트 필기를 베끼게 하는 게 아니라, 그 성적을 만든 공부 습관을 몸에 배게 해주는 멘토가 되겠습니다.' },
      { q: '가장 중요하게 보는 것은?', a: '학종은 일관된 서사입니다. 생기부·사탐·활동이 하나로 이어질 때 설득력이 생깁니다.' },
      { q: '어떤 학생에게 도움이 될까요?', a: '수시 방향이 막막한 학생, 생기부를 어떻게 채울지 모르는 학생에게 특히 도움이 됩니다.' },
    ],
  },
  jiwoo: {
    name: '김지우 멘토', avatar: '지', photo: 'photos/jiwoo.jpg', grad: 'linear-gradient(135deg,#5B8DEF,#2C5FC9)', tint: '#DCE7FB',
    badges: ['국제고', '수시·면접', '영어·언매'], role: '국제고 출신 · 영어·언어와매체 담당',
    cardLine: '“정답이 아니라, 나에게 맞는 전략을 함께 설계합니다.”',
    oneliner: '"정답이 아니라, 나에게 맞는 전략을 함께 설계합니다. 영어·언매부터 대입 면접까지 끌어드립니다."',
    bio: '국제고에서 치열한 경쟁을 통과하며, 정해진 정답보다 자신에게 맞는 전략을 찾는 힘이 입시를 가른다는 걸 배웠습니다.\n영어와 언어와 매체, 사회탐구를 균형 있게 관리하고, 대입 면접까지 맞춤 전략으로 설계해 동기를 잃지 않게 함께합니다.',
    subjects: ['영어', '언어와 매체', '사회탐구', '대입 면접', '맞춤 전략'],
    timeline: [
      { year: '현재', text: '강한선배 영어·언어와매체 담당 멘토' },
      { year: '고교', text: '국제고 졸업' },
      { year: '강점', text: '수시 전략 · 대입 면접 지도' },
    ],
    interview: [
      { q: '어떤 멘토가 되어주실 건가요?', a: '남의 방식이 아니라, 그 학생에게 맞는 전략을 같이 찾아 끝까지 동기를 지켜주는 멘토가 되겠습니다.' },
      { q: '가장 중요하게 보는 것은?', a: '맞춤 전략입니다. 같은 목표라도 학생마다 가야 할 길이 다릅니다.' },
    ],
  },
  seunghee: {
    name: '조승희 멘토', avatar: '승', photo: 'photos/seunghee.jpg', grad: 'linear-gradient(135deg,#4AAE7C,#1F7A4F)', tint: '#D6F0DF',
    badges: ['정시', '사회탐구', '멘탈 관리'], role: '정시·사회탐구 · 멘탈 관리 담당',
    cardLine: '“무너지는 시점을 먼저 잡아, 성적을 끌어올립니다.”',
    oneliner: '"무너지는 시점을 먼저 잡아, 성적을 끌어올립니다. 섬세한 지도로 학습 계획과 멘탈을 함께 관리합니다."',
    bio: '성적을 가르는 건 실력만이 아니라, 흔들리는 순간을 어떻게 넘기느냐라고 믿습니다. 무너지려는 시점을 먼저 알아채고 붙잡는 데 집중합니다.\n정시 베이스의 학습 계획과 사회탐구 지도를 섬세하게 병행하고, 동기 부여와 멘탈 관리로 꾸준한 성적 상승을 만들어 드립니다.',
    subjects: ['사회탐구', '학습 계획', '멘탈 관리', '동기 부여'],
    timeline: [
      { year: '현재', text: '강한선배 정시·사회탐구·멘탈 관리 담당 멘토' },
      { year: '강점', text: '섬세한 학습 계획 설계 · 멘탈 코칭' },
      { year: '원칙', text: '무너지는 시점을 먼저 잡는 관리' },
    ],
    interview: [
      { q: '어떤 멘토가 되어주실 건가요?', a: '성적이 떨어진 날에도 곁에서 가장 먼저 알아채고, 다시 책상에 앉게 끌어주는 멘토가 되겠습니다.' },
      { q: '가장 중요하게 보는 것은?', a: '꺾이지 않는 페이스입니다. 계획과 멘탈을 함께 잡아야 성적이 꾸준히 오릅니다.' },
    ],
  },
  seonhyeok: {
    name: '김선혁 멘토', avatar: '선', photo: 'photos/seonhyeok.jpg', grad: 'linear-gradient(135deg,#7C6BF0,#4C39C2)', tint: '#E3DEFB',
    badges: ['의대 재학', '최상위권', '미적·과탐'], role: '의대 재학 · 미적·과학탐구 담당',
    cardLine: '“최상위권은 개념의 빈틈을 남기지 않습니다.”',
    oneliner: '"최상위권은 개념의 빈틈을 남기지 않습니다. 미적·과탐의 원리부터 단단히 세웁니다."',
    bio: '의대 입시라는 최상위권 경쟁을 직접 통과했습니다. 이 구간의 승부는 재능이 아니라, 개념의 빈틈을 남기지 않는 집요함이라는 걸 압니다.\n미적분과 과학탐구를 원리부터 다시 세워, 수시와 정시 어느 쪽에서도 흔들리지 않는 이과 최상위권 실력을 함께 만들고 멘탈까지 관리합니다.',
    subjects: ['미적분', '과학탐구', '수시·정시', '멘탈 관리'],
    timeline: [
      { year: '현재', text: '강한선배 미적·과학탐구 담당 멘토' },
      { year: '대학', text: '의과대학 재학 중' },
      { year: '강점', text: '이과 최상위권 수시·정시 전략' },
    ],
    interview: [
      { q: '어떤 멘토가 되어주실 건가요?', a: '어디서 막혔는지 정확히 짚어주고, 최상위권까지 가는 길을 분명히 보여주는 멘토가 되겠습니다.' },
      { q: '가장 중요하게 보는 것은?', a: '개념의 완결성입니다. 기본 원리가 단단해야 킬러 문항에서도 흔들리지 않습니다.' },
      { q: '어떤 학생에게 도움이 될까요?', a: '이과 최상위권을 노리는 학생, 의대·상위권 입시 방향이 막막한 학생에게 추천합니다.' },
    ],
  },
  donggeon: {
    name: '이동건 멘토', avatar: '동', grad: 'linear-gradient(135deg,#E8883E,#C25E14)', tint: '#FBE6D6',
    badges: ['고려대 재학', '정시', '미적·과탐'], role: '고려대 재학 · 미적·과학탐구 담당',
    cardLine: '“정시는 흔들리지 않는 하루가 만든 결과입니다.”',
    oneliner: '"정시는 흔들리지 않는 하루가 만든 결과입니다. 미적·과탐 실력과 멘탈을 함께 끌어올립니다."',
    bio: '정시의 승부는 특별한 하루가 아니라, 흔들리지 않는 평범한 하루를 얼마나 오래 지키느냐에 있다고 믿습니다.\n고려대 재학 중 얻은 경험으로 미적분과 과학탐구 실력을 끌어올리고, 멘탈까지 함께 관리해 꾸준한 성적 상승으로 이어지게 합니다.',
    subjects: ['미적분', '과학탐구', '정시 전략', '멘탈 관리'],
    timeline: [
      { year: '현재', text: '강한선배 미적·과학탐구 담당 멘토' },
      { year: '대학', text: '고려대학교 재학 중' },
      { year: '강점', text: '정시 학습 설계 · 멘탈 관리' },
    ],
    interview: [
      { q: '어떤 멘토가 되어주실 건가요?', a: '눈에 띄지 않는 하루의 루틴을 끝까지 지켜주는, 정시 페이스메이커 같은 멘토가 되겠습니다.' },
      { q: '가장 중요하게 보는 것은?', a: '꾸준함입니다. 흔들리지 않는 하루가 쌓여 정시 결과를 만듭니다.' },
    ],
  },

  // ── 운영진 · 관리팀 (실제 인물) ─────────────────────────────
  jihoon: {
    name: '정지훈 총괄', avatar: '정', photo: 'photos/jihoon.jpg', grad: 'linear-gradient(135deg,#3D5A9E,#22376E)', tint: '#DDE4F2',
    badges: ['전체 총괄', '입시 네비게이터', '밀착 프로세스 관리'], role: '전체 총괄 · 책임',
    cardLine: '“흔들리는 입시 레이스, 흔들리지 않는 굳건한 이정표가 되어주겠습니다.”',
    oneliner: '"흔들리는 입시 레이스, 흔들리지 않는 굳건한 이정표가 되어주겠습니다."',
    bio: '강한선배의 운영 전반을 총괄합니다. 멘토진의 학습 지도부터 관리팀의 생활 관리까지, 아이에게 닿는 모든 관리가 하나의 방향으로 움직이도록 설계하고 점검합니다.\n입시는 매일 흔들립니다. 그 레이스 위에서 학생이 길을 잃지 않도록, 희망 대학·학과에서 지금까지 거꾸로 짚어 밀착 관리하고, 감이 아니라 체계로 굳건한 이정표가 되어드립니다.',
    subjects: ['전체 운영 총괄', '입시 전략 총괄', '밀착 프로세스 관리', '학습 디렉팅'],
    timeline: [
      { year: '현재', text: '강한선배 전체 총괄 책임' },
      { year: '총괄', text: '멘토진 학습 지도 · 관리팀 생활 관리 전반 총괄' },
      { year: '방향', text: '체계적인 학습 디렉팅으로 흔들림 없는 이정표 제시' },
    ],
    interview: [
      { q: '어떤 총괄이 되어주실 건가요?', a: '입시가 아무리 흔들려도 학생이 다음에 무엇을 해야 하는지는 분명히 알 수 있도록, 모든 관리를 하나의 방향으로 이끄는 굳건한 이정표가 되겠습니다.' },
      { q: '관리에서 가장 중요하게 보는 것은?', a: '방향과 프로세스입니다. 목표에서 거꾸로 짚어 매주의 할 일을 설계하고, 멘토·관리팀과 함께 그 진행을 밀착 점검합니다.' },
      { q: '어떤 학생에게 도움이 될까요?', a: '열심히는 하는데 방향이 막막한 학생, 계획이 자꾸 무너지는 학생에게 체계적인 총괄 관리가 큰 힘이 됩니다.' },
    ],
  },
  jiyoung: {
    name: '빙지영 조교', avatar: '빙', grad: 'linear-gradient(135deg,#3FB6B2,#1C7E7A)', tint: '#D6F0EF',
    badges: ['꼼꼼한 생활 관리', '디테일의 힘', '든든한 페이스메이커'], role: '생활 관리 조교',
    cardLine: '“사소한 흐트러짐도 놓치지 않는 정교함으로, 여러분의 하루를 빈틈없이 채웁니다.”',
    oneliner: '"사소한 흐트러짐도 놓치지 않는 정교함으로, 여러분의 하루를 빈틈없이 채웁니다."',
    bio: '큰 변화는 대개 사소한 흐트러짐에서 시작됩니다. 늦어진 입실, 흐트러진 자세, 미뤄둔 계획 — 그 작은 신호를 가장 먼저 알아채는 것이 제 일입니다.\n디테일을 놓치지 않는 꼼꼼한 생활 관리로 학생의 하루를 빈틈없이 채우고, 지치지 않도록 곁에서 페이스를 잡아드립니다.',
    subjects: ['출결·생활 관리', '자세·집중 점검', '일과 리듬 관리', '데일리 케어'],
    timeline: [
      { year: '현재', text: '강한선배 생활 관리 조교' },
      { year: '관리', text: '사소한 흐트러짐까지 놓치지 않는 꼼꼼한 하루 관리' },
      { year: '원칙', text: '디테일을 챙기는 든든한 페이스메이커' },
    ],
    interview: [
      { q: '어떤 조교가 되어주실 건가요?', a: '작은 흐트러짐도 빨리 알아채고 조용히 잡아주는, 학생의 하루를 빈틈없이 채우는 조교가 되겠습니다.' },
      { q: '관리에서 가장 중요하게 보는 것은?', a: '디테일입니다. 사소해 보이는 습관이 쌓여 하루의 질을, 결국 성적을 바꿉니다.' },
      { q: '어떤 학생에게 도움이 될까요?', a: '혼자서는 생활 리듬이 자꾸 무너지는 학생, 꾸준한 페이스 관리가 필요한 학생에게 든든한 힘이 됩니다.' },
    ],
  },
  jaewook: {
    name: '박재욱 조교', avatar: '박', grad: 'linear-gradient(135deg,#E8883E,#C25E14)', tint: '#FBE6D6',
    badges: ['진정성 있는 공감', '선배의 합격 바이블', '흔들림 없는 몰입'], role: '학습 관리 조교',
    cardLine: '“막막했던 수험생활의 끝을 직접 겪어본 선배로서, 가장 현실적인 학습 관리를 제시합니다.”',
    oneliner: '"막막했던 수험생활의 끝을 직접 겪어본 선배로서, 가장 현실적인 학습 관리를 제시합니다."',
    bio: '막막했던 수험 생활의 끝을 직접 걸어본 사람입니다. 그래서 학생이 지금 어디서 막혀 있는지, 어떤 위로가 공허하고 어떤 말이 힘이 되는지 압니다.\n진정성 있는 공감에서 시작해, 이상론이 아닌 가장 현실적인 학습 관리를 제시합니다. 흔들리는 순간에도 다시 몰입으로 돌아오도록 곁을 지킵니다.',
    subjects: ['학습 관리', '학습 상담·공감', '몰입 환경 조성', '실전 학습 코칭'],
    timeline: [
      { year: '현재', text: '강한선배 학습 관리 조교' },
      { year: '경험', text: '수험 생활의 끝을 직접 통과한 선배' },
      { year: '원칙', text: '진정성 있는 공감 위에 현실적인 학습 관리' },
    ],
    interview: [
      { q: '어떤 조교가 되어주실 건가요?', a: '겪어본 선배로서 진심으로 공감하고, 지금 당장 할 수 있는 현실적인 방법을 쥐여주는 조교가 되겠습니다.' },
      { q: '관리에서 가장 중요하게 보는 것은?', a: '흔들림 없는 몰입입니다. 무너진 날에도 다시 책상에 앉아 집중으로 돌아오도록 함께합니다.' },
      { q: '어떤 학생에게 도움이 될까요?', a: '수험 생활이 막막하고 외로운 학생, 공감과 현실적인 학습 관리가 동시에 필요한 학생에게 힘이 됩니다.' },
    ],
  },
  choongsun: {
    name: '이충선 조교', avatar: '이', grad: 'linear-gradient(135deg,#7C6BF0,#4C39C2)', tint: '#E3DEFB',
    badges: ['순공시간 최대 확보', 'FM 관리', '태도 교정'], role: '순공 · 태도 관리 조교',
    cardLine: '“매일의 성실함이 최고의 무기가 되도록, 몰입의 공간을 만듭니다.”',
    oneliner: '"매일의 성실함이 최고의 무기가 되도록, 몰입의 공간을 만듭니다."',
    bio: '재능보다 강한 것은 매일의 성실함이라고 믿습니다. 그 성실함이 최고의 무기가 되도록, 순수하게 공부에 몰입할 수 있는 공간을 지킵니다.\n원칙대로(FM) 관리하고, 흐트러진 태도는 그때그때 바로잡습니다. 오래 앉아 있는 시간이 아니라 진짜 집중한 순공 시간을 최대로 끌어올립니다.',
    subjects: ['순공 시간 관리', 'FM 규정 운영', '태도 교정', '집중 환경 관리'],
    timeline: [
      { year: '현재', text: '강한선배 순공·태도 관리 조교' },
      { year: '관리', text: '원칙대로(FM) 운영하며 순공 시간 최대 확보' },
      { year: '원칙', text: '흐트러진 태도를 바로잡는 몰입 공간 조성' },
    ],
    interview: [
      { q: '어떤 조교가 되어주실 건가요?', a: '매일의 성실함이 결국 무기가 되도록, 순수하게 몰입할 수 있는 공간을 원칙대로 지키는 조교가 되겠습니다.' },
      { q: '관리에서 가장 중요하게 보는 것은?', a: '순공 시간과 태도입니다. 앉아 있는 시간이 아니라 진짜 집중한 시간을 기준으로 관리합니다.' },
      { q: '어떤 학생에게 도움이 될까요?', a: '집중이 자꾸 흐트러지는 학생, 공부 시간에 비해 순공량이 적은 학생에게 확실한 도움이 됩니다.' },
    ],
  },
};

// 전체 멘토 순서 (mentors.html 전체 목록) · 랜딩 노출 멘토 (사진순서)
const MENTOR_ORDER = ['naeun', 'jiwoo', 'seunghee', 'seonhyeok', 'donggeon'];
const MENTOR_FEATURED = ['naeun', 'jiwoo', 'seunghee', 'seonhyeok', 'donggeon'];
// 운영진 · 관리팀 (실제 인물, 카드 컴포넌트 · 상세 페이지 공유)
const STAFF_LEADERSHIP = ['jihoon'];
const STAFF_TEAM = ['jiyoung', 'jaewook', 'choongsun'];

// 운영진(조교) 카드 — 사진 영역 없는 텍스트 카드 (landing.js 사용)
function staffCardInner(id) {
  const m = MENTORS[id];
  const subj = m.subjects.map(s => `<span>${s}</span>`).join('');
  return `<a class="staff-card" href="mentor.html?id=${id}">
    <span class="mf-badge">${m.badges.join(' · ')}</span>
    <p class="mf-name">${m.name}</p>
    <p class="mf-role">${m.role}</p>
    <p class="mf-line">${m.cardLine}</p>
    <div class="staff-subj">${subj}</div>
    <span class="staff-more">소개 · 인터뷰 보기 →</span>
  </a>`;
}

// 플립 카드 내부 HTML (landing.js · mentors.js 공용). featured=true 면 노란 강조 카드.
function mentorCardInner(id, featured) {
  const m = MENTORS[id];
  const photoCls = featured ? 'mf-photo mf-photo-feat' : 'mf-photo';
  const photoStyle = featured ? '' : ` style="background:${m.grad};"`;
  const ribbon = featured ? '<span class="mf-ribbon">대표 멘토</span>' : '';
  const badgeCls = featured ? 'mf-badge mf-badge-feat' : 'mf-badge';
  const plusCls = featured ? 'mf-plus mf-plus-feat' : 'mf-plus';
  const photo = m.photo
    ? `<div class="${photoCls}"><img class="mf-pic" src="${m.photo}" alt="${m.name}" loading="lazy"></div>`
    : `<div class="${photoCls}"${photoStyle}><span class="mf-init">${m.avatar}</span></div>`;
  const tl = m.timeline.map(t => `<li><b>${t.year}</b><span>${t.text}</span></li>`).join('');
  const subj = m.subjects.map(s => `<span>${s}</span>`).join('');
  return `<a class="flip-inner" href="mentor.html?id=${id}">
    <div class="flip-face flip-front">
      ${ribbon}
      ${photo}
      <span class="${plusCls}" aria-hidden="true">+</span>
      <div class="mf-body">
        <span class="${badgeCls}">${m.badges.join(' · ')}</span>
        <p class="mf-name">${m.name}</p>
        <p class="mf-role">${m.role}</p>
        <p class="mf-line">${m.cardLine}</p>
      </div>
    </div>
    <div class="flip-face flip-back">
      <p class="mb-name">${m.name}</p>
      <p class="mb-role">${m.role}</p>
      <ul class="mb-timeline">${tl}</ul>
      <div class="mb-subjects">${subj}</div>
      <span class="mb-more">전체 이력 · 인터뷰 보기 →</span>
    </div>
  </a>`;
}
