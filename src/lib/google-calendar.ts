import { google } from "googleapis";
import { prisma } from "./prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

export function getGoogleAuthUrl(): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // refresh_token을 항상 받기 위해
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function getGoogleCalendarClient() {
  const token = await prisma.googleCalendarToken.findUnique({ where: { id: "singleton" } });
  if (!token) throw new Error("Google Calendar가 연동되지 않았습니다");

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
  });

  // 토큰 자동 갱신 시 DB 업데이트
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

  return { calendar: google.calendar({ version: "v3", auth: oauth2Client }), calendarId: token.calendarId };
}

export async function getGoogleSheetsClient() {
  const token = await prisma.googleCalendarToken.findUnique({ where: { id: "singleton" } });
  if (!token) throw new Error("Google 계정이 연동되지 않았습니다");

  const oauth2Client = createOAuth2Client();
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

  return google.sheets({ version: "v4", auth: oauth2Client });
}

export async function isGoogleCalendarConfigured(): Promise<boolean> {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return false;
    const token = await prisma.googleCalendarToken.findUnique({ where: { id: "singleton" } });
    return !!token?.refreshToken;
  } catch {
    return false;
  }
}

export function isOAuthAppConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

/**
 * 학원 공용 Google Calendar 에 Meet 링크 포함 이벤트 생성.
 * 화상 1:1 세션 예약에 사용.
 *
 * - conferenceDataVersion=1 필수 (Meet 링크 자동 발급 활성화)
 * - sendUpdates="all" 로 attendee 에게 invite 메일 자동 발송
 * - timeZone Asia/Seoul 고정 (KST 시각 그대로 보존)
 */
export async function createMeetEvent(params: {
  title: string;
  description?: string;
  startAt: Date;
  durationMinutes: number;
  attendeeEmails?: string[];
}): Promise<{ eventId: string; meetUrl: string; htmlLink: string }> {
  const { calendar, calendarId } = await getGoogleCalendarClient();
  const endAt = new Date(params.startAt.getTime() + params.durationMinutes * 60_000);

  const response = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: params.title,
      description: params.description,
      start: { dateTime: params.startAt.toISOString(), timeZone: "Asia/Seoul" },
      end: { dateTime: endAt.toISOString(), timeZone: "Asia/Seoul" },
      attendees: params.attendeeEmails?.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: `mentoring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 10 },
          { method: "email", minutes: 60 },
        ],
      },
    },
  });

  const eventId = response.data.id ?? "";
  const meetUrl =
    response.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    response.data.hangoutLink ??
    "";
  const htmlLink = response.data.htmlLink ?? "";

  if (!eventId || !meetUrl) {
    throw new Error("Calendar 이벤트는 생성됐지만 Meet 링크 발급 실패");
  }

  return { eventId, meetUrl, htmlLink };
}

/**
 * Calendar 이벤트 시간/제목 업데이트. (재예약 시 사용)
 */
export async function updateMeetEvent(params: {
  eventId: string;
  title?: string;
  startAt?: Date;
  durationMinutes?: number;
}): Promise<void> {
  const { calendar, calendarId } = await getGoogleCalendarClient();
  const patch: Record<string, unknown> = {};
  if (params.title) patch.summary = params.title;
  if (params.startAt && params.durationMinutes) {
    const endAt = new Date(params.startAt.getTime() + params.durationMinutes * 60_000);
    patch.start = { dateTime: params.startAt.toISOString(), timeZone: "Asia/Seoul" };
    patch.end = { dateTime: endAt.toISOString(), timeZone: "Asia/Seoul" };
  }
  await calendar.events.patch({
    calendarId,
    eventId: params.eventId,
    sendUpdates: "all",
    requestBody: patch,
  });
}

/**
 * Calendar 이벤트 삭제. 실패해도 throw 안 함 (DB 정리는 진행).
 */
export async function deleteMeetEvent(eventId: string): Promise<void> {
  try {
    const { calendar, calendarId } = await getGoogleCalendarClient();
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: "all",
    });
  } catch (err) {
    // Calendar API 가 못 찾는 경우(이미 삭제됨) 등은 무시
    console.error("[google-calendar] deleteMeetEvent failed:", err);
  }
}
