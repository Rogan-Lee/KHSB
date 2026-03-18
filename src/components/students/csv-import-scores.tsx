"use client";

import { useState, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkImportExamScores, type ExamScoreCSVRow } from "@/actions/exam-scores";
import { toast } from "sonner";
import { Upload, FileText, AlertCircle, CheckCircle2, X } from "lucide-react";

// CSV 텍스트 파싱 (BOM, 따옴표, CRLF 처리)
function parseCSV(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\r" || ch === "\n") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}

function mapHeader(h: string): string {
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

function csvToRows(text: string): ExamScoreCSVRow[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const fieldMap = headers.map(mapHeader);

  const result: ExamScoreCSVRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every((c) => !c)) continue;

    const obj: Record<string, string> = {};
    cells.forEach((val, idx) => {
      if (fieldMap[idx]) obj[fieldMap[idx]] = val;
    });

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

const EXAM_TYPE_DISPLAY: Record<string, string> = {
  OFFICIAL_MOCK: "공식 모의고사",
  공식모의고사: "공식 모의고사",
  평가원: "공식 모의고사",
  수능: "공식 모의고사",
  PRIVATE_MOCK: "사설 모의고사",
  사설모의고사: "사설 모의고사",
  사설: "사설 모의고사",
  SCHOOL_EXAM: "학교 내신",
  학교내신: "학교 내신",
  내신: "학교 내신",
};

const SAMPLE_CSV = `이름,시험종류,시험명,날짜,과목,원점수,등급,백분위,메모
홍길동,공식모의고사,2024년 6월 모의고사,2024-06-04,국어,85,2,87.3,
홍길동,공식모의고사,2024년 6월 모의고사,2024-06-04,수학,92,1,95.1,
이수연,사설모의고사,메가 전국모의고사,2024-05-20,영어,78,3,72.0,기초 문법 보완 필요
박민준,학교내신,2024-1학기 중간고사,2024-04-15,수학,95,1,,`;

export function CsvImportScores() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ExamScoreCSVRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; errors: { row: number; studentName: string; reason: string }[] } | null>(null);

  function handleFile(file: File) {
    const tryRead = (encoding: string) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
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
    const valid = preview.filter((r) => r.studentName.trim() && r.examName && r.examDate && r.subject);
    startTransition(async () => {
      try {
        const res = await bulkImportExamScores(valid);
        setResult(res);
        if (res.errors.length === 0) {
          toast.success(`${res.created}건 성적 등록 완료`);
          setPreview(null);
        } else {
          toast.warning(`${res.created}건 등록, ${res.errors.length}건 오류`);
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
    a.download = "성적_업로드_샘플.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const validCount = preview?.filter((r) => r.studentName && r.examName && r.examDate && r.subject).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          CSV 파일로 학생 성적(모의고사·내신)을 일괄 등록합니다. 한 행이 과목 하나입니다.
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
              미리보기 — <span className="text-primary">{validCount}건</span> 인식됨
            </p>
            <button onClick={() => setPreview(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-lg border overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">학생</th>
                  <th className="px-2 py-1.5 text-left">시험종류</th>
                  <th className="px-2 py-1.5 text-left">시험명</th>
                  <th className="px-2 py-1.5 text-left">날짜</th>
                  <th className="px-2 py-1.5 text-left">과목</th>
                  <th className="px-2 py-1.5 text-right">원점수</th>
                  <th className="px-2 py-1.5 text-right">등급</th>
                  <th className="px-2 py-1.5 text-right">백분위</th>
                  <th className="px-2 py-1.5 text-left">메모</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => {
                  const missing = !row.studentName || !row.examName || !row.examDate || !row.subject;
                  return (
                    <tr key={i} className={`border-b ${missing ? "bg-red-50" : ""}`}>
                      <td className="px-2 py-1.5 font-medium">
                        {row.studentName || <span className="text-red-500">없음</span>}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {(EXAM_TYPE_DISPLAY[row.examType] ?? row.examType) || <span className="text-red-500">없음</span>}
                      </td>
                      <td className="px-2 py-1.5">{row.examName || <span className="text-red-500">없음</span>}</td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{row.examDate}</td>
                      <td className="px-2 py-1.5">{row.subject || <span className="text-red-500">없음</span>}</td>
                      <td className="px-2 py-1.5 text-right">{row.rawScore ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right">{row.grade ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right">{row.percentile ?? "-"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[120px] truncate">{row.notes ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={isPending || validCount === 0} size="sm">
              {isPending ? "처리 중..." : `${validCount}건 저장`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreview(null)}>취소</Button>
          </div>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <span className="font-medium">{result.created}건 등록 완료</span>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
              <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {result.errors.length}건 오류
              </p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">
                  {e.row}행 ({e.studentName}): {e.reason}
                </p>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setResult(null)}>다시 업로드</Button>
        </div>
      )}

      {/* 컬럼 설명 */}
      <div className="rounded-lg bg-muted/40 border p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-medium text-foreground text-[13px]">CSV 컬럼 형식</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <div><span className="font-mono bg-muted px-1 rounded">이름</span> 학생 이름 (필수, DB에 등록된 이름과 일치)</div>
          <div><span className="font-mono bg-muted px-1 rounded">시험종류</span> 공식모의고사 / 사설모의고사 / 학교내신</div>
          <div><span className="font-mono bg-muted px-1 rounded">시험명</span> 예: 2024년 6월 모의고사 (필수)</div>
          <div><span className="font-mono bg-muted px-1 rounded">날짜</span> YYYY-MM-DD 형식 (필수)</div>
          <div><span className="font-mono bg-muted px-1 rounded">과목</span> 예: 국어, 수학, 영어 (필수)</div>
          <div><span className="font-mono bg-muted px-1 rounded">원점수</span> 숫자 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">등급</span> 1~9 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">백분위</span> 소수점 포함 숫자 (선택)</div>
          <div><span className="font-mono bg-muted px-1 rounded">메모</span> 비고 (선택)</div>
        </div>
        <p>• 한 행이 과목 하나입니다. 같은 시험의 여러 과목은 여러 행으로 입력하세요.</p>
        <p>• 시험종류: <span className="font-mono">공식모의고사</span>, <span className="font-mono">평가원</span>, <span className="font-mono">수능</span>, <span className="font-mono">OFFICIAL_MOCK</span> 모두 인식</p>
      </div>
    </div>
  );
}
