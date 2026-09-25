// 학생 질문(Q&A)·메시지(채팅) 클라이언트 타입·함수.
// 서버: src/lib/mobile-student-questions.ts, src/lib/mobile-chat.ts
// 기존 @/lib/mobile-api 타입은 그대로 두고 여기서 확장한다(추가 필드는 모두 선택적으로 다뤄도 안전).

import type { DocumentPickerAsset } from 'expo-document-picker';
import type { ImagePickerAsset } from 'expo-image-picker';

import type { Tone } from '@/design';
import {
  mutateMobileApi,
  uploadMobileQuestionFile,
  type ChatMessage,
  type ChatPartner,
  type ChatSummary,
  type ChatThreadResponse,
  type MobileAttachment,
  type QuestionThreadResponse,
  type StudentQuestionsResponse,
} from '@/lib/mobile-api';

export const STUDENT_QUESTIONS_PATH = '/api/mobile/v1/student/questions';
export const STUDENT_CHATS_PATH = '/api/mobile/v1/student/chats';

// ─── 질문 ────────────────────────────────────────────────────────────

export type QuestionStatus = 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'ARCHIVED';

/** 웹 src/components/portal/status.ts QUESTION_STATUS 와 같은 라벨·톤 */
export const QUESTION_STATUS: Record<QuestionStatus, { label: string; tone: Tone }> = {
  OPEN: { label: '답변 대기', tone: 'warn' },
  ANSWERED: { label: '답변 완료', tone: 'ok' },
  RESOLVED: { label: '해결됨', tone: 'gray' },
  ARCHIVED: { label: '보관됨', tone: 'gray' },
};

/** 웹 질문 작성 폼과 같은 과목 칩 */
export const QUESTION_SUBJECTS = ['수학', '영어', '국어', '과학탐구', '사회탐구', '한국사', '기타'] as const;

export const QUESTION_MAX_ATTACHMENTS = 6;
export const QUESTION_TITLE_MAX = 120;
export const QUESTION_CONTENT_MAX = 4000;

export type StudentQuestionItem = StudentQuestionsResponse['questions'][number] & {
  /** 멘토 답변 미확인 수 */
  unread?: number;
  createdAt?: string;
};

export type StudentQuestionList = { questions: StudentQuestionItem[] };

export type StudentQuestionThread = QuestionThreadResponse & {
  /** 이번 조회로 읽음 처리된 새 답변이 있었는지 (배지 갱신용) */
  hasUnread?: boolean;
};

export type QuestionMessage = QuestionThreadResponse['messages'][number];

export function createStudentQuestion(body: {
  title: string;
  subject: string | null;
  content: string;
  attachments: MobileAttachment[];
}) {
  return mutateMobileApi<{ id: string }>(STUDENT_QUESTIONS_PATH, 'POST', body);
}

export function replyStudentQuestion(
  questionId: string,
  body: { content: string; attachments: MobileAttachment[] },
) {
  return mutateMobileApi<{ ok: true }>(`${STUDENT_QUESTIONS_PATH}/${questionId}/messages`, 'POST', body);
}

// ─── 로컬 첨부 (선택 → 전송 시 업로드) ─────────────────────────────────

/** 기기에서 고른 파일 — 전송 버튼을 누를 때 업로드한다 */
export type LocalAttachment = {
  /** 업로드 캐시 키 (같은 파일 재시도 시 다시 올리지 않음) */
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'video' | 'file';
  width?: number;
  sizeBytes?: number;
  file?: File | Blob;
};

const VIDEO_NAME = /\.(mp4|mov|webm|m4v)$/i;

/** ImagePicker 결과 → 로컬 첨부 */
export function localFromAsset(asset: ImagePickerAsset, index = 0): LocalAttachment {
  const video = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
  const name = asset.fileName || `${video ? 'video' : 'photo'}-${Date.now()}-${index + 1}.${video ? 'mp4' : 'jpg'}`;
  return {
    key: `${asset.assetId ?? asset.uri}-${asset.fileName ?? ''}`,
    uri: asset.uri,
    name,
    mimeType: asset.mimeType || (video ? 'video/mp4' : 'image/jpeg'),
    kind: video ? 'video' : 'image',
    width: video ? undefined : asset.width,
    sizeBytes: asset.fileSize,
    file: asset.file,
  };
}

/** DocumentPicker 결과 → 로컬 첨부 */
export function localFromDocument(asset: DocumentPickerAsset): LocalAttachment {
  const mimeType = asset.mimeType || 'application/octet-stream';
  const kind = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('video/') || VIDEO_NAME.test(asset.name)
      ? 'video'
      : 'file';
  return {
    key: `${asset.uri}-${asset.name}`,
    uri: asset.uri,
    name: asset.name,
    mimeType,
    kind,
    sizeBytes: asset.size,
    file: asset.file,
  };
}

/**
 * 로컬 첨부들을 질문 컨텍스트로 업로드. 이미 올린 파일은 cache 에서 꺼내 재업로드하지 않는다
 * (전송 실패 후 다시 눌러도 blob 에 고아 파일이 쌓이지 않게). 부분 성공분도 캐시에 남는다.
 */
export async function uploadQuestionAttachments(
  items: LocalAttachment[],
  cache: Map<string, MobileAttachment>,
): Promise<MobileAttachment[]> {
  return Promise.all(
    items.map(async (item) => {
      const hit = cache.get(item.key);
      if (hit) return hit;
      const uploaded = await uploadMobileQuestionFile({
        uri: item.uri,
        name: item.name,
        mimeType: item.mimeType,
        width: item.width,
        file: item.file,
      });
      const clean: MobileAttachment = {
        mimeType: uploaded.mimeType,
        name: uploaded.name,
        sizeBytes: uploaded.sizeBytes,
        url: uploaded.url,
      };
      cache.set(item.key, clean);
      return clean;
    }),
  );
}

// ─── 채팅 ────────────────────────────────────────────────────────────

export type ChatPartnerView = ChatPartner & { role?: string };

export type StudentChatItem = Omit<ChatSummary, 'partner'> & {
  partner: ChatPartnerView;
  /** 현재 담당자 여부 (false = 이전 담당자) */
  isCurrentAssignee?: boolean;
};

export type StudentChatList = { chats: StudentChatItem[] };

export type ChatMessageView = ChatMessage & { senderName?: string };

export type ChatThreadView = Omit<ChatThreadResponse, 'messages' | 'partner'> & {
  partner: ChatPartnerView;
  messages: ChatMessageView[];
  /** 더 오래된 메시지가 남아 있음 (?before= 로 불러오기) */
  hasMore?: boolean;
};
