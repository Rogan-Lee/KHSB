import { Platform } from 'react-native';
import * as FileSystemLegacy from 'expo-file-system/legacy';

import { authenticatedFetch } from '@/lib/session';

/**
 * Vercel Blob 직접 업로드 (대용량 전용).
 *
 * /api/mobile/v1/media 는 파일 바디가 Vercel 함수를 통과해 실질 ~4.5MB 한도가 있다.
 * 그 이상은 /api/mobile/v1/media/client-token 에서 서버가 pathname·mime·크기를 고정한
 * 클라이언트 토큰을 받아 클라 → Blob API 로 raw PUT 한다.
 *
 * RN 에서는 @vercel/blob/client SDK(웹 전용 upload() 헬퍼)를 못 쓰므로 SDK 와 동일한
 * 프로토콜로 직접 요청한다: PUT {BLOB_API_URL}/?pathname=... + Bearer 클라이언트 토큰.
 */

/** 이 크기 이하는 기존 서버 경유 라우트를 그대로 사용 (Vercel 한도 내). */
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024;

// @vercel/blob v2.3 SDK 와 동일한 엔드포인트/버전 (node_modules/@vercel/blob dist 참조)
const BLOB_API_URL = 'https://vercel.com/api/blob';
const BLOB_API_VERSION = '12';

type DirectUploadInput = {
  uri: string;
  name: string;
  mimeType: string;
  /** 웹 전용 — 이미 확보된 Blob/File. 네이티브에서는 uri 로 파일을 읽는다. */
  blob?: Blob;
};

type DirectUploadResult = {
  mimeType: string;
  name: string;
  sizeBytes: number;
  url: string;
};

async function nativeFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystemLegacy.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
}

/**
 * 파일이 크면 blob 직접 업로드를 수행하고, 아니면 null 을 반환한다(호출부가 기존
 * 서버 경유 업로드로 폴백). mentoring 컨텍스트는 업로드 후 Photo 레코드 생성이
 * 레거시 라우트에 있어 항상 null (멘토링 사진은 다운스케일되어 한도 내).
 */
export async function uploadLargeFileDirect(
  input: DirectUploadInput,
  params: Record<string, string>,
): Promise<DirectUploadResult | null> {
  if (params.context === 'mentoring') return null;

  const sizeBytes = input.blob
    ? input.blob.size
    : await nativeFileSize(input.uri);
  if (sizeBytes === null || sizeBytes <= DIRECT_UPLOAD_THRESHOLD_BYTES) {
    return null;
  }

  // 1) 업로드 토큰 발급 — 세션 인증 + 컨텍스트 인가는 서버가 수행
  const tokenResponse = await authenticatedFetch(
    '/api/mobile/v1/media/client-token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: params.context,
        filename: input.name,
        mimeType: input.mimeType,
        sizeBytes,
        taskId: params.taskId,
        submissionId: params.submissionId,
        chatId: params.chatId,
      }),
    },
  );
  const tokenBody = (await tokenResponse.json().catch(() => null)) as
    | { clientToken?: string; contentType?: string; pathname?: string; error?: string }
    | null;
  if (!tokenResponse.ok || !tokenBody?.clientToken || !tokenBody.pathname) {
    throw new Error(tokenBody?.error ?? '업로드 준비에 실패했습니다.');
  }

  // 2) 클라 → Blob 직접 PUT (파일 바디가 Vercel 함수를 거치지 않음)
  const putUrl = `${BLOB_API_URL}/?pathname=${encodeURIComponent(tokenBody.pathname)}`;
  const contentType = tokenBody.contentType ?? input.mimeType;
  const headers = {
    authorization: `Bearer ${tokenBody.clientToken}`,
    'x-api-version': BLOB_API_VERSION,
    'x-vercel-blob-access': 'public',
    'x-content-type': contentType,
  };

  let result: { url?: string } | null = null;
  if (Platform.OS === 'web') {
    const response = await fetch(putUrl, {
      body: input.blob,
      headers,
      method: 'PUT',
    });
    if (!response.ok) {
      throw new Error('파일을 업로드하지 못했습니다.');
    }
    result = (await response.json().catch(() => null)) as { url?: string } | null;
  } else {
    // 네이티브: 파일을 메모리에 올리지 않고 디스크에서 스트리밍 업로드
    const uploaded = await FileSystemLegacy.uploadAsync(putUrl, input.uri, {
      headers,
      httpMethod: 'PUT',
      uploadType: FileSystemLegacy.FileSystemUploadType.BINARY_CONTENT,
    });
    if (uploaded.status < 200 || uploaded.status >= 300) {
      throw new Error('파일을 업로드하지 못했습니다.');
    }
    try {
      result = JSON.parse(uploaded.body || 'null');
    } catch {
      result = null;
    }
  }

  if (!result?.url) {
    throw new Error('파일을 업로드하지 못했습니다.');
  }

  return {
    mimeType: input.mimeType,
    name: input.name,
    sizeBytes,
    url: result.url,
  };
}
