import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';

import { API_BASE_URL } from '@/lib/auth-client';
import { authHeaders, authenticatedFetch } from '@/lib/session';

type UploadFileLike = {
  uri: string;
  name: string;
  mimeType?: string;
  width?: number;
  file?: File | Blob;
};

/** 업로드 전 큰 사진은 긴 변 기준 다운스케일 + JPEG 압축 (네이티브). */
const MAX_IMAGE_DIM = 1600;
async function downscaleImage(
  fileLike: UploadFileLike,
): Promise<{ uri: string; mimeType: string; name: string }> {
  const type = fileLike.mimeType || '';
  if (
    Platform.OS === 'web' ||
    !type.startsWith('image/') ||
    !fileLike.width ||
    fileLike.width <= MAX_IMAGE_DIM
  ) {
    return { uri: fileLike.uri, mimeType: type, name: fileLike.name };
  }
  try {
    const result = await manipulateAsync(
      fileLike.uri,
      [{ resize: { width: MAX_IMAGE_DIM } }],
      { compress: 0.7, format: SaveFormat.JPEG },
    );
    return {
      uri: result.uri,
      mimeType: 'image/jpeg',
      name: fileLike.name.replace(/\.[^.]+$/, '') + '.jpg',
    };
  } catch {
    return { uri: fileLike.uri, mimeType: type, name: fileLike.name };
  }
}

/**
 * 미디어 업로드 공용 함수.
 *
 * 이 앱의 전역 fetch 는 Expo winter(WinterCG) fetch 라, FormData 파트로 RN 의
 * `{ uri, name, type }` 도, ArrayBuffer 로 만든 Blob(RN Blob 제약)도 보낼 수 없다.
 * 따라서 네이티브에서는 expo-file-system 의 멀티파트 uploadAsync 로 파일을 직접 올린다.
 * 웹에서는 표준 File/Blob + fetch 를 사용한다.
 */
async function uploadMobileFile(
  fileLike: UploadFileLike,
  params: Record<string, string>,
): Promise<MobileAttachment & { id?: string }> {
  const type = fileLike.mimeType || 'application/octet-stream';

  if (Platform.OS === 'web') {
    const blob =
      fileLike.file ?? (await (await fetch(fileLike.uri)).blob());
    const formData = new FormData();
    formData.append('file', blob, fileLike.name);
    for (const [key, value] of Object.entries(params)) {
      formData.append(key, value);
    }
    const response = await authenticatedFetch('/api/mobile/v1/media', {
      body: formData,
      method: 'POST',
    });
    const body = (await response.json().catch(() => null)) as
      | (MobileAttachment & { id?: string; error?: never })
      | { error?: string }
      | null;
    if (!response.ok || !body || 'error' in body) {
      throw new MobileApiError(
        (body as { error?: string } | null)?.error ?? '파일을 업로드하지 못했습니다.',
      );
    }
    return body as MobileAttachment & { id?: string };
  }

  const scaled = await downscaleImage(fileLike);
  const headers = authHeaders();
  const result = await FileSystemLegacy.uploadAsync(
    `${API_BASE_URL}/api/mobile/v1/media`,
    scaled.uri,
    {
      fieldName: 'file',
      httpMethod: 'POST',
      mimeType: scaled.mimeType || type,
      parameters: params,
      uploadType: FileSystemLegacy.FileSystemUploadType.MULTIPART,
      ...(headers ? { headers } : {}),
    },
  );
  let body: (MobileAttachment & { id?: string; error?: string }) | null = null;
  try {
    body = JSON.parse(result.body || 'null');
  } catch {
    body = null;
  }
  if (result.status < 200 || result.status >= 300 || !body || body.error) {
    throw new MobileApiError(body?.error ?? '파일을 업로드하지 못했습니다.');
  }
  return body;
}

export type MobileAttachment = {
  id?: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
  url: string;
};

export type MobileTaskFile = MobileAttachment;

export type StudentTasksResponse = {
  items: MobileTaskSummary[];
  summary: {
    done: number;
    needsRevision: number;
    open: number;
  };
};

export type MobileTaskSummary = {
  description: string | null;
  dueDate: string;
  format: string | null;
  id: string;
  scoreWeight: number | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'SUBMITTED' | 'NEEDS_REVISION' | 'DONE';
  statusLabel: string;
  subject: string;
  submissionCount: number;
  title: string;
};

export type MobileTaskDetail = Omit<MobileTaskSummary, 'submissionCount'> & {
  student?: {
    grade: string;
    id: string;
    name: string;
    school: string | null;
  };
  submissions: MobileTaskSubmission[];
};

export type MobileTaskSubmission = {
  feedbacks: {
    authorName: string;
    content: string;
    createdAt: string;
    files: MobileTaskFile[];
    id: string;
    status: 'COMMENT' | 'NEEDS_REVISION' | 'APPROVED';
  }[];
  files: MobileTaskFile[];
  id: string;
  note: string | null;
  submittedAt: string;
  version: number;
};

export type StaffTasksResponse = {
  items: {
    dueDate: string;
    id: string;
    latestSubmission: {
      feedbackCount: number;
      id: string;
      submittedAt: string;
      version: number;
    } | null;
    status: MobileTaskSummary['status'];
    statusLabel: string;
    student: {
      grade: string;
      id: string;
      name: string;
    };
    subject: string;
    title: string;
  }[];
  summary: {
    done: number;
    needsFeedback: number;
    needsRevision: number;
  };
};

export type StudentOverviewResponse = {
  isOnlineManaged: boolean;
  nextSession: {
    durationMinutes: number;
    hostName: string;
    id: string;
    meetUrl: string | null;
    scheduledAt: string;
    title: string;
  } | null;
  nextTask: {
    dueDate: string;
    id: string;
    status: string;
    statusLabel: string;
    subject: string;
    title: string;
  } | null;
  stats: {
    doneTasks: number;
    openQuestions: number;
    openTasks: number;
    totalTasks: number;
    unreadFeedbacks: number;
    unreadQuestions: number;
  };
};

export type StudentQuestionsResponse = {
  questions: {
    hasAttachments: boolean;
    hasUnreadAnswer: boolean;
    id: string;
    lastMessage: string;
    lastMessageAt: string;
    lastSenderType: 'STUDENT' | 'STAFF' | null;
    status: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'ARCHIVED';
    subject: string | null;
    title: string;
  }[];
};

export type ChatPartner = { id: string; name: string; roleLabel: string };

export type ChatSummary = {
  id: string;
  partner: ChatPartner;
  lastMessage: {
    content: string;
    senderType: 'STUDENT' | 'STAFF';
    createdAt: string;
    hasAttachments: boolean;
  } | null;
  lastMessageAt: string | null;
  unread: number;
};

export type ChatListResponse = { chats: ChatSummary[] };

export type ChatMessage = {
  id: string;
  mine: boolean;
  senderType: 'STUDENT' | 'STAFF';
  content: string;
  attachments: MobileAttachment[];
  createdAt: string;
};

export type ChatThreadResponse = {
  chatId: string;
  partner: ChatPartner;
  messages: ChatMessage[];
};

export type QuestionThreadResponse = {
  messages: {
    attachments: MobileAttachment[];
    content: string;
    createdAt: string;
    id: string;
    senderName: string;
    senderType: 'STUDENT' | 'STAFF';
  }[];
  question: {
    claimedBy?: { id: string; name: string } | null;
    createdAt: string;
    id: string;
    status: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'ARCHIVED';
    student?: {
      grade: string;
      id: string;
      name: string;
      school: string | null;
    };
    subject: string | null;
    title: string;
  };
};

export type StaffOperationsResponse = {
  clock: {
    isWorking: boolean;
    lastTag: WorkTagView | null;
    recentTags: WorkTagView[];
  };
  handovers: {
    today: number;
    unread: number;
  };
  month: {
    month: number;
    ownerConfirmedAt: string | null;
    staffConfirmedAt: string | null;
    totalMinutes: number;
    totalWage: number;
    year: number;
  };
  patrol: {
    checkedCount: number;
    id: string;
    label: string | null;
    rosterCount: number;
    startedAt: string;
  } | null;
};

export type WorkTagView = {
  id: string;
  note: string | null;
  taggedAt: string;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
};

export type StaffHandoversResponse = {
  items: {
    authorId: string;
    authorName: string;
    category: string | null;
    checklist: {
      id: string;
      isChecked: boolean;
      title: string;
    }[];
    content: string;
    createdAt: string;
    date: string;
    id: string;
    isPinned: boolean;
    isRead: boolean;
    priority: 'URGENT' | 'NORMAL';
    readCount: number;
    recipientName: string | null;
    tasks: {
      assigneeName: string | null;
      id: string;
      isCompleted: boolean;
      title: string;
    }[];
  }[];
};

export type StaffPatrolResponse = {
  activeRound: {
    id: string;
    label: string | null;
    startedAt: string;
  } | null;
  allStudents: PatrolStudent[];
  patrollerName: string;
  records: {
    checkedAt: string;
    id: string;
    note: string | null;
    seat: string | null;
    status: 'OK' | 'NOTE' | 'ABSENT';
    studentId: string;
    studentName: string;
  }[];
  roster: PatrolStudent[];
};

export type PatrolStudent = {
  grade: string;
  id: string;
  name: string;
  seat: string | null;
};

export type StaffOverviewResponse = {
  date: string;
  priorities: {
    lateStudents: number;
    openQuestions: number;
  };
  stats: {
    currentAttendance: number;
    openQuestions: number;
    todayMentoring: number;
  };
};

export type MobileOuting = {
  sequence: number;
  reason: string | null;
  planned: boolean;
  start: string | null;
  end: string | null;
  status: '예정' | '외출중' | '복귀';
};

export type StaffAttendanceItem = {
  attendanceType: string | null;
  grade: string;
  id: string;
  isLate: boolean;
  name: string;
  note: string | null;
  outingActive: boolean;
  outings: MobileOuting[];
  scheduleStart: string | null;
  scheduleEnd: string | null;
  seat: string | null;
  status: '입실' | '외출' | '퇴실' | '미입실' | '결석';
  time: string | null;
};

export type StaffAttendanceResponse = {
  date: string;
  items: StaffAttendanceItem[];
  summary: {
    absent: number;
    away: number;
    late: number;
    outing: number;
    present: number;
    total: number;
    withNote: number;
  };
};

export type StaffMentoringResponse = {
  items: {
    grade: string;
    id: string;
    mentorName: string;
    mode: string;
    scheduledAt: string;
    status: '예정' | '기록 필요';
    studentId: string;
    studentName: string;
  }[];
  summary: {
    needsRecord: number;
    today: number;
  };
};

export type MentoringRecordResponse = {
  content: string | null;
  id: string;
  improvements: string | null;
  nextGoals: string | null;
  notes: string | null;
  scheduledAt: string;
  scheduledTimeStart: string | null;
  status: string;
  student: {
    grade: string;
    id: string;
    mentoringNotes: string | null;
    name: string;
    school: string | null;
  };
  weaknesses: string | null;
};

export type StaffQuestionsResponse = {
  items: {
    attachmentCount: number;
    createdAt: string;
    grade: string;
    id: string;
    lastMessage: string;
    lastMessageAt: string;
    studentId: string;
    studentName: string;
    subject: string | null;
    title: string;
  }[];
  summary: {
    open: number;
    overdue: number;
  };
};

// ─── 단어시험 (vocab) ───
export type VocabAttemptSummary = {
  id: string;
  title: string;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  statusLabel: string;
  questionCount: number;
  perQuestionSeconds: number;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  assignedAt: string;
  submittedAt: string | null;
};

export type VocabListResponse = {
  items: VocabAttemptSummary[];
  summary: { todo: number; inProgress: number; done: number };
};

export type VocabRunnerItem = {
  id: string;
  order: number;
  direction: 'EN_TO_KO' | 'KO_TO_EN';
  prompt: string;
};

export type VocabRunnerState = {
  attemptId: string;
  status: 'in_progress' | 'submitted';
  perQuestionSeconds: number;
  examTitle: string;
  items: VocabRunnerItem[];
  resumeFromOrder: number;
};

export type VocabFinalizeResult = {
  attemptId: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
};

export type VocabResultItem = {
  id: string;
  order: number;
  direction: 'EN_TO_KO' | 'KO_TO_EN';
  prompt: string;
  word: string;
  meanings: string[];
  studentAnswer: string | null;
  isCorrect: boolean | null;
  answer: string;
};

export type VocabResultResponse = {
  id: string;
  title: string;
  status: string;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  submittedAt: string | null;
  durationMs: number | null;
  items: VocabResultItem[];
};

// ─── 받은 피드백 ───
export type StudentFeedbackItem = {
  id: string;
  content: string;
  status: 'COMMENT' | 'NEEDS_REVISION' | 'APPROVED';
  isNew: boolean;
  authorName: string;
  taskId: string;
  taskTitle: string;
  subject: string;
  version: number;
  fileCount: number;
  createdAt: string;
};

export type StudentFeedbackResponse = {
  items: StudentFeedbackItem[];
  summary: { total: number; unread: number };
};

// ─── 건의사항 ───
export type SuggestionCategory = 'FACILITY' | 'CLASS' | 'OPERATION' | 'ETC';
export type SuggestionStatus =
  | 'RECEIVED'
  | 'REVIEWING'
  | 'REFLECTED'
  | 'DECLINED';

export type SuggestionItem = {
  id: string;
  category: SuggestionCategory;
  categoryLabel: string;
  title: string;
  content: string;
  status: SuggestionStatus;
  statusLabel: string;
  staffReply: string | null;
  handledByName: string | null;
  handledAt: string | null;
  createdAt: string;
  hasUnseenUpdate: boolean;
};

export type SuggestionListResponse = {
  items: SuggestionItem[];
  summary: { total: number; unseen: number };
};

// ─── 온보딩 설문 ───
export type SurveySectionPayload = {
  key: string;
  kind:
    | 'text'
    | 'performance'
    | 'history'
    | 'goals'
    | 'admissionType'
    | 'strengthsWeaknesses';
  title: string;
  description: string;
  placeholder?: string;
  value: unknown;
  complete: boolean;
};

export type SurveyResponse = {
  submittedAt: string | null;
  gradeNumber: 1 | 2 | 3 | null;
  complete: boolean;
  sections: SurveySectionPayload[];
};

export type SurveySaveResponse = {
  ok: boolean;
  sectionComplete: boolean;
  surveyComplete: boolean;
};

export class MobileApiError extends Error {}

export async function requestMobileApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(path, {
    cache: 'no-store',
    ...init,
  });
  const body = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new MobileApiError(body?.error ?? '데이터를 불러오지 못했습니다.');
  }

  return body as T;
}

export function mutateMobileApi<T>(
  path: string,
  method: 'PATCH' | 'POST',
  body: unknown,
) {
  return requestMobileApi<T>(path, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });
}

export async function uploadMobileMedia(
  asset: ImagePickerAsset,
  options:
    | { context: 'question' }
    | {
        context: 'mentoring';
        mentoringId: string;
        tag?: 'KDA' | 'EXTRA' | 'FREE';
      },
): Promise<MobileAttachment & { id?: string }> {
  const params: Record<string, string> = { context: options.context };
  if (options.context === 'mentoring') {
    params.mentoringId = options.mentoringId;
    params.tag = options.tag ?? 'FREE';
  }
  return uploadMobileFile(
    {
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}.jpg`,
      mimeType: asset.mimeType || 'image/jpeg',
      width: asset.width,
      file: asset.file,
    },
    params,
  );
}

export async function uploadMobileTaskFile(
  asset: DocumentPickerAsset,
  options:
    | { context: 'task'; taskId: string }
    | { context: 'feedback'; submissionId: string },
): Promise<MobileTaskFile> {
  const params: Record<string, string> = { context: options.context };
  if (options.context === 'task') params.taskId = options.taskId;
  else params.submissionId = options.submissionId;
  return uploadMobileFile(
    {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? undefined,
      file: asset.file,
    },
    params,
  );
}

/**
 * 채팅 첨부 업로드 — 사진(ImagePicker)·문서(DocumentPicker) 공용.
 * 호출 측에서 ImagePickerAsset/DocumentPickerAsset 을 공통 shape 로 정규화해 전달.
 */
export async function uploadMobileChatFile(
  fileLike: UploadFileLike,
  chatId: string,
): Promise<MobileAttachment> {
  return uploadMobileFile(fileLike, { context: 'chat', chatId });
}

/** 질문(Q&A) 문서 첨부 업로드 — PDF/HWP/DOC/PPT/XLSX 등. 이미지는 AttachmentPicker 사용. */
export async function uploadMobileQuestionFile(
  fileLike: UploadFileLike,
): Promise<MobileAttachment> {
  return uploadMobileFile(fileLike, { context: 'question' });
}

export function useMobileQuery<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const nextData = await requestMobileApi<T>(path);
        setData(nextData);
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : '데이터를 불러오지 못했습니다.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [path],
  );

  useEffect(() => {
    let active = true;

    void requestMobileApi<T>(path)
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(
          nextError instanceof Error ? nextError.message : '데이터를 불러오지 못했습니다.',
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path]);

  // 화면 재포커스 시 조용히 재조회 — 다른 화면에서 읽음 처리된 미확인 배지 등이
  // 돌아왔을 때 즉시 반영되도록(스피너 없이 백그라운드 갱신). 최초 포커스는 위 마운트
  // 이펙트가 처리하므로 건너뛴다.
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      let active = true;
      void requestMobileApi<T>(path)
        .then((nextData) => {
          if (active) setData(nextData);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [path]),
  );

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    refresh,
    retry: load,
  };
}
