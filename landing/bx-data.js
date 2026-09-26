// ══ 강한선배 사이트 공용 데이터 ══
// 모든 페이지가 같은 숫자·대학 목록을 쓰도록 한 곳에서 관리한다. (landing.js 보다 먼저 로드)

// 재원생 합격·재학 대학 — logos/{file}.png. 서열순.
const UNIS = [
  { name: '서울대', full: '서울대학교', file: 'snu' },
  { name: '연세대', full: '연세대학교', file: 'yonsei' },
  { name: '고려대', full: '고려대학교', file: 'korea' },
  { name: '포스텍', full: '포항공과대학교', file: 'postech' },
  { name: '카이스트', full: 'KAIST', file: 'kaist' },
  { name: '서강대', full: '서강대학교', file: 'sogang' },
  { name: '성균관대', full: '성균관대학교', file: 'skku' },
  { name: '한양대', full: '한양대학교', file: 'hanyang' },
  { name: '이화여대', full: '이화여자대학교', file: 'ewha' },
  { name: '중앙대', full: '중앙대학교', file: 'cau' },
  { name: '경희대', full: '경희대학교', file: 'khu' },
  { name: '한국외대', full: '한국외국어대학교', file: 'hufs' },
  { name: '서울시립대', full: '서울시립대학교', file: 'uos' },
];

// 관리 성과 — 숫자를 바꿀 땐 여기만 수정
const STATS = {
  reenroll: { value: 93.3, dec: 1, unit: '%', label: '재등록률', sub: '한 번 온 학생은 대부분 계속 다닙니다' },
  rise: { value: 90, unit: '%', label: '성적 상승', sub: '재원생 10명 중 9명은 성적이 올랐습니다' },
  inSeoul: { value: 67, unit: '%', label: '인서울 합격', sub: '재원생 3명 중 2명이 인서울 대학 합격' },
  students: { value: 92, unit: '명', label: '현재 재원생', sub: '대기 50석 · 오픈 3개월 만의 기록' },
  mentoring: { value: 1031, unit: '회', label: '누적 1:1 멘토링', sub: '담임 멘토가 직접 진행' },
  reports: { value: 710, unit: '건', label: '발송한 관리 리포트', sub: '매달 학부모님께 보내드립니다' },
  records: { value: 1227, unit: '건', label: '생활 관리 기록', sub: '출결 · 순찰 · 상벌점' },
};

// 후기 — 어드민 '후기'가 발행되기 전까지 쓰는 기본값 (예시)
const REVIEWS = [
  { who: '학부모님', meta: '고2 학부모 · 김OO님', ava: '👩', tag: '월간 리포트',
    text: '매달 오는 리포트로 아이가 뭘 하는지 다 보여요. 잔소리가 줄고 응원이 늘었습니다. 그게 의외로 큰 힘이 됐어요.' },
  { who: '재원생', meta: '고3 · 이OO', ava: '🧑‍🎓', tag: '담임 멘토링',
    text: '슬럼프로 포기하고 싶었는데 담임 멘토 선배가 멘탈까지 챙겨주셔서 끝까지 갈 수 있었어요.' },
  { who: '학부모님', meta: '고1 학부모 · 박OO님', ava: '🧑', tag: '출결·순찰',
    text: '아이가 몇 시에 와서 얼마나 앉아 있었는지까지 공유돼요. 학원만 돌릴 때랑은 마음 놓이는 정도가 완전히 달라요.' },
  { who: '재원생', meta: '재수생 · 정OO', ava: '🧑‍🎓', tag: '교시제 학습',
    text: '교시제로 하루가 칼같이 굴러가요. 혼자선 절대 못 지켰을 루틴을 매일 지키게 되니 공부량 자체가 달라졌습니다.' },
  { who: '학부모님', meta: '고3 학부모 · 최OO님', ava: '👩', tag: '상벌점 관리',
    text: '잘한 것도 못한 것도 점수로 다 보여서 믿음이 갑니다. 막연히 "열심히 한대요"가 아니라 기록이 남아요.' },
];

// 성적 상승 카드 (예시) — trend: 월별 등급 (1이 최상)
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

// 네비게이션 — 모든 페이지 공통. 네비는 항상 페이지 이동(앵커 없음).
const SITE_NAV = [
  { key: 'about', label: '강한선배 소개', href: 'director.html' },
  { key: 'program', label: '관리 시스템', href: 'program.html' },
  { key: 'results', label: '합격 결과', href: 'results.html' },
  { key: 'mentors', label: '선배 멘토진', href: 'mentors.html' },
  { key: 'space', label: '학습 공간', href: 'space.html' },
  { key: 'stories', label: '강한 이야기', href: 'stories.html' },
  { key: 'winter', label: '윈터스쿨', href: 'recruit.html', badge: 'N' },
];
const SITE = {
  apply: 'https://khsb.vercel.app/apply',
  tel: '010-3145-5767',
  api: 'https://khsb.vercel.app',
  address: '경기 화성시 동탄반석로 130 (드림프라자) 10F',
  email: 'kanghanseonbae@naver.com',
};
