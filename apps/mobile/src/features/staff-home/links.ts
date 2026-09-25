import {
  Armchair,
  Bell,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  Inbox,
  Megaphone,
  MessageSquareText,
  ScanLine,
  Search,
  ShieldCheck,
  Smartphone,
  SpellCheck,
  Stamp,
  TimerReset,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native';

import type { Href } from 'expo-router';

import type { Tone } from '@/design';
import type { StaffCapabilities } from '@/lib/capabilities';

// 직원 화면 이동 목록 — 홈 바로가기와 전체 탭이 같이 쓴다.
// 노출 조건은 서버 가드와 같은 capability 로만 판단한다(역할 배열 하드코딩 금지).
//  · offlineOps  = requireMobileStaff 계열 (자습실 운영)
//  · always      = requireMobileAnyStaff 계열 (공지·일정·수행평가 등)
//  · fullAccess  = 원장 전용

export type StaffDest =
  | 'students'
  | 'seatMap'
  | 'phoneCheck'
  | 'patrol'
  | 'handover'
  | 'approvals'
  | 'suggestions'
  | 'lunch'
  | 'tasks'
  | 'vocab'
  | 'parentReports'
  | 'announcements'
  | 'calendar'
  | 'broadcast'
  | 'work'
  | 'inbox'
  | 'notifications'
  | 'account';

type DestDef = {
  label: string;
  /** 바로가기 타일용 짧은 이름 */
  short?: string;
  icon: LucideIcon;
  tone: Tone;
  href: Href;
  can: (caps: StaffCapabilities) => boolean;
};

/**
 * 경로 문자열 → Href. 다른 에이전트가 만드는 화면(학생·승인함 등)은 타입 라우트 생성 전에도
 * 컴파일되도록 한 곳에서만 캐스팅한다. 경로는 항상 그룹 접두사 포함.
 */
export function route(path: string): Href {
  return path as Href;
}

const always = () => true;
const offline = (c: StaffCapabilities) => c.offlineOps;

export const STAFF_DEST: Record<StaffDest, DestDef> = {
  students: { label: '학생 검색', icon: Search, tone: 'info', href: route('/(staff)/students'), can: offline },
  seatMap: { label: '좌석 현황', icon: Armchair, tone: 'ok', href: route('/(staff)/seat-map'), can: offline },
  phoneCheck: { label: '휴대폰 체크', short: '휴대폰', icon: Smartphone, tone: 'violet', href: route('/(staff)/phone-check'), can: offline },
  patrol: { label: '순찰', icon: ScanLine, tone: 'brand', href: route('/(staff)/patrol'), can: offline },
  handover: { label: '인수인계', icon: ClipboardList, tone: 'warn', href: route('/(staff)/handover'), can: offline },
  approvals: { label: '승인함', icon: Stamp, tone: 'brand', href: route('/(staff)/approvals'), can: offline },
  suggestions: { label: '건의사항', icon: MessageSquareText, tone: 'warn', href: route('/(staff)/suggestions'), can: offline },
  lunch: { label: '점심 도시락', short: '점심', icon: Utensils, tone: 'warn', href: route('/(staff)/lunch'), can: offline },
  // 수행평가 — 서버 /staff/tasks 가 전 직원(requireMobileAnyStaff, 담당 학생 범위)
  tasks: { label: '수행평가', icon: BookOpenCheck, tone: 'info', href: route('/(staff)/tasks'), can: always },
  vocab: { label: '영단어 시험', short: '영단어', icon: SpellCheck, tone: 'info', href: route('/(staff)/vocab'), can: offline },
  parentReports: { label: '학부모 리포트', short: '리포트', icon: FileText, tone: 'violet', href: route('/(staff)/parent-reports'), can: offline },
  announcements: { label: '공지', icon: Megaphone, tone: 'brand', href: route('/(staff)/announcements'), can: always },
  calendar: { label: '일정', icon: CalendarDays, tone: 'ok', href: route('/(staff)/calendar'), can: always },
  broadcast: { label: '단체 알림 보내기', short: '단체 알림', icon: BellRing, tone: 'bad', href: route('/(staff)/broadcast'), can: (c) => c.fullAccess },
  // 본인 출퇴근·급여 — 서버 /staff/operations 가 오프라인 운영진(requireMobileStaff) 기준
  work: { label: '출퇴근·급여', short: '출퇴근', icon: TimerReset, tone: 'info', href: route('/(staff)/work'), can: offline },
  inbox: { label: '소통', icon: Inbox, tone: 'info', href: route('/(staff)/(tabs)/inbox'), can: always },
  notifications: { label: '알림 설정', icon: Bell, tone: 'gray', href: route('/notifications'), can: always },
  account: { label: '계정·보안', icon: ShieldCheck, tone: 'gray', href: route('/account'), can: always },
};

export function canOpen(caps: StaffCapabilities | null, dest: StaffDest) {
  return !!caps && STAFF_DEST[dest].can(caps);
}

/** 역할 표시 이름 (표시 전용 — 권한 판단에 쓰지 않는다). 서버 ROLE_DISPLAY 와 같은 문구 */
export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: '시스템 관리자',
  DIRECTOR: '원장',
  HEAD_MENTOR: '총괄 멘토',
  MENTOR: '멘토',
  STAFF: '운영조교',
  CONSULTANT: '컨설턴트',
  MANAGER_MENTOR: '관리 멘토',
};
