"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkImportExamScores, type ExamScoreCSVRow } from "@/actions/exam-scores";
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

const STEPS = [
  { title: "샘플 파일 받기", description: "한 행에 과목 하나씩 성적을 채워요" },
  { title: "파일 올리기", description: "완성한 CSV 파일을 끌어 놓거나 선택해요" },
  { title: "확인 후 저장", description: "인식된 성적을 확인하고 저장해요" },
];

const COLUMNS = [
  { name: "이름", description: "학생 이름 (등록된 이름과 같아야 해요)", required: true },
  { name: "시험종류", description: "공식모의고사 / 사설모의고사 / 학교내신" },
  { name: "시험명", description: "예: 2024년 6월 모의고사", required: true },
  { name: "날짜", description: "YYYY-MM-DD 형식", required: true },
  { name: "과목", description: "예: 국어, 수학, 영어", required: true },
  { name: "원점수", description: "숫자" },
  { name: "등급", description: "1~9" },
  { name: "백분위", description: "소수점 포함 숫자" },
  { name: "메모", description: "비고" },
];

export function CsvImportScores() {
  const [preview, setPreview] = useState<ExamScoreCSVRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number; errors: { row: number; studentName: string; reason: string }[] } | null>(null);

  function handleFile(file: File) {
    const tryRead = (encoding: string) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
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
    const blob = new Blob(["﻿" + SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "성적_업로드_샘플.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const validCount = preview?.filter((r) => r.studentName && r.examName && r.examDate && r.subject).length ?? 0;
  const invalidCount = (preview?.length ?? 0) - validCount;
  const step = result ? 3 : preview ? 2 : 1;
  const missingCell = <span className="text-fg-critical">없음</span>;

  return (
    <div className="flex flex-col gap-x6">
      <Section
        title="성적 CSV 업로드"
        description="모의고사·내신 성적을 CSV 파일로 한 번에 등록해요. 한 행이 과목 하나예요."
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
                  <span className="tabular-nums text-fg-brand">{validCount}건</span> 인식됐어요
                </p>
                {invalidCount > 0 && <StatusBadge tone="bad">{invalidCount}행 필수 항목 없음</StatusBadge>}
              </div>
              <PreviewTable>
                <thead>
                  <tr>
                    {["학생", "시험종류", "시험명", "날짜", "과목", "원점수", "등급", "백분위", "메모"].map((h) => (
                      <th key={h} className={cn(PREVIEW_TH, ["원점수", "등급", "백분위"].includes(h) && "text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => {
                    const missing = !row.studentName || !row.examName || !row.examDate || !row.subject;
                    return (
                      <tr key={i} className={cn(missing && "bg-bg-critical-weak")}>
                        <td className={cn(PREVIEW_TD, "t3-medium")}>{row.studentName || missingCell}</td>
                        <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>
                          {(EXAM_TYPE_DISPLAY[row.examType] ?? row.examType) || missingCell}
                        </td>
                        <td className={PREVIEW_TD}>{row.examName || missingCell}</td>
                        <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{row.examDate}</td>
                        <td className={PREVIEW_TD}>{row.subject || missingCell}</td>
                        <td className={cn(PREVIEW_TD, "text-right")}>{row.rawScore ?? "-"}</td>
                        <td className={cn(PREVIEW_TD, "text-right")}>{row.grade ?? "-"}</td>
                        <td className={cn(PREVIEW_TD, "text-right")}>{row.percentile ?? "-"}</td>
                        <td className={cn(PREVIEW_TD, "max-w-[140px] truncate text-fg-neutral-muted")}>{row.notes ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </PreviewTable>
              <FormActions>
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={isPending}>
                  취소
                </Button>
                <Button onClick={handleImport} disabled={isPending || validCount === 0}>
                  {isPending ? "저장 중…" : `${validCount}건 저장`}
                </Button>
              </FormActions>
            </div>
          )}

          {/* 3) 결과 */}
          {result && (
            <div className="flex flex-col gap-x3">
              <Notice tone="ok" icon={CheckCircle2} title="가져오기를 마쳤어요">
                {`${result.created}건 등록 완료`}
              </Notice>
              <ImportErrors errors={result.errors.map((e) => ({ row: e.row, name: e.studentName, reason: e.reason }))} />
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
            <>한 행이 과목 하나예요. 같은 시험의 여러 과목은 여러 행으로 입력하세요.</>,
            <>
              시험종류는 <ColumnName>공식모의고사</ColumnName>, <ColumnName>평가원</ColumnName>, <ColumnName>수능</ColumnName>,{" "}
              <ColumnName>OFFICIAL_MOCK</ColumnName> 모두 인식해요.
            </>,
          ]}
        />
      </Section>
    </div>
  );
}
