import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseSchool } from "@/lib/utils";
import { CalendarView } from "@/components/calendar/calendar-view";
import { fetchGoogleCalendarEvents } from "@/actions/google-calendar";
import { isGoogleCalendarConfigured, isOAuthAppConfigured } from "@/lib/google-calendar";
import { GoogleCalendarConnectButton } from "@/components/calendar/google-calendar-connect-button";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connected?: string; google_error?: string }>;
}) {
  const user = await getUser();
  if (!user?.orgId) return null;
  const orgId = user.orgId;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 7, 0);

  const [events, schoolRows, studentRows] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { orgId, startDate: { gte: startOfMonth, lte: endOfMonth } },
      include: { student: { select: { id: true, name: true } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.student.findMany({
      where: { orgId, school: { not: null } },
      select: { school: true },
      distinct: ["school"],
    }),
    prisma.student.findMany({
      where: { orgId, status: "ACTIVE" },
      select: { id: true, name: true, grade: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const isDirector = user?.role === "DIRECTOR" || user?.role === "ADMIN";
  const googleConnected = await isGoogleCalendarConfigured();
  const oauthConfigured = isOAuthAppConfigured();

  const googleToken = googleConnected
    ? await prisma.googleCalendarToken.findUnique({ where: { id: "singleton" }, select: { connectedBy: true } })
    : null;

  const googleEvents = googleConnected
    ? await fetchGoogleCalendarEvents(startOfMonth, endOfMonth)
    : [];

  const schoolNames = [...new Set(schoolRows.map((s) => parseSchool(s.school!)).filter(Boolean))];
  const localGoogleIds = new Set(events.map((e) => e.googleEventId).filter(Boolean));
  const googleOnlyEvents = googleEvents.filter((e) => !localGoogleIds.has(e.googleEventId));

  const { google_connected, google_error } = await searchParams;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">캘린더</h1>
        {isDirector && oauthConfigured && (
          <GoogleCalendarConnectButton
            connected={googleConnected}
            connectedBy={googleToken?.connectedBy ?? null}
            justConnected={google_connected === "true"}
            error={google_error}
          />
        )}
      </div>
      <CalendarView
        initialEvents={events}
        schools={schoolNames}
        students={studentRows}
        googleEvents={googleOnlyEvents}
        googleCalendarConfigured={googleConnected}
      />
    </div>
  );
}
