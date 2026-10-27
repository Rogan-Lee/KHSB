import { prisma } from "@/lib/prisma";
import { todayKST } from "@/lib/utils";

import { addDays, PARKING_RULES, type ParkingFlag } from "./rules";

// 어드민 주차 등록 화면 — 최근 30일 기록 + 의심 사유. 페이지에서 권한 확인 뒤에만 부른다.

export type ParkingBoardRow = {
  id: string;
  createdAt: Date;
  date: string;
  studentId: string;
  studentName: string;
  parentName: string;
  carNo: string;
  status: string;
  message: string | null;
  flags: ParkingFlag[];
};

export async function getParkingBoard() {
  const todayDate = todayKST();
  const today = todayDate.toISOString().slice(0, 10);
  const since = new Date(`${addDays(today, -(PARKING_RULES.windowDays - 1))}T00:00:00Z`);
  const rows = await prisma.parkingRegistration.findMany({
    where: { date: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      date: true,
      studentId: true,
      carNo: true,
      status: true,
      message: true,
      flags: true,
      student: { select: { name: true } },
      authUser: { select: { name: true } },
    },
  });

  // 그날 자녀 입실 기록이 없는데 등록에 성공한 건. 오늘은 아직 입실 전일 수 있어 지난 날만 본다
  const past = rows.filter((r) => r.status === "OK" && r.date < todayDate);
  const attended = past.length
    ? await prisma.attendanceRecord.findMany({
        where: {
          checkIn: { not: null },
          OR: past.map((r) => ({ studentId: r.studentId, date: r.date })),
        },
        select: { studentId: true, date: true },
      })
    : [];
  const present = new Set(attended.map((a) => `${a.studentId}|${a.date.toISOString()}`));

  return rows.map<ParkingBoardRow>((r) => {
    const flags = r.flags as ParkingFlag[];
    const notAttending =
      r.status === "OK" && r.date < todayDate && !present.has(`${r.studentId}|${r.date.toISOString()}`);
    return {
      id: r.id,
      createdAt: r.createdAt,
      date: r.date.toISOString().slice(0, 10),
      studentId: r.studentId,
      studentName: r.student.name,
      parentName: r.authUser.name,
      carNo: r.carNo,
      status: r.status,
      message: r.message,
      flags: notAttending ? [...flags, "NOT_ATTENDING"] : flags,
    };
  });
}
