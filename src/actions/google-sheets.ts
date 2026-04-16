"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireFullAccess } from "@/lib/roles";
import { getGoogleSheetsClient, isOAuthAppConfigured } from "@/lib/google-calendar";
import { type CSVImportRow } from "./import";
import { type ExamScoreCSVRow } from "./exam-scores";

export type SheetType = "students" | "scores";

// ─── Student parsing (port of csv-import.tsx) ─────────────────────────────────

const DAY_MAP: Record<string, number> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 };

function mapStudentHeader(h: string): string {
  const s = h.replace(/\s/g, "");
  if (/좌석번호/.test(s)) return "seat";
  if (/^이름$/.test(s)) return "name";
  if (/소속|학교/.test(s)) return "school";
  if (/^반$|수강반|학습반/.test(s)) return "classGroup";
  if (/학생전화|학생연락/.test(s)) return "phone";
  if (/학부모전화|학부모연락/.test(s)) return "parentPhone";
  if (/학부모이메일|부모이메일/.test(s)) return "parentEmail";
  if (/수강과정|학년|과정/.test(s)) return "grade";
  if (/담당멘토|담당선생|멘토/.test(s)) return "mentorName";
  if (/학생정보|추가정보|메모/.test(s)) return "studentInfo";
  if (/선택과목|수능과목|응시과목/.test(s)) return "selectedSubjects";
  if (/입시전형|전형|지원전형|대학전형/.test(s)) return "admissionType";
  if (/인강|온라인강의|수강인강/.test(s)) return "onlineLectures";
  for (const [dayName, dayNum] of Object.entries(DAY_MAP)) {
    if (s.startsWith(dayName)) {
      if (/입실/.test(s)) return `start_${dayNum}`;
      if (/퇴실/.test(s)) return `end_${dayNum}`;
    }
  }
  return `__unknown_${h}`;
}

function normalizeGrade(grade: string, school: string): string {
  const g = grade.replace(/\s/g, "");
  if (!g) return grade;
  if (/^(고|중)[1-3]$/.test(g)) return g;
  if (/^[Nn]수$|^재수$/.test(g)) return "N수";
  const schoolLevelMatch = g.match(/^(고|중)([1-3])학년?$/);
  if (schoolLevelMatch) return `${schoolLevelMatch[1]}${schoolLevelMatch[2]}`;
  const numMatch = g.match(/^([1-3])(?:학년)?$/);
  if (numMatch) {
    const schoolRaw = school.replace(/[0-9]/g, "").trim();
    if (/고등|고$/.test(schoolRaw)) return `고${numMatch[1]}`;
    if (/중학|중$/.test(schoolRaw)) return `중${numMatch[1]}`;
    return g;
  }
  return g;
}

const NO_SCHEDULE_VALUES = /^(x|×|-|—|없음|미등원|휴원|해당없음)$/i;

function normalizeTime(t: string): string {
  const clean = t.replace(/\s/g, "");
  if (!clean || NO_SCHEDULE_VALUES.test(clean)) return "";
  if (/^\d{2}:\d{2}$/.test(clean)) return clean;
  if (/^\d{1}:\d{2}$/.test(clean)) return `0${clean}`;
  if (/^\d{3,4}$/.test(clean)) {
    const padded = clean.padStart(4, "0");
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  const hmMatch = clean.match(/^(\d{1,2})시(\d{2})?분?$/);
  if (hmMatch) {
    const h = hmMatch[1].padStart(2, "0");
    const m = (hmMatch[2] ?? "00").padStart(2, "0");
    return `${h}:${m}`;
  }
  return "";
}

function extractTimes(cell: string): string[] {
  return cell
    .split(/[\n\r/\\|]+/)
    .map(normalizeTime)
    .filter((t) => /^\d{2}:\d{2}$/.test(t));
}

function sheetRowsToStudentRows(data: string[][]): CSVImportRow[] {
  if (data.length < 2) return [];
  const headers = data[0];
  const fieldMap = headers.map(mapStudentHeader);
  const result: CSVImportRow[] = [];

  for (let i = 1; i < data.length; i++) {
    const cells = data[i];
    if (!cells || cells.every((c) => !c)) continue;
    const obj: Record<string, string> = {};
    cells.forEach((val, idx) => { if (fieldMap[idx]) obj[fieldMap[idx]] = val ?? ""; });

    const school = obj.school || "";
    const grade = normalizeGrade(obj.grade || "", school);

    const schedules: CSVImportRow["schedules"] = [];
    const outings: CSVImportRow["outings"] = [];
    for (const dayNum of Object.values(DAY_MAP)) {
      const startTimes = extractTimes(obj[`start_${dayNum}`] ?? "");
      const endTimes = extractTimes(obj[`end_${dayNum}`] ?? "");
      const start = startTimes[0] ?? "";
      const end = endTimes[endTimes.length - 1] ?? "";
      if (start && end) {
        schedules.push({ dayOfWeek: dayNum, startTime: start, endTime: end });
        if (endTimes.length >= 2 && startTimes.length >= 2) {
          outings.push({ dayOfWeek: dayNum, outStart: endTimes[0], outEnd: startTimes[1] });
        }
      }
    }

    result.push({
      seat: obj.seat || undefined,
      name: obj.name || "",
      school: school || undefined,
      classGroup: obj.classGroup || undefined,
      phone: obj.phone || undefined,
      parentPhone: obj.parentPhone || undefined,
      parentEmail: obj.parentEmail || undefined,
      grade,
      mentorName: obj.mentorName || undefined,
      studentInfo: obj.studentInfo || undefined,
      selectedSubjects: obj.selectedSubjects || undefined,
      admissionType: obj.admissionType || undefined,
      onlineLectures: obj.onlineLectures || undefined,
      schedules,
      outings,
    });
  }
  return result;
}

// ─── Score parsing (port of csv-import-scores.tsx) ────────────────────────────

function mapScoreHeader(h: string): string {
  const s = h.replace(/\s/g, "");
  if (/^이름$|학생이름|학생명/.test(s)) return "studentName";
  if (/시험종류|시험타입|유형/.test(s)) return "examType";
  if (/시험명|시험이름|시험/.test(s)) return "examName";
  if (/날짜|시험날짜|일자/.test(s)) return "examDate";
  if (/과목/.test(s)) return "subject";
  if (/원점수|점수/.test(s)) return "rawScore";
  if (/등급/.test(s)) return "grade";
  if (/백분위/.test(s)) return "percentile";
  if (/메모|노트|비고/.test(s)) return "notes";
  return `__unknown_${h}`;
}

function sheetRowsToScoreRows(data: string[][]): ExamScoreCSVRow[] {
  if (data.length < 2) return [];
  const headers = data[0];
  const fieldMap = headers.map(mapScoreHeader);
  const result: ExamScoreCSVRow[] = [];

  for (let i = 1; i < data.length; i++) {
    const cells = data[i];
    if (!cells || cells.every((c) => !c)) continue;
    const obj: Record<string, string> = {};
    cells.forEach((val, idx) => { if (fieldMap[idx]) obj[fieldMap[idx]] = val ?? ""; });

    const rawScoreVal = obj.rawScore ? parseInt(obj.rawScore, 10) : undefined;
    const gradeVal = obj.grade ? parseInt(obj.grade, 10) : undefined;
    const percentileVal = obj.percentile ? parseFloat(obj.percentile) : undefined;

    result.push({
      studentName: obj.studentName || "",
      examType: obj.examType || "",
      examName: obj.examName || "",
      examDate: obj.examDate || "",
      subject: obj.subject || "",
      rawScore: rawScoreVal && !isNaN(rawScoreVal) ? rawScoreVal : undefined,
      grade: gradeVal && !isNaN(gradeVal) ? gradeVal : undefined,
      percentile: percentileVal && !isNaN(percentileVal) ? percentileVal : undefined,
      notes: obj.notes || undefined,
    });
  }
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function fetchSheetData(sheetUrl: string, sheetName: string | null): Promise<string[][]> {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("유효한 Google Sheets URL이 아닙니다");

  const sheets = await getGoogleSheetsClient();
  const range = sheetName ? `${sheetName}!A:ZZ` : "A:ZZ";
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return (response.data.values ?? []) as string[][];
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function getGoogleSheetsConfig(type: SheetType) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return prisma.googleSheetsConfig.findUnique({ where: { id: type } });
}

export async function saveGoogleSheetsConfig(type: SheetType, url: string, sheetName?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  if (!extractSpreadsheetId(url)) throw new Error("유효한 Google Sheets URL이 아닙니다");
  await prisma.googleSheetsConfig.upsert({
    where: { id: type },
    create: { id: type, sheetUrl: url, sheetName: sheetName || null },
    update: { sheetUrl: url, sheetName: sheetName || null },
  });
}

export async function clearGoogleSheetsConfig(type: SheetType) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  await prisma.googleSheetsConfig.deleteMany({ where: { id: type } });
}

// ─── Read actions ─────────────────────────────────────────────────────────────

type SheetError = { ok: false; error: string; needsReauth?: boolean };

export type ReadStudentsResult = { ok: true; rows: CSVImportRow[] } | SheetError;
export type ReadScoresResult = { ok: true; rows: ExamScoreCSVRow[] } | SheetError;

function handleSheetError(err: unknown): SheetError {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("insufficient") || msg.includes("forbidden") || msg.includes("403")) {
    return { ok: false, error: "Google Sheets 접근 권한이 없습니다. Google 계정을 재연동해 주세요.", needsReauth: true };
  }
  if (msg.includes("연동되지 않았습니다")) {
    return { ok: false, error: msg, needsReauth: true };
  }
  return { ok: false, error: `시트 읽기 실패: ${msg}` };
}

export async function readStudentsFromSheet(): Promise<ReadStudentsResult> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  if (!isOAuthAppConfigured()) return { ok: false, error: "Google OAuth가 설정되지 않았습니다" };
  const config = await prisma.googleSheetsConfig.findUnique({ where: { id: "students" } });
  if (!config) return { ok: false, error: "연동된 원생관리 시트가 없습니다" };
  try {
    const data = await fetchSheetData(config.sheetUrl, config.sheetName);
    const rows = sheetRowsToStudentRows(data);
    return { ok: true, rows };
  } catch (err) {
    return handleSheetError(err);
  }
}

export async function readScoresFromSheet(): Promise<ReadScoresResult> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireFullAccess(session.user.role);

  if (!isOAuthAppConfigured()) return { ok: false, error: "Google OAuth가 설정되지 않았습니다" };
  const config = await prisma.googleSheetsConfig.findUnique({ where: { id: "scores" } });
  if (!config) return { ok: false, error: "연동된 성적 시트가 없습니다" };
  try {
    const data = await fetchSheetData(config.sheetUrl, config.sheetName);
    const rows = sheetRowsToScoreRows(data);
    return { ok: true, rows };
  } catch (err) {
    return handleSheetError(err);
  }
}
