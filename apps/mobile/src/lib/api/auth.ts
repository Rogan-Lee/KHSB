// 로그인·초대 가입·계정 — 응답 타입 + 클라이언트 함수.
// 서버: GET /api/mobile/v1/auth/invitation (src/lib/mobile-invitation.ts), GET /api/mobile/v1/auth/me

import type { Href } from 'expo-router';

import type { Tone } from '@/design';
import { API_BASE_URL } from '@/lib/auth-client';
import type { AppRole, MobileSession } from '@/lib/session';

export type InviteType = 'STAFF' | 'STUDENT' | 'PARENT';

export type MobileInvitation = {
  email: string | null;
  expiresAt: string;
  /** 학생·직원 이름, 학부모 초대는 "{자녀} 학부모" */
  name: string;
  type: InviteType;
  inviterName?: string | null;
  inviterRole?: string | null;
  /** 학부모 초대: 연결될 자녀 이름들 */
  children?: string[];
  relation?: string | null;
};

export const INVITE_TYPE_LABEL: Record<InviteType, string> = {
  STAFF: '직원',
  STUDENT: '학생',
  PARENT: '학부모',
};

export const INVITE_TYPE_TONE: Record<InviteType, Tone> = {
  STAFF: 'info',
  STUDENT: 'brand',
  PARENT: 'ok',
};

/** 역할별 첫 화면 (탭 홈) */
export function roleHome(role: AppRole): Href {
  if (role === 'student') return '/(student)/(tabs)';
  if (role === 'parent') return '/(parent)/(tabs)';
  return '/(staff)/(tabs)';
}

/**
 * 붙여 넣은 글에서 초대 토큰을 찾는다.
 *  · 링크: https://…/sign-up?token=XXXX · studyroom://invite?token=XXXX (카톡 메시지 전체를 붙여 넣어도 됨)
 *  · 코드: 공백 없는 토큰 문자열 그대로
 */
export function extractInviteToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const fromParam = trimmed.match(/[?&]token=([A-Za-z0-9_%-]+)/);
  if (fromParam) {
    try {
      return decodeURIComponent(fromParam[1]);
    } catch {
      return fromParam[1];
    }
  }
  if (/\s/.test(trimmed) || trimmed.includes('://')) return '';
  return /^[A-Za-z0-9_-]{16,}$/.test(trimmed) ? trimmed : '';
}

export class InvitationError extends Error {
  constructor(
    message: string,
    readonly kind: 'invalid' | 'network',
  ) {
    super(message);
  }
}

export async function fetchInvitation(token: string): Promise<MobileInvitation> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/mobile/v1/auth/invitation?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
  } catch {
    throw new InvitationError('네트워크 연결을 확인하고 다시 시도해 주세요.', 'network');
  }
  if (response.status === 404 || response.status === 400) {
    throw new InvitationError(
      '초대가 만료됐거나 이미 사용됐어요. 독서실에 새 초대 링크를 요청해 주세요.',
      'invalid',
    );
  }
  if (!response.ok) {
    throw new InvitationError('초대 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', 'network');
  }
  return (await response.json()) as MobileInvitation;
}

// ─── 계정 표시 ────────────────────────────────────────────────────────

/** 서버 Role → 직책 이름 (src/lib/roles.ts ROLE_DISPLAY 와 동일) */
const STAFF_ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: '시스템 관리자',
  DIRECTOR: '원장',
  ADMIN: '관리자',
  HEAD_MENTOR: '총괄 멘토',
  MENTOR: '멘토',
  STAFF: '운영조교',
  CONSULTANT: '컨설턴트',
  MANAGER_MENTOR: '관리 멘토',
};

export function accountRoleLabel(session: MobileSession): string {
  if (session.role === 'student') return session.isOnlineManaged ? '학생 · 온라인 관리' : '학생';
  if (session.role === 'parent') return '학부모';
  return STAFF_ROLE_LABEL[session.staffRole ?? ''] ?? '직원';
}

export function accountRoleTone(session: MobileSession): Tone {
  if (session.role === 'student') return 'brand';
  if (session.role === 'parent') return 'ok';
  return 'info';
}
