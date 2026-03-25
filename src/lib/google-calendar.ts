import { google } from "googleapis";
import { prisma } from "./prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
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
