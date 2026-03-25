"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { importStudentsCSV, type CSVImportRow } from "@/actions/import";
import { bulkImportExamScores, type ExamScoreCSVRow } from "@/actions/exam-scores";
import {
  type SheetType,
  saveGoogleSheetsConfig,
  clearGoogleSheetsConfig,
  readStudentsFromSheet,
  readScoresFromSheet,
} from "@/actions/google-sheets";
import { toast } from "sonner";
import {
  Sheet, RefreshCw, Link2, Link2Off, AlertCircle,
  CheckCircle2, ExternalLink, FileText, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Sample data ──────────────────────────────────────────────────────────────

const STUDENT_SAMPLE_CSV = `좌석번호,이름,학교,학년,반,학생 전화번호,학부모 전화번호,학부모 이메일,담당 멘토,월 입실약속시간,월 퇴실약속시간,화 입실약속시간,화 퇴실약속시간,수 입실약속시간,수 퇴실약속시간,목 입실약속시간,목 퇴실약속시간,금 입실약속시간,금 퇴실약속시간,토 입실약속시간,토 퇴실약속시간,일 입실약속시간,일 퇴실약속시간,학원 스케줄,학생정보,선택과목,입시전형,인강
A-01,홍길동,○○고등학교,3,정규반,010-1234-5678,010-9876-5432,parent@email.com,김멘토,14:00,22:00,14:00,22:00,14:00,22:00,14:00,22:00,14:00,22:00,,,,"수학학원 월수금 17-19시","집중력 좋음","수학, 영어, 사탐","수시 학생부종합","메가스터디 수학"
A-02,이수연,□□중학교,2,선택반,010-2345-6789,010-8765-4321,,이멘토,,,14:00,22:00,,,,14:00,22:00,,,,영어학원 화목 18-20시,,,,`;

const SCORE_SAMPLE_CSV = `이름,시험종류,시험명,날짜,과목,원점수,등급,백분위,메모
홍길동,공식모의고사,2024년 6월 모의고사,2024-06-04,국어,85,2,87.3,
홍길동,공식모의고사,2024년 6월 모의고사,2024-06-04,수학,92,1,95.1,
이수연,사설모의고사,메가 전국모의고사,2024-05-20,영어,78,3,72.0,기초 문법 보완 필요
박민준,학교내신,2024-1학기 중간고사,2024-04-15,수학,95,1,,`;

const DAY_MAP: Record<string, number> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 };

// ─── Types ────────────────────────────────────────────────────────────────────

type Config = { sheetUrl: string; sheetName: string | null } | null;

// ─── Sub-component: config form ───────────────────────────────────────────────

function ConfigForm({
  type,
  config,
  onSaved,
  onCancel,
}: {
  type: SheetType;
  config: Config;
  onSaved: (c: Config) => void;
  onCancel?: () => void;
}) {
  const [urlInput, setUrlInput] = useState(config?.sheetUrl ?? "");
  const [sheetNameInput, setSheetNameInput] = useState(config?.sheetName ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const url = urlInput.trim();
    if (!url) { toast.error("URL을 입력해주세요"); return; }
    if (!url.includes("docs.google.com/spreadsheets")) { toast.error("Google Sheets URL이 아닙니다"); return; }
    startTransition(async () => {
      try {
        await saveGoogleSheetsConfig(type, url, sheetNameInput.trim() || undefined);
        onSaved({ sheetUrl: url, sheetName: sheetNameInput.trim() || null });
        toast.success("시트 연동 완료");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <div className="space-y-3 max-w-lg">
      <div className="space-y-1.5">
        <Label htmlFor={`url-${type}`}>Google Sheets URL</Label>
        <Input
          id={`url-${type}`}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`name-${type}`}>
          시트(탭) 이름 <span className="text-muted-foreground font-normal text-xs">(비워두면 첫 번째 시트)</span>
        </Label>
        <Input
          id={`name-${type}`}
          placeholder="원생목록"
          value={sheetNameInput}
          onChange={(e) => setSheetNameInput(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "저장 중..." : "저장"}
        </Button>
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>취소</Button>
        )}
      </div>
    </div>
  );
}

// ─── Sub-component: connected header ─────────────────────────────────────────

function ConnectedHeader({
  config,
  onEdit,
  onDisconnect,
  isPending,
}: {
  config: NonNullable<Config>;
  onEdit: () => void;
  onDisconnect: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-start justify-between gap-4">
      <div className="flex items-start gap-2.5">
        <Sheet className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
        <div className="space-y-0.5 min-w-0">
          <a
            href={config.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 truncate max-w-xs"
          >
            {config.sheetUrl.length > 55 ? config.sheetUrl.slice(0, 55) + "…" : config.sheetUrl}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          {config.sheetName && <p className="text-xs text-muted-foreground">시트: {config.sheetName}</p>}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onEdit} disabled={isPending}>수정</Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={onDisconnect} disabled={isPending}>
          <Link2Off className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Sub-component: column guide ─────────────────────────────────────────────

function StudentColumnGuide({ onDownload }: { onDownload: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-muted/40 border text-xs text-muted-foreground overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium text-foreground text-[13px]">시트 컬럼 형식 보기</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-3">
            <div><span className="font-mono bg-muted px-1 rounded">좌석번호</span> 좌석 (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">이름</span> 원생 이름 (필수)</div>
            <div><span className="font-mono bg-muted px-1 rounded">학교</span> 학교명 (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">학년</span> 고3, 중2, N수 등</div>
            <div><span className="font-mono bg-muted px-1 rounded">반</span> 정규반/선택반 (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">담당 멘토</span> 시스템에 등록된 이름</div>
            <div><span className="font-mono bg-muted px-1 rounded">학생 전화번호</span> (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">학부모 전화번호</span> (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">월 입실약속시간</span> 예: 14:00</div>
            <div><span className="font-mono bg-muted px-1 rounded">월 퇴실약속시간</span> 예: 22:00</div>
            <div><span className="font-mono bg-muted px-1 rounded">학원 스케줄</span> 텍스트 (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">선택과목 / 입시전형 / 인강</span> (선택)</div>
          </div>
          <p>• 화~일 입실/퇴실 컬럼도 동일한 방식으로 추가 가능</p>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDownload}>
              <FileText className="h-3 w-3 mr-1" />
              샘플 CSV 다운로드
            </Button>
            <span className="text-muted-foreground">→ Google 스프레드시트 &gt; 파일 &gt; 가져오기로 템플릿 생성</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreColumnGuide({ onDownload }: { onDownload: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-muted/40 border text-xs text-muted-foreground overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium text-foreground text-[13px]">시트 컬럼 형식 보기</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-3">
            <div><span className="font-mono bg-muted px-1 rounded">이름</span> DB 등록 이름과 일치 (필수)</div>
            <div><span className="font-mono bg-muted px-1 rounded">시험종류</span> 공식모의고사 / 사설모의고사 / 학교내신</div>
            <div><span className="font-mono bg-muted px-1 rounded">시험명</span> 예: 2024년 6월 모의고사 (필수)</div>
            <div><span className="font-mono bg-muted px-1 rounded">날짜</span> YYYY-MM-DD (필수)</div>
            <div><span className="font-mono bg-muted px-1 rounded">과목</span> 국어, 수학, 영어 등 (필수)</div>
            <div><span className="font-mono bg-muted px-1 rounded">원점수</span> 숫자 (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">등급</span> 1~9 (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">백분위</span> 소수점 포함 (선택)</div>
            <div><span className="font-mono bg-muted px-1 rounded">메모</span> 비고 (선택)</div>
          </div>
          <p>• 한 행 = 과목 하나. 같은 시험의 여러 과목은 여러 행으로 입력</p>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDownload}>
              <FileText className="h-3 w-3 mr-1" />
              샘플 CSV 다운로드
            </Button>
            <span className="text-muted-foreground">→ Google 스프레드시트 &gt; 파일 &gt; 가져오기로 템플릿 생성</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-component: import result ────────────────────────────────────────────

function ImportResult({
  created,
  updated,
  errors,
  onReset,
}: {
  created: number;
  updated?: number;
  errors: { row: number; name: string; reason: string }[];
  onReset: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <span>
          {created > 0 && <span className="font-medium">{created}건 등록</span>}
          {created > 0 && updated && updated > 0 && <span className="text-muted-foreground mx-1">·</span>}
          {updated && updated > 0 && <span className="font-medium">{updated}명 업데이트</span>}
        </span>
      </div>
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
          <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />{errors.length}건 오류
          </p>
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600">{e.row}행 ({e.name}): {e.reason}</p>
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" onClick={onReset}>
        <RefreshCw className="h-3.5 w-3.5 mr-1" />다시 불러오기
      </Button>
    </div>
  );
}

// ─── Students tab ─────────────────────────────────────────────────────────────

function StudentsTab({
  initialConfig,
  isGoogleConnected,
  googleAuthUrl,
}: {
  initialConfig: Config;
  isGoogleConnected: boolean;
  googleAuthUrl: string;
}) {
  const [config, setConfig] = useState<Config>(initialConfig);
  const [isEditing, setIsEditing] = useState(!initialConfig);
  const [preview, setPreview] = useState<CSVImportRow[] | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; name: string; reason: string }[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDisconnect() {
    startTransition(async () => {
      await clearGoogleSheetsConfig("students");
      setConfig(null); setIsEditing(true); setPreview(null); setResult(null);
      toast.success("연동 해제됨");
    });
  }

  function handleFetch() {
    startTransition(async () => {
      const res = await readStudentsFromSheet();
      if (!res.ok) { toast.error(res.error); return; }
      if (res.rows.length === 0) { toast.error("데이터를 찾을 수 없습니다. 헤더를 확인해주세요."); return; }
      setPreview(res.rows); setResult(null);
      toast.success(`${res.rows.filter((r) => r.name).length}명 인식됨`);
    });
  }

  function handleImport() {
    if (!preview) return;
    const valid = preview.filter((r) => r.name.trim());
    startTransition(async () => {
      try {
        const res = await importStudentsCSV(valid);
        setResult({ created: res.created, updated: res.updated, errors: res.errors });
        if (res.errors.length === 0) { toast.success(`${res.created}명 등록, ${res.updated}명 업데이트`); setPreview(null); }
        else toast.warning(`${res.created + res.updated}건 처리, ${res.errors.length}건 오류`);
      } catch { toast.error("가져오기 실패"); }
    });
  }

  function downloadSample() {
    const blob = new Blob(["\uFEFF" + STUDENT_SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "원생관리_시트_샘플.csv"; a.click();
  }

  if (!isGoogleConnected) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Google 계정 연동 필요</p>
            <p className="text-amber-700 mt-0.5">캘린더 탭에서 Google 계정을 먼저 연동해주세요.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.open(googleAuthUrl, "_self")}>
          <Link2 className="h-4 w-4 mr-1.5" />Google 계정 연동하기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {config && !isEditing ? (
        <ConnectedHeader
          config={config}
          onEdit={() => setIsEditing(true)}
          onDisconnect={handleDisconnect}
          isPending={isPending}
        />
      ) : (
        <ConfigForm
          type="students"
          config={config}
          onSaved={(c) => { setConfig(c); setIsEditing(false); }}
          onCancel={config ? () => setIsEditing(false) : undefined}
        />
      )}

      {config && !isEditing && !preview && !result && (
        <Button onClick={handleFetch} disabled={isPending} size="sm">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? "불러오는 중..." : "시트에서 원생 데이터 불러오기"}
        </Button>
      )}

      {preview && !result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              미리보기 — <span className="text-primary">{preview.filter((r) => r.name).length}명</span> 인식됨
              {preview.some((r) => !r.name) && (
                <span className="text-red-500 ml-2 text-xs">({preview.filter((r) => !r.name).length}행 이름 없음)</span>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)} disabled={isPending}>취소</Button>
          </div>
          <div className="rounded-lg border overflow-x-auto max-h-56 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b text-muted-foreground">
                  {["좌석", "이름", "학교", "학년", "반", "담당 멘토", "등원 요일"].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={`border-b ${!row.name ? "bg-red-50" : ""}`}>
                    <td className="px-2 py-1.5 font-mono">{row.seat || "-"}</td>
                    <td className="px-2 py-1.5 font-medium">{row.name || <span className="text-red-500">이름 없음</span>}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.school || "-"}</td>
                    <td className="px-2 py-1.5">{row.grade || "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.classGroup || "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.mentorName || "-"}</td>
                    <td className="px-2 py-1.5">
                      {row.schedules.length > 0
                        ? row.schedules.map((s) => Object.entries(DAY_MAP).find(([, v]) => v === s.dayOfWeek)?.[0]).join(", ")
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
            <Button variant="outline" size="sm" onClick={handleFetch} disabled={isPending}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />다시 불러오기
            </Button>
          </div>
        </div>
      )}

      {result && (
        <ImportResult
          created={result.created}
          updated={result.updated}
          errors={result.errors.map((e) => ({ row: e.row, name: e.name, reason: e.reason }))}
          onReset={() => { setResult(null); handleFetch(); }}
        />
      )}

      <StudentColumnGuide onDownload={downloadSample} />
    </div>
  );
}

// ─── Scores tab ───────────────────────────────────────────────────────────────

const EXAM_TYPE_DISPLAY: Record<string, string> = {
  OFFICIAL_MOCK: "공식 모의고사", 공식모의고사: "공식 모의고사", 평가원: "공식 모의고사", 수능: "공식 모의고사",
  PRIVATE_MOCK: "사설 모의고사", 사설모의고사: "사설 모의고사", 사설: "사설 모의고사",
  SCHOOL_EXAM: "학교 내신", 학교내신: "학교 내신", 내신: "학교 내신",
};

function ScoresTab({
  initialConfig,
  isGoogleConnected,
  googleAuthUrl,
}: {
  initialConfig: Config;
  isGoogleConnected: boolean;
  googleAuthUrl: string;
}) {
  const [config, setConfig] = useState<Config>(initialConfig);
  const [isEditing, setIsEditing] = useState(!initialConfig);
  const [preview, setPreview] = useState<ExamScoreCSVRow[] | null>(null);
  const [result, setResult] = useState<{ created: number; errors: { row: number; name: string; reason: string }[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDisconnect() {
    startTransition(async () => {
      await clearGoogleSheetsConfig("scores");
      setConfig(null); setIsEditing(true); setPreview(null); setResult(null);
      toast.success("연동 해제됨");
    });
  }

  function handleFetch() {
    startTransition(async () => {
      const res = await readScoresFromSheet();
      if (!res.ok) { toast.error(res.error); return; }
      if (res.rows.length === 0) { toast.error("데이터를 찾을 수 없습니다. 헤더를 확인해주세요."); return; }
      setPreview(res.rows); setResult(null);
      const validCount = res.rows.filter((r) => r.studentName && r.examName && r.examDate && r.subject).length;
      toast.success(`${validCount}건 인식됨`);
    });
  }

  function handleImport() {
    if (!preview) return;
    const valid = preview.filter((r) => r.studentName.trim() && r.examName && r.examDate && r.subject);
    startTransition(async () => {
      try {
        const res = await bulkImportExamScores(valid);
        setResult({ created: res.created, errors: res.errors.map((e) => ({ row: e.row, name: e.studentName, reason: e.reason })) });
        if (res.errors.length === 0) { toast.success(`${res.created}건 성적 등록 완료`); setPreview(null); }
        else toast.warning(`${res.created}건 등록, ${res.errors.length}건 오류`);
      } catch { toast.error("가져오기 실패"); }
    });
  }

  function downloadSample() {
    const blob = new Blob(["\uFEFF" + SCORE_SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "성적입력_시트_샘플.csv"; a.click();
  }

  const validCount = preview?.filter((r) => r.studentName && r.examName && r.examDate && r.subject).length ?? 0;

  if (!isGoogleConnected) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Google 계정 연동 필요</p>
            <p className="text-amber-700 mt-0.5">캘린더 탭에서 Google 계정을 먼저 연동해주세요.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.open(googleAuthUrl, "_self")}>
          <Link2 className="h-4 w-4 mr-1.5" />Google 계정 연동하기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {config && !isEditing ? (
        <ConnectedHeader
          config={config}
          onEdit={() => setIsEditing(true)}
          onDisconnect={handleDisconnect}
          isPending={isPending}
        />
      ) : (
        <ConfigForm
          type="scores"
          config={config}
          onSaved={(c) => { setConfig(c); setIsEditing(false); }}
          onCancel={config ? () => setIsEditing(false) : undefined}
        />
      )}

      {config && !isEditing && !preview && !result && (
        <Button onClick={handleFetch} disabled={isPending} size="sm">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? "불러오는 중..." : "시트에서 성적 데이터 불러오기"}
        </Button>
      )}

      {preview && !result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              미리보기 — <span className="text-primary">{validCount}건</span> 인식됨
            </p>
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)} disabled={isPending}>취소</Button>
          </div>
          <div className="rounded-lg border overflow-x-auto max-h-56 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b text-muted-foreground">
                  {["학생", "시험종류", "시험명", "날짜", "과목", "원점수", "등급", "백분위"].map((h) => (
                    <th key={h} className={`px-2 py-1.5 ${["원점수", "등급", "백분위"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => {
                  const missing = !row.studentName || !row.examName || !row.examDate || !row.subject;
                  return (
                    <tr key={i} className={`border-b ${missing ? "bg-red-50" : ""}`}>
                      <td className="px-2 py-1.5 font-medium">{row.studentName || <span className="text-red-500">없음</span>}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{(EXAM_TYPE_DISPLAY[row.examType] ?? row.examType) || "-"}</td>
                      <td className="px-2 py-1.5">{row.examName || <span className="text-red-500">없음</span>}</td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{row.examDate}</td>
                      <td className="px-2 py-1.5">{row.subject || <span className="text-red-500">없음</span>}</td>
                      <td className="px-2 py-1.5 text-right">{row.rawScore ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right">{row.grade ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right">{row.percentile ?? "-"}</td>
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
            <Button variant="outline" size="sm" onClick={handleFetch} disabled={isPending}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />다시 불러오기
            </Button>
          </div>
        </div>
      )}

      {result && (
        <ImportResult
          created={result.created}
          errors={result.errors}
          onReset={() => { setResult(null); handleFetch(); }}
        />
      )}

      <ScoreColumnGuide onDownload={downloadSample} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SheetsImport({
  studentsConfig,
  scoresConfig,
  googleAuthUrl,
  isGoogleConnected,
}: {
  studentsConfig: Config;
  scoresConfig: Config;
  googleAuthUrl: string;
  isGoogleConnected: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Google Sheets를 연동하면 시트를 직접 수정한 뒤 버튼 하나로 데이터를 가져올 수 있습니다.
      </p>
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students" className="gap-1.5">
            원생관리
            {studentsConfig && <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />}
          </TabsTrigger>
          <TabsTrigger value="scores" className="gap-1.5">
            성적 입력
            {scoresConfig && <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="mt-4">
          <StudentsTab
            initialConfig={studentsConfig}
            isGoogleConnected={isGoogleConnected}
            googleAuthUrl={googleAuthUrl}
          />
        </TabsContent>
        <TabsContent value="scores" className="mt-4">
          <ScoresTab
            initialConfig={scoresConfig}
            isGoogleConnected={isGoogleConnected}
            googleAuthUrl={googleAuthUrl}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
