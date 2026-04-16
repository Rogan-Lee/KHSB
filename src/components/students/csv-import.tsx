"use client";

import { useState, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { importStudentsCSV, type CSVImportRow } from "@/actions/import";
import { toast } from "sonner";
import { Upload, FileText, AlertCircle, CheckCircle2, X } from "lucide-react";

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

export function CsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
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
          if (encoding === "utf-8" && (text.match(/\uFFFD/g) ?? []).length > 3) {
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
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
    const blob = new Blob(["\uFEFF" + SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "원생_업로드_샘플.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          CSV 파일로 원생 정보와 등원 일정을 일괄 등록합니다. 기존 원생(좌석번호·이름 기준)은 덮어씁니다.
        </p>
        <Button variant="outline" size="sm" onClick={downloadSample}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          샘플 CSV 다운로드
        </Button>
      </div>

      {/* 파일 업로드 영역 */}
      {!preview && (
        <div
          className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">CSV 파일을 드래그하거나 클릭해서 업로드</p>
          <p className="text-xs text-muted-foreground mt-1">UTF-8 또는 CP949 인코딩 CSV 지원</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {/* 미리보기 */}
      {preview && !result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              미리보기 — <span className="text-primary">{preview.filter((r) => r.name).length}명</span> 인식됨
              {preview.some((r) => !r.name) && (
                <span className="text-red-500 ml-2 text-xs">({preview.filter((r) => !r.name).length}행 이름 없음)</span>
              )}
            </p>
            <button
              onClick={() => setPreview(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-lg border overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">좌석</th>
                  <th className="px-2 py-1.5 text-left">이름</th>
                  <th className="px-2 py-1.5 text-left">학교</th>
                  <th className="px-2 py-1.5 text-left">학년</th>
                  <th className="px-2 py-1.5 text-left">반</th>
                  <th className="px-2 py-1.5 text-left">담당 멘토</th>
                  <th className="px-2 py-1.5 text-left">선택과목</th>
                  <th className="px-2 py-1.5 text-left">입시전형</th>
                  <th className="px-2 py-1.5 text-left">인강</th>
                  <th className="px-2 py-1.5 text-left">등원 요일</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={`border-b ${!row.name ? "bg-red-50" : ""}`}>
                    <td className="px-2 py-1.5 font-mono">{row.seat || "-"}</td>
                    <td className="px-2 py-1.5 font-medium">
                      {row.name || <span className="text-red-500">이름 없음</span>}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.school || "-"}</td>
                    <td className="px-2 py-1.5">{row.grade || "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.classGroup || "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.mentorName || "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[100px] truncate" title={row.selectedSubjects}>{row.selectedSubjects || "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[100px] truncate" title={row.admissionType}>{row.admissionType || "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[100px] truncate" title={row.onlineLectures}>{row.onlineLectures || "-"}</td>
                    <td className="px-2 py-1.5">
                      {row.schedules.length > 0
                        ? row.schedules
                            .map((s) => {
                              const day = Object.entries(DAY_MAP).find(([, v]) => v === s.dayOfWeek)?.[0];
                              const outing = row.outings.find((o) => o.dayOfWeek === s.dayOfWeek);
                              return outing
                                ? `${day}(${s.startTime}→${outing.outStart}↔${outing.outEnd}→${s.endTime})`
                                : `${day}(${s.startTime}~${s.endTime})`;
                            })
                            .join(", ")
                        : <span className="text-muted-foreground">없음</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={isPending} size="sm">
              {isPending ? "처리 중..." : `${preview.filter((r) => r.name).length}명 저장`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <span>
              {result.created > 0 && <span className="font-medium">{result.created}명 신규 등록</span>}
              {result.created > 0 && result.updated > 0 && <span className="text-muted-foreground mx-1">·</span>}
              {result.updated > 0 && <span className="font-medium">{result.updated}명 업데이트</span>}
            </span>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
              <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {result.errors.length}건 오류
              </p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">
                  {e.row}행 ({e.name}): {e.reason}
                </p>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setResult(null)}>
            다시 업로드
          </Button>
        </div>
      )}

      {/* 컬럼 설명 */}
      <div className="rounded-lg bg-muted/40 border p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-medium text-foreground text-[13px]">CSV 컬럼 형식</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <div><span className="font-mono bg-muted px-1 rounded">좌석번호</span> 좌석 번호 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">이름</span> 원생 이름 (필수)</div>
          <div><span className="font-mono bg-muted px-1 rounded">학교</span> 학교명 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">학년</span> 학년 — 숫자(1~3)만 입력 시 학교명으로 자동 추론</div>
          <div><span className="font-mono bg-muted px-1 rounded">반</span> 수강반 (선택, 예: 정규반/선택반)</div>
          <div><span className="font-mono bg-muted px-1 rounded">담당 멘토</span> 멘토 이름 — 시스템에 등록된 이름과 일치해야 함</div>
          <div><span className="font-mono bg-muted px-1 rounded">학생 전화번호</span> 학생 연락처 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">학부모 전화번호</span> 학부모 연락처 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">학부모 이메일</span> 학부모 이메일 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">월 입실약속시간</span> 월요일 입실 시간</div>
          <div><span className="font-mono bg-muted px-1 rounded">학생정보</span> 학생 특이사항 메모 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">선택과목</span> 수능 선택과목 (선택, 예: 수학, 영어, 사탐)</div>
          <div><span className="font-mono bg-muted px-1 rounded">입시전형</span> 대학 입시 전형 (선택, 예: 수시 학종, 정시)</div>
          <div><span className="font-mono bg-muted px-1 rounded">인강</span> 수강중인 인강 (선택, 예: 메가스터디 수학)</div>
        </div>
        <p>• 시간 형식: <span className="font-mono">14:00</span>, <span className="font-mono">1400</span> 모두 인식</p>
        <p>• 학년 자동 추론: 학교명이 <span className="font-mono">고</span>로 끝나면 고N, <span className="font-mono">중</span>으로 끝나면 중N, <span className="font-mono">재수</span>는 N수로 변환</p>
        <p>• 기존 원생(좌석번호 또는 이름 일치)은 덮어쓰기, 새 원생은 신규 등록</p>
      </div>
    </div>
  );
}
