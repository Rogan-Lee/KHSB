"use server";

import { getGoogleCalendarClient, isGoogleCalendarConfigured } from "@/lib/google-calendar";
import type { calendar_v3 } from "googleapis";

export interface GoogleCalendarEvent {
  googleEventId: string;
  title: string;
  description: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  allDay: boolean;
}

// Google Calendar 이벤트 목록 조회 (페이지네이션으로 전체 조회)
export async function fetchGoogleCalendarEvents(
  startDate: Date,
  endDate: Date
): Promise<GoogleCalendarEvent[]> {
  if (!(await isGoogleCalendarConfigured())) return [];

  try {
    const { calendar, calendarId } = await getGoogleCalendarClient();

    const allItems: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    do {
      const res = await calendar.events.list({
        calendarId,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 500,
        pageToken,
      });
      allItems.push(...(res.data.items ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    const items = allItems;

    return items
      .filter((e) => e.id && e.summary)
      .map((e) => {
        const isAllDay = !e.start?.dateTime;
        let start: string;
        let end: string | null = null;

        if (isAllDay) {
          start = e.start?.date ?? "";
          // Google allDay end는 exclusive(다음날) → -1일
          if (e.end?.date && e.end.date !== e.start?.date) {
            const d = new Date(e.end.date);
            d.setDate(d.getDate() - 1);
            end = d.toISOString().split("T")[0];
          }
        } else {
          start = e.start?.dateTime?.split("T")[0] ?? "";
          const endDt = e.end?.dateTime?.split("T")[0];
          end = endDt && endDt !== start ? endDt : null;
        }

        return {
          googleEventId: e.id!,
          title: e.summary!,
          description: e.description ?? null,
          startDate: start,
          endDate: end,
          allDay: isAllDay,
        };
      })
      .filter((e) => e.startDate);
  } catch (err) {
    console.error("[Google Calendar] fetchGoogleCalendarEvents error:", err);
    return [];
  }
}

// 특정 연/월의 Google Calendar 이벤트 조회 (클라이언트 동적 로딩용)
export async function fetchGoogleCalendarEventsForMonth(
  year: number,
  month: number // 0-indexed
): Promise<GoogleCalendarEvent[]> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return fetchGoogleCalendarEvents(start, end);
}

// Google Calendar 이벤트 생성
export async function createGoogleCalendarEvent(data: {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  allDay?: boolean;
}): Promise<string | null> {
  if (!(await isGoogleCalendarConfigured())) return null;

  try {
    const { calendar, calendarId } = await getGoogleCalendarClient();
    const allDay = data.allDay ?? true;

    const event: calendar_v3.Schema$Event = {
      summary: data.title,
      description: data.description || undefined,
    };

    if (allDay) {
      const endDate = data.endDate ?? data.startDate;
      const endExclusive = new Date(endDate);
      endExclusive.setDate(endExclusive.getDate() + 1);
      event.start = { date: data.startDate };
      event.end = { date: endExclusive.toISOString().split("T")[0] };
    } else {
      event.start = { dateTime: `${data.startDate}T00:00:00`, timeZone: "Asia/Seoul" };
      event.end = { dateTime: `${data.endDate ?? data.startDate}T23:59:00`, timeZone: "Asia/Seoul" };
    }

    const res = await calendar.events.insert({ calendarId, requestBody: event });
    return res.data.id ?? null;
  } catch (err) {
    console.error("[Google Calendar] createGoogleCalendarEvent error:", err);
    return null;
  }
}

// Google Calendar 이벤트 수정
export async function updateGoogleCalendarEvent(
  googleEventId: string,
  data: {
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    allDay?: boolean;
  }
): Promise<void> {
  if (!(await isGoogleCalendarConfigured())) return;

  try {
    const { calendar, calendarId } = await getGoogleCalendarClient();

    const existing = await calendar.events.get({ calendarId, eventId: googleEventId });
    const cur = existing.data;

    const allDay = data.allDay ?? !cur.start?.dateTime;
    const startDate = data.startDate ?? (cur.start?.date ?? cur.start?.dateTime?.split("T")[0] ?? "");
    const endDate = data.endDate ?? null;

    const patch: calendar_v3.Schema$Event = {};
    if (data.title) patch.summary = data.title;
    if (data.description !== undefined) patch.description = data.description || "";

    if (allDay) {
      const endExclusive = new Date(endDate ?? startDate);
      endExclusive.setDate(endExclusive.getDate() + 1);
      patch.start = { date: startDate };
      patch.end = { date: endExclusive.toISOString().split("T")[0] };
    } else {
      patch.start = { dateTime: `${startDate}T00:00:00`, timeZone: "Asia/Seoul" };
      patch.end = { dateTime: `${endDate ?? startDate}T23:59:00`, timeZone: "Asia/Seoul" };
    }

    await calendar.events.patch({ calendarId, eventId: googleEventId, requestBody: patch });
  } catch (err) {
    console.error("[Google Calendar] updateGoogleCalendarEvent error:", err);
  }
}

// Google Calendar 이벤트 삭제
export async function deleteGoogleCalendarEvent(googleEventId: string): Promise<void> {
  if (!(await isGoogleCalendarConfigured())) return;

  try {
    const { calendar, calendarId } = await getGoogleCalendarClient();
    await calendar.events.delete({ calendarId, eventId: googleEventId });
  } catch (err) {
    console.error("[Google Calendar] deleteGoogleCalendarEvent error:", err);
  }
}
