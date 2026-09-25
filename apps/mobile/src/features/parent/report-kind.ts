import {
  CalendarRange,
  ClipboardList,
  FileText,
  Laptop,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react-native';

import type { Tone } from '@/design';
import type { ParentReportKind } from '@/lib/api/parent-reports';

/** 리포트 종류별 이름·필터 칩 문구·아이콘 타일 */
export const REPORT_KIND: Record<
  ParentReportKind,
  { label: string; chip: string; icon: LucideIcon; tone: Tone }
> = {
  mentoring: { label: '멘토링 리포트', chip: '멘토링', icon: FileText, tone: 'brand' },
  monthly: { label: '월간 리포트', chip: '월간', icon: CalendarRange, tone: 'info' },
  online: { label: '온라인 관리 보고서', chip: '온라인 관리', icon: Laptop, tone: 'violet' },
  'study-plan': { label: '공부 계획', chip: '공부 계획', icon: ClipboardList, tone: 'ok' },
  consultation: { label: '상담 안내', chip: '상담', icon: MessagesSquare, tone: 'warn' },
};

export const REPORT_KIND_ORDER: ParentReportKind[] = [
  'mentoring',
  'monthly',
  'online',
  'study-plan',
  'consultation',
];

export function isReportKind(value: unknown): value is ParentReportKind {
  return typeof value === 'string' && (REPORT_KIND_ORDER as string[]).includes(value);
}
