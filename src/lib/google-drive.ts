import { google } from "googleapis";
import { prisma } from "./prisma";

/**
 * Google Drive 클라이언트 — 기존 GoogleCalendarToken (singleton) 의 OAuth 토큰을 재사용.
 * Calendar/Sheets 와 동일한 OAuth scope 에 drive.readonly 가 포함되어야 동작.
 */
export async function getGoogleDriveClient() {
  const token = await prisma.googleCalendarToken.findUnique({ where: { id: "singleton" } });
  if (!token) throw new Error("Google 계정이 연동되지 않았습니다");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
  });

  oauth2Client.on("tokens", async (newTokens) => {
    await prisma.googleCalendarToken.update({
      where: { id: "singleton" },
      data: {
        accessToken: newTokens.access_token!,
        ...(newTokens.refresh_token ? { refreshToken: newTokens.refresh_token } : {}),
        ...(newTokens.expiry_date ? { expiresAt: new Date(newTokens.expiry_date) } : {}),
      },
    });
  });

  return google.drive({ version: "v3", auth: oauth2Client });
}

/**
 * Drive URL 에서 파일/폴더 ID 추출.
 *  - https://drive.google.com/drive/folders/{ID}            → folder
 *  - https://drive.google.com/drive/folders/{ID}?usp=sharing → folder
 *  - https://drive.google.com/file/d/{ID}/view              → file
 *  - https://drive.google.com/open?id={ID}                  → file (or folder, 구분 불가)
 *  - 32+ 자리 alphanumeric 만 입력해도 ID 로 간주
 */
export function extractDriveId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // /folders/{id} 또는 /file/d/{id}
  const m1 = trimmed.match(/\/(?:folders|file\/d)\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];

  // ?id={id} 또는 &id={id}
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];

  // 순수 ID 형태 (Drive 파일/폴더 ID 는 보통 25-44 자)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

  return null;
}

export type DriveImageFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * 폴더 안의 이미지 파일 목록 조회. (재귀 X — 1단계 직속 파일만)
 */
export async function listFolderImages(folderId: string): Promise<DriveImageFile[]> {
  const drive = await getGoogleDriveClient();
  const items: DriveImageFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.photo')`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType) continue;
      items.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: Number(f.size ?? 0),
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return items;
}

/**
 * 단일 파일 메타.
 */
export async function getFileMeta(fileId: string): Promise<DriveImageFile | null> {
  const drive = await getGoogleDriveClient();
  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, size",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.name || !res.data.mimeType) return null;
  if (!res.data.mimeType.startsWith("image/")) return null;
  return {
    id: res.data.id,
    name: res.data.name,
    mimeType: res.data.mimeType,
    sizeBytes: Number(res.data.size ?? 0),
  };
}

/**
 * 파일 본문 다운로드 (Buffer 반환).
 */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = await getGoogleDriveClient();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}
