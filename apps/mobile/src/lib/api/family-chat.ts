// 가족 톡방 — 학생 1명당 방 1개 (학생 + 연결된 학부모 + 운영진 전체).
// 서버: src/lib/family-chat.ts, /api/mobile/v1/{parent,student}/family-chat, /api/mobile/v1/staff/family-chats

import { mutateMobileApi, type MobileAttachment } from '@/lib/mobile-api';

export type FamilyAudience = 'parent' | 'student' | 'staff';
export type FamilySenderKind = 'STUDENT' | 'PARENT' | 'STAFF' | 'SYSTEM';

export type FamilyChatMessage = {
  id: string;
  mine: boolean;
  senderKind: FamilySenderKind;
  /** SYSTEM 은 null */
  senderId: string | null;
  /** "어머니", "김민수 멘토", "홍길동", "자동 알림" */
  senderName: string;
  content: string;
  attachments: MobileAttachment[];
  createdAt: string;
};

export type FamilyChatMembers = {
  student: { id: string; name: string; grade: string; school: string | null; status: string };
  parents: { id: string; name: string }[];
};

export type FamilyChatThreadResponse = {
  chatId: string;
  studentId: string;
  hasMore: boolean;
  messages: FamilyChatMessage[];
  /** after 로 부르면 null */
  members: FamilyChatMembers | null;
};

/** 직원 방 목록 한 줄 */
export type FamilyChatRoom = {
  studentId: string;
  name: string;
  grade: string;
  school: string | null;
  seat: string | null;
  isOnlineManaged: boolean;
  isMine: boolean;
  parentCount: number;
  unread: boolean;
  lastMessageAt: string | null;
  lastMessage: { senderName: string; content: string } | null;
};

export type FamilyChatRoomsResponse = { rooms: FamilyChatRoom[] };

const V1 = '/api/mobile/v1';
export const STAFF_FAMILY_CHATS_PATH = `${V1}/staff/family-chats`;

function basePath(audience: FamilyAudience, studentId: string | null) {
  if (audience === 'staff') return `${STAFF_FAMILY_CHATS_PATH}/${encodeURIComponent(studentId ?? '')}`;
  return `${V1}/${audience}/family-chat`;
}

/** 대화 조회 경로 — 인자 없으면 최신 페이지(읽음 처리), before 는 위로 더 보기, after 는 증분 */
export function familyChatPath(
  audience: FamilyAudience,
  studentId: string | null,
  page: { before?: string; after?: string; summary?: boolean } = {},
) {
  const q: string[] = [];
  if (page.summary) q.push('summary=1');
  if (audience === 'parent' && studentId) q.push(`studentId=${encodeURIComponent(studentId)}`);
  if (page.before) q.push(`before=${encodeURIComponent(page.before)}`);
  if (page.after) q.push(`after=${encodeURIComponent(page.after)}`);
  return q.length ? `${basePath(audience, studentId)}?${q.join('&')}` : basePath(audience, studentId);
}

/** 학생 채팅 탭 미리보기 — 마지막 글 1개만, 읽음 처리 없이 (서버 ?summary=1) */
export const FAMILY_PEEK = { summary: true };

export function sendFamilyChatMessage(
  audience: FamilyAudience,
  studentId: string | null,
  body: { content: string; attachments: MobileAttachment[] },
) {
  return mutateMobileApi<{ ok: true; id: string }>(
    basePath(audience, studentId),
    'POST',
    audience === 'parent' ? { ...body, studentId } : body,
  );
}
