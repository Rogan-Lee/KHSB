"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { importStudentsCSV, type CSVImportRow } from "@/actions/import";
import { toast } from "sonner";
import { CheckCircle2, Download, RotateCcw } from "lucide-react";
import { FormActions, Notice, Section, StatusBadge } from "@/components/backoffice/ui";
import {
  ColumnGuide,
  ColumnName,
  FileDropZone,
  ImportErrors,
  ImportSteps,
  PREVIEW_TD,
  PREVIEW_TH,
  PreviewTable,
} from "./import-ui";
import { cn } from "@/lib/utils";

// 요일 매핑
const DAY_MAP: Record<string, number> = {
  월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0,
};

// CSV 텍스트 파싱 (BOM, 따옴표, 셀 내 줄바꿈, CRLF 모두 처리)
function parseCSV(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, ""); // BOM 제거
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; } // escaped quote
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\r" || ch === "\n") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++; // CRLF
      row.push(cell.trim());
      if (row.some((c) => c)) rows.push(row); // 빈 행 제외
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  // 마지막 행
  row.push(cell.trim());
  if (row.some((c) => c)) rows.push(row);

  return rows;
}

// 헤더 → 필드 매핑
function mapHeader(h: string): string {
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
  // 일정 컬럼: 월입실약속시간 / 월퇴실약속시간
  for (const [dayName, dayNum] of Object.entries(DAY_MAP)) {
    if (s.startsWith(dayName)) {
      if (/입실/.test(s)) return `start_${dayNum}`;
      if (/퇴실/.test(s)) return `end_${dayNum}`;
    }
  }
  return `__unknown_${h}`;
}

// 학교명으로 학년 자동 추론
// 예: school="반송고2", grade="3" → "고3"
//     school="XX중학교", grade="2" → "중2"
//     grade="재수" → "N수"
function normalizeGrade(grade: string, school: string): string {
  const g = grade.replace(/\s/g, "");
  if (!g) return grade;

  // 이미 정형화된 형태
  if (/^(고|중)[1-3]$/.test(g)) return g;
  if (/^[Nn]수$|^재수$/.test(g)) return "N수";

  // "고1학년", "중2학년" 형태
  const schoolLevelMatch = g.match(/^(고|중)([1-3])학년?$/);
  if (schoolLevelMatch) return `${schoolLevelMatch[1]}${schoolLevelMatch[2]}`;

  // 순수 숫자 또는 "N학년" → 학교명으로 고/중 추론
  const numMatch = g.match(/^([1-3])(?:학년)?$/);
  if (numMatch) {
    const schoolRaw = school.replace(/[0-9]/g, "").trim();
    if (/고등|고$/.test(schoolRaw)) return `고${numMatch[1]}`;
    if (/중학|중$/.test(schoolRaw)) return `중${numMatch[1]}`;
    return g;
  }

  return g;
}

// 비등원 표시: X, x, ×, -, —, 없음, 미등원
const NO_SCHEDULE_VALUES = /^(x|×|-|—|없음|미등원|휴원|해당없음)$/i;

function normalizeTime(t: string): string {
  const clean = t.replace(/\s/g, "");
  if (!clean || NO_SCHEDULE_VALUES.test(clean)) return ""; // 비등원
  // HH:MM
  if (/^\d{2}:\d{2}$/.test(clean)) return clean;
  // H:MM
  if (/^\d{1}:\d{2}$/.test(clean)) return `0${clean}`;
  // 숫자만 (1800, 900)
  if (/^\d{3,4}$/.test(clean)) {
    const padded = clean.padStart(4, "0");
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  // HH시 / HH시MM분 형태
  const hmMatch = clean.match(/^(\d{1,2})시(\d{2})?분?$/);
  if (hmMatch) {
    const h = hmMatch[1].padStart(2, "0");
    const m = (hmMatch[2] ?? "00").padStart(2, "0");
    return `${h}:${m}`;
  }
  return ""; // 인식 불가 → 비등원으로 처리
}

// 한 셀에 시간이 여러 개 있는 경우 처리 (학원 왕복 등)
function extractTimes(cell: string): string[] {
  return cell
    .split(/[\n\r/\\|]+/)
    .map(normalizeTime)
    .filter((t) => /^\d{2}:\d{2}$/.test(t));
}

function csvToRows(text: string): CSVImportRow[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const fieldMap = headers.map(mapHeader);

  const result: CSVImportRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every((c) => !c)) continue; // 빈 행 건너뜀

    const obj: Record<string, string> = {};
    cells.forEach((val, idx) => {
      if (fieldMap[idx]) obj[fieldMap[idx]] = val;
    });

    const school = obj.school || "";
    const rawGrade = obj.grade || "";
    const grade = normalizeGrade(rawGrade, school);

    const schedules: CSVImportRow["schedules"] = [];
    const outings: CSVImportRow["outings"] = [];
    for (const dayNum of Object.values(DAY_MAP)) {
      const startTimes = extractTimes(obj[`start_${dayNum}`] ?? "");
      const endTimes = extractTimes(obj[`end_${dayNum}`] ?? "");
      const start = startTimes[0] ?? ""; // 여러 시간이면 첫 번째 (첫 입실)
      const end = endTimes[endTimes.length - 1] ?? ""; // 여러 시간이면 마지막 (최종 퇴실)
      if (start && end) {
        schedules.push({ dayOfWeek: dayNum, startTime: start, endTime: end });
        // 두 시간씩 있으면 중간 외출 구간 추출: 첫 퇴실 → 두 번째 입실
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

const SAMPLE_CSV = `좌석번호,이름,학교,학년,반,학생 전화번호,학부모 전화번호,학부모 이메일,담당 멘토,월 입실약속시간,월 퇴실약속시간,화 입실약속시간,화 퇴실약속시간,수 입실약속시간,수 퇴실약속시간,목 입실약속시간,목 퇴실약속시간,금 입실약속시간,금 퇴실약속시간,토 입실약속시간,토 퇴실약속시간,일 입실약속시간,일 퇴실약속시간,학원 스케줄,학생정보,선택과목,입시전형,인강
A-01,홍길동,○○고등학교,3,정규반,010-1234-5678,010-9876-5432,parent@email.com,김멘토,14:00,22:00,14:00,22:00,14:00,22:00,14:00,22:00,14:00,22:00,,,,"수학학원 월수금 17-19시","집중력 좋음, 수학 약함","수학, 영어, 사탐(생활과윤리)","수시 학생부종합","메가스터디 수학(현우진)"
A-02,이수연,□□중학교,2,선택반,010-2345-6789,010-8765-4321,,이멘토,,,14:00,22:00,,,,14:00,22:00,,,,영어학원 화목 18-20시,,,,
A-03,박민준,,재수,정규반,010-3456-7890,010-7654-3210,,,,,,,,,,,,,,,,"정시 수능",EBSi 국어`;

const STEPS = [
  { title: "샘플 파일 받기", description: "형식이 맞는 샘플 CSV에 내용을 채워요" },
  { title: "파일 올리기", description: "완성한 CSV 파일을 끌어 놓거나 선택해요" },
  { title: "확인 후 저장", description: "인식된 원생을 확인하고 저장해요" },
];

const COLUMNS = [
  { name: "좌석번호", description: "좌석 번호" },
  { name: "이름", description: "원생 이름", required: true },
  { name: "학교", description: "학교명" },
  { name: "학년", description: "숫자(1~3)만 쓰면 학교명으로 자동 추론" },
  { name: "반", description: "수강반 (예: 정규반/선택반)" },
  { name: "담당 멘토", description: "시스템에 등록된 이름과 같아야 해요" },
  { name: "학생 전화번호", description: "학생 연락처" },
  { name: "학부모 전화번호", description: "학부모 연락처" },
  { name: "학부모 이메일", description: "학부모 이메일" },
  { name: "월 입실약속시간", description: "월요일 입실 시간 (화~일, 퇴실도 같은 방식)" },
  { name: "학생정보", description: "학생 특이사항 메모" },
  { name: "선택과목", description: "수능 선택과목 (예: 수학, 영어, 사탐)" },
  { name: "입시전형", description: "대학 입시 전형 (예: 수시 학종, 정시)" },
  { name: "인강", description: "수강 중인 인강 (예: 메가스터디 수학)" },
];

function dayLabel(dayOfWeek: number) {
  return Object.entries(DAY_MAP).find(([, v]) => v === dayOfWeek)?.[0];
}

export function CsvImport() {
  const [preview, setPreview] = useState<CSVImportRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; name: string; reason: string }[] } | null>(null);

  function handleFile(file: File) {
    // UTF-8로 먼저 시도 → 한글 깨지면(replacement char 포함) EUC-KR 재시도
    const tryRead = (encoding: string) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          // UTF-8 결과에 replacement char(U+FFFD)가 많으면 EUC-KR로 재시도
          if (encoding === "utf-8" && (text.match(/�/g) ?? []).length > 3) {
            tryRead("euc-kr");
            return;
          }
          const rows = csvToRows(text);
          if (rows.length === 0) {
            toast.error("인식된 행이 없습니다. 컬럼 헤더를 확인하세요.");
            return;
          }
          setPreview(rows);
          setResult(null);
        } catch {
          toast.error("CSV 파싱 실패. 파일 형식을 확인하세요.");
        }
      };
      reader.readAsText(file, encoding);
    };
    tryRead("utf-8");
  }

  function handleImport() {
    if (!preview) return;
    const valid = preview.filter((r) => r.name.trim());
    startTransition(async () => {
      try {
        const res = await importStudentsCSV(valid);
        setResult({ created: res.created, updated: res.updated, errors: res.errors });
        const summary = [
          res.created > 0 && `${res.created}명 신규 등록`,
          res.updated > 0 && `${res.updated}명 업데이트`,
        ].filter(Boolean).join(", ");
        if (res.errors.length === 0) {
          toast.success(summary || "완료");
          setPreview(null);
        } else {
          toast.warning(`${summary}, ${res.errors.length}건 오류`);
        }
      } catch {
        toast.error("가져오기 실패");
      }
    });
  }

  function downloadSample() {
    const blob = new Blob(["﻿" + SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "원생_업로드_샘플.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const namedCount = preview?.filter((r) => r.name).length ?? 0;
  const unnamedCount = preview?.filter((r) => !r.name).length ?? 0;
  const step = result ? 3 : preview ? 2 : 1;

  return (
    <div className="flex flex-col gap-x6">
      <Section
        title="원생 CSV 가져오기"
        description="CSV 파일 하나로 원생 정보와 등원 일정을 한 번에 등록해요. 좌석번호나 이름이 같은 기존 원생은 덮어써요."
        actions={
          <Button variant="outline" size="sm" onClick={downloadSample}>
            <Download />
            샘플 CSV 다운로드
          </Button>
        }
      >
        <div className="flex flex-col gap-x6">
          <ImportSteps steps={STEPS} current={step} />

          {/* 1) 파일 업로드 */}
          {!preview && !result && <FileDropZone onFile={handleFile} />}

          {/* 2) 미리보기 */}
          {preview && !result && (
            <div className="flex flex-col gap-x3">
              <div className="flex flex-wrap items-center gap-x2">
                <p className="t5-bold text-fg-neutral">
                  <span className="tabular-nums text-fg-brand">{namedCount}명</span> 인식됐어요
                </p>
                {unnamedCount > 0 && <StatusBadge tone="bad">{unnamedCount}행 이름 없음</StatusBadge>}
              </div>
              <PreviewTable>
                <thead>
                  <tr>
                    {["좌석", "이름", "학교", "학년", "반", "담당 멘토", "선택과목", "입시전형", "인강", "등원 요일"].map((h) => (
                      <th key={h} className={PREVIEW_TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className={cn(!row.name && "bg-bg-critical-weak")}>
                      <td className={PREVIEW_TD}>{row.seat || "-"}</td>
                      <td className={cn(PREVIEW_TD, "t3-medium")}>
                        {row.name || <span className="text-fg-critical">이름 없음</span>}
                      </td>
                      <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{row.school || "-"}</td>
                      <td className={PREVIEW_TD}>{row.grade || "-"}</td>
                      <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{row.classGroup || "-"}</td>
                      <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{row.mentorName || "-"}</td>
                      <td className={cn(PREVIEW_TD, "max-w-[120px] truncate text-fg-neutral-muted")} title={row.selectedSubjects}>{row.selectedSubjects || "-"}</td>
                      <td className={cn(PREVIEW_TD, "max-w-[120px] truncate text-fg-neutral-muted")} title={row.admissionType}>{row.admissionType || "-"}</td>
                      <td className={cn(PREVIEW_TD, "max-w-[120px] truncate text-fg-neutral-muted")} title={row.onlineLectures}>{row.onlineLectures || "-"}</td>
                      <td className={PREVIEW_TD}>
                        {row.schedules.length > 0
                          ? row.schedules
                              .map((s) => {
                                const day = dayLabel(s.dayOfWeek);
                                const outing = row.outings.find((o) => o.dayOfWeek === s.dayOfWeek);
                                return outing
                                  ? `${day}(${s.startTime}→${outing.outStart}↔${outing.outEnd}→${s.endTime})`
                                  : `${day}(${s.startTime}~${s.endTime})`;
                              })
                              .join(", ")
                          : <span className="text-fg-neutral-subtle">없음</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PreviewTable>
              <FormActions>
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={isPending}>
                  취소
                </Button>
                <Button onClick={handleImport} disabled={isPending}>
                  {isPending ? "저장 중…" : `${namedCount}명 저장`}
                </Button>
              </FormActions>
            </div>
          )}

          {/* 3) 결과 */}
          {result && (
            <div className="flex flex-col gap-x3">
              <Notice tone="ok" icon={CheckCircle2} title="가져오기를 마쳤어요">
                {[
                  result.created > 0 && `${result.created}명 신규 등록`,
                  result.updated > 0 && `${result.updated}명 업데이트`,
                ].filter(Boolean).join(" · ") || "변경된 원생이 없어요"}
              </Notice>
              <ImportErrors errors={result.errors} />
              <FormActions className="justify-start">
                <Button variant="outline" size="sm" onClick={() => setResult(null)}>
                  <RotateCcw />
                  다시 업로드
                </Button>
              </FormActions>
            </div>
          )}
        </div>
      </Section>

      {/* 컬럼 설명 */}
      <Section title="CSV 컬럼 형식" description="첫 줄(헤더)의 이름으로 항목을 알아봐요.">
        <ColumnGuide
          columns={COLUMNS}
          notes={[
            <>시간 형식은 <ColumnName>14:00</ColumnName>, <ColumnName>1400</ColumnName> 모두 인식해요.</>,
            <>학년 자동 추론: 학교명이 <ColumnName>고</ColumnName>로 끝나면 고N, <ColumnName>중</ColumnName>으로 끝나면 중N, <ColumnName>재수</ColumnName>는 N수로 바꿔요.</>,
            <>기존 원생(좌석번호 또는 이름 일치)은 덮어쓰고, 새 원생은 신규 등록해요.</>,
          ]}
        />
      </Section>
    </div>
  );
}
