"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Sheet, RefreshCw, Link2, AlertCircle, CheckCircle2, ExternalLink, Download } from "lucide-react";
import { FormActions, FormField, IconTile, Notice, Section, StatusBadge } from "@/components/backoffice/ui";
import {
  CollapsibleGuide,
  ColumnGuide,
  ImportErrors,
  ImportSteps,
  PREVIEW_TD,
  PREVIEW_TH,
  PreviewTable,
} from "./import-ui";
import { cn } from "@/lib/utils";

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
    <div className="flex max-w-xl flex-col gap-x4">
      <FormField label="Google Sheets URL" htmlFor={`url-${type}`} required>
        <Input
          id={`url-${type}`}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
        />
      </FormField>
      <FormField label="시트(탭) 이름" htmlFor={`name-${type}`} hint="비워 두면 첫 번째 시트를 읽어요">
        <Input
          id={`name-${type}`}
          placeholder="원생목록"
          value={sheetNameInput}
          onChange={(e) => setSheetNameInput(e.target.value)}
        />
      </FormField>
      <FormActions className="justify-start">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "저장 중…" : "연결하기"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>취소</Button>
        )}
      </FormActions>
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
    <div className="flex flex-col gap-x3 rounded-r3 bg-bg-layer-fill p-x4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-x3">
        <IconTile icon={Sheet} tone="ok" size={40} />
        <div className="min-w-0">
          <div className="flex items-center gap-x1_5">
            <span className="t4-bold text-fg-neutral">시트 연결됨</span>
            {config.sheetName && <StatusBadge>{config.sheetName}</StatusBadge>}
          </div>
          <a
            href={config.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-x0_5 flex min-w-0 items-center gap-x1 t3-regular text-fg-neutral-subtle hover:text-fg-neutral hover:underline"
          >
            <span className="truncate">{config.sheetUrl}</span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          </a>
        </div>
      </div>
      <div className="flex shrink-0 gap-x1_5">
        <Button variant="outline" size="xs" onClick={onEdit} disabled={isPending}>수정</Button>
        <Button
          variant="ghost"
          size="xs"
          className="text-fg-critical"
          onClick={onDisconnect}
          disabled={isPending}
        >
          연동 해제
        </Button>
      </div>
    </div>
  );
}

// ─── Sub-component: column guide ─────────────────────────────────────────────

function SampleDownload({ onDownload }: { onDownload: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x2 border-t border-stroke-neutral-muted pt-x4">
      <Button variant="outline" size="xs" onClick={onDownload}>
        <Download />
        샘플 CSV 다운로드
      </Button>
      <span className="t3-regular text-fg-neutral-subtle">
        Google 스프레드시트 › 파일 › 가져오기로 템플릿을 만들 수 있어요
      </span>
    </div>
  );
}

function StudentColumnGuide({ onDownload }: { onDownload: () => void }) {
  return (
    <CollapsibleGuide title="시트 컬럼 형식 보기">
      <div className="flex flex-col gap-x4">
        <ColumnGuide
          columns={[
            { name: "좌석번호", description: "좌석" },
            { name: "이름", description: "원생 이름", required: true },
            { name: "학교", description: "학교명" },
            { name: "학년", description: "고3, 중2, N수 등" },
            { name: "반", description: "정규반/선택반" },
            { name: "담당 멘토", description: "시스템에 등록된 이름" },
            { name: "학생 전화번호", description: "선택" },
            { name: "학부모 전화번호", description: "선택" },
            { name: "월 입실약속시간", description: "예: 14:00" },
            { name: "월 퇴실약속시간", description: "예: 22:00" },
            { name: "학원 스케줄", description: "텍스트" },
            { name: "선택과목 / 입시전형 / 인강", description: "선택" },
          ]}
          notes={["화~일 입실/퇴실 컬럼도 같은 방식으로 추가할 수 있어요."]}
        />
        <SampleDownload onDownload={onDownload} />
      </div>
    </CollapsibleGuide>
  );
}

function ScoreColumnGuide({ onDownload }: { onDownload: () => void }) {
  return (
    <CollapsibleGuide title="시트 컬럼 형식 보기">
      <div className="flex flex-col gap-x4">
        <ColumnGuide
          columns={[
            { name: "이름", description: "등록된 이름과 같아야 해요", required: true },
            { name: "시험종류", description: "공식모의고사 / 사설모의고사 / 학교내신" },
            { name: "시험명", description: "예: 2024년 6월 모의고사", required: true },
            { name: "날짜", description: "YYYY-MM-DD", required: true },
            { name: "과목", description: "국어, 수학, 영어 등", required: true },
            { name: "원점수", description: "숫자" },
            { name: "등급", description: "1~9" },
            { name: "백분위", description: "소수점 포함" },
            { name: "메모", description: "비고" },
          ]}
          notes={["한 행 = 과목 하나. 같은 시험의 여러 과목은 여러 행으로 입력해요."]}
        />
        <SampleDownload onDownload={onDownload} />
      </div>
    </CollapsibleGuide>
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
  const summary = [
    created > 0 && `${created}건 등록`,
    updated != null && updated > 0 && `${updated}명 업데이트`,
  ].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-x3">
      <Notice tone="ok" icon={CheckCircle2} title="가져오기를 마쳤어요">
        {summary || "변경된 항목이 없어요"}
      </Notice>
      <ImportErrors errors={errors} />
      <FormActions className="justify-start">
        <Button variant="outline" size="sm" onClick={onReset}>
          <RefreshCw />다시 불러오기
        </Button>
      </FormActions>
    </div>
  );
}

// ─── Shared layout ───────────────────────────────────────────────────────────

const SHEET_STEPS = (what: string) => [
  { title: "시트 연결", description: "Google Sheets 주소를 저장해요" },
  { title: "데이터 불러오기", description: `시트에서 ${what} 데이터를 읽어 와요` },
  { title: "확인 후 저장", description: "미리보기를 확인하고 저장해요" },
];

function GoogleConnectRequired({ googleAuthUrl }: { googleAuthUrl: string }) {
  return (
    <div className="flex flex-col items-start gap-x4">
      <Notice tone="warn" icon={AlertCircle} title="Google 계정 연동 필요">
        캘린더 탭에서 Google 계정을 먼저 연동해주세요.
      </Notice>
      <Button variant="outline" onClick={() => window.open(googleAuthUrl, "_self")}>
        <Link2 />Google 계정 연동하기
      </Button>
    </div>
  );
}

function PreviewHeader({ children, onCancel, disabled }: { children: ReactNode; onCancel: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x2">
      <div className="flex flex-wrap items-center gap-x2">{children}</div>
      <Button variant="ghost" size="xs" onClick={onCancel} disabled={disabled}>취소</Button>
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
    const blob = new Blob(["﻿" + STUDENT_SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "원생관리_시트_샘플.csv"; a.click();
  }

  const connected = !!config && !isEditing;
  const step = !connected ? 0 : result ? 3 : preview ? 2 : 1;
  const namedCount = preview?.filter((r) => r.name).length ?? 0;
  const unnamedCount = preview?.filter((r) => !r.name).length ?? 0;

  return (
    <Section
      title="원생 데이터 시트"
      description="Google Sheets를 연동하면 시트를 직접 고친 뒤 버튼 하나로 원생 데이터를 가져올 수 있어요."
    >
      {!isGoogleConnected ? (
        <GoogleConnectRequired googleAuthUrl={googleAuthUrl} />
      ) : (
        <div className="flex flex-col gap-x6">
          <ImportSteps steps={SHEET_STEPS("원생")} current={step} />

          {connected ? (
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

          {connected && !preview && !result && (
            <div>
              <Button onClick={handleFetch} disabled={isPending}>
                <RefreshCw className={cn(isPending && "animate-spin")} />
                {isPending ? "불러오는 중…" : "시트에서 원생 데이터 불러오기"}
              </Button>
            </div>
          )}

          {preview && !result && (
            <div className="flex flex-col gap-x3">
              <PreviewHeader onCancel={() => setPreview(null)} disabled={isPending}>
                <p className="t5-bold text-fg-neutral">
                  <span className="tabular-nums text-fg-brand">{namedCount}명</span> 인식됐어요
                </p>
                {unnamedCount > 0 && <StatusBadge tone="bad">{unnamedCount}행 이름 없음</StatusBadge>}
              </PreviewHeader>
              <PreviewTable>
                <thead>
                  <tr>
                    {["좌석", "이름", "학교", "학년", "반", "담당 멘토", "등원 요일"].map((h) => (
                      <th key={h} className={PREVIEW_TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className={cn(!row.name && "bg-bg-critical-weak")}>
                      <td className={PREVIEW_TD}>{row.seat || "-"}</td>
                      <td className={cn(PREVIEW_TD, "t3-medium")}>{row.name || <span className="text-fg-critical">이름 없음</span>}</td>
                      <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{row.school || "-"}</td>
                      <td className={PREVIEW_TD}>{row.grade || "-"}</td>
                      <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{row.classGroup || "-"}</td>
                      <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{row.mentorName || "-"}</td>
                      <td className={PREVIEW_TD}>
                        {row.schedules.length > 0
                          ? row.schedules.map((s) => Object.entries(DAY_MAP).find(([, v]) => v === s.dayOfWeek)?.[0]).join(", ")
                          : <span className="text-fg-neutral-subtle">없음</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PreviewTable>
              <FormActions>
                <Button variant="outline" onClick={handleFetch} disabled={isPending}>
                  <RefreshCw />다시 불러오기
                </Button>
                <Button onClick={handleImport} disabled={isPending}>
                  {isPending ? "저장 중…" : `${namedCount}명 저장`}
                </Button>
              </FormActions>
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
      )}
    </Section>
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
    const blob = new Blob(["﻿" + SCORE_SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "성적입력_시트_샘플.csv"; a.click();
  }

  const validCount = preview?.filter((r) => r.studentName && r.examName && r.examDate && r.subject).length ?? 0;
  const invalidCount = (preview?.length ?? 0) - validCount;
  const connected = !!config && !isEditing;
  const step = !connected ? 0 : result ? 3 : preview ? 2 : 1;
  const missingCell = <span className="text-fg-critical">없음</span>;

  return (
    <Section
      title="성적 입력 시트"
      description="Google Sheets를 연동하면 시트를 직접 고친 뒤 버튼 하나로 성적 데이터를 가져올 수 있어요."
    >
      {!isGoogleConnected ? (
        <GoogleConnectRequired googleAuthUrl={googleAuthUrl} />
      ) : (
        <div className="flex flex-col gap-x6">
          <ImportSteps steps={SHEET_STEPS("성적")} current={step} />

          {connected ? (
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

          {connected && !preview && !result && (
            <div>
              <Button onClick={handleFetch} disabled={isPending}>
                <RefreshCw className={cn(isPending && "animate-spin")} />
                {isPending ? "불러오는 중…" : "시트에서 성적 데이터 불러오기"}
              </Button>
            </div>
          )}

          {preview && !result && (
            <div className="flex flex-col gap-x3">
              <PreviewHeader onCancel={() => setPreview(null)} disabled={isPending}>
                <p className="t5-bold text-fg-neutral">
                  <span className="tabular-nums text-fg-brand">{validCount}건</span> 인식됐어요
                </p>
                {invalidCount > 0 && <StatusBadge tone="bad">{invalidCount}행 필수 항목 없음</StatusBadge>}
              </PreviewHeader>
              <PreviewTable>
                <thead>
                  <tr>
                    {["학생", "시험종류", "시험명", "날짜", "과목", "원점수", "등급", "백분위"].map((h) => (
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
                        <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{(EXAM_TYPE_DISPLAY[row.examType] ?? row.examType) || "-"}</td>
                        <td className={PREVIEW_TD}>{row.examName || missingCell}</td>
                        <td className={cn(PREVIEW_TD, "text-fg-neutral-muted")}>{row.examDate}</td>
                        <td className={PREVIEW_TD}>{row.subject || missingCell}</td>
                        <td className={cn(PREVIEW_TD, "text-right")}>{row.rawScore ?? "-"}</td>
                        <td className={cn(PREVIEW_TD, "text-right")}>{row.grade ?? "-"}</td>
                        <td className={cn(PREVIEW_TD, "text-right")}>{row.percentile ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </PreviewTable>
              <FormActions>
                <Button variant="outline" onClick={handleFetch} disabled={isPending}>
                  <RefreshCw />다시 불러오기
                </Button>
                <Button onClick={handleImport} disabled={isPending || validCount === 0}>
                  {isPending ? "저장 중…" : `${validCount}건 저장`}
                </Button>
              </FormActions>
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
      )}
    </Section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ConnectedDot({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <>
      <span aria-hidden className="size-1.5 rounded-full bg-bg-positive-solid" />
      <span className="sr-only">(연동됨)</span>
    </>
  );
}

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
    <Tabs defaultValue="students">
      <TabsList variant="segment" aria-label="연동할 시트">
        <TabsTrigger value="students">
          원생관리
          <ConnectedDot on={!!studentsConfig} />
        </TabsTrigger>
        <TabsTrigger value="scores">
          성적 입력
          <ConnectedDot on={!!scoresConfig} />
        </TabsTrigger>
      </TabsList>
      <TabsContent value="students" className="mt-x4">
        <StudentsTab
          initialConfig={studentsConfig}
          isGoogleConnected={isGoogleConnected}
          googleAuthUrl={googleAuthUrl}
        />
      </TabsContent>
      <TabsContent value="scores" className="mt-x4">
        <ScoresTab
          initialConfig={scoresConfig}
          isGoogleConnected={isGoogleConnected}
          googleAuthUrl={googleAuthUrl}
        />
      </TabsContent>
    </Tabs>
  );
}
