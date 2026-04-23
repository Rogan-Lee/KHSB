"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2, Search, X, CheckCircle2, Circle, Link2, Send, ExternalLink,
  Copy, Check, Filter, MessageCircle, Sparkles, AlertCircle, UserMinus,
} from "lucide-react";
import {
  createParentReportsForStudents,
  updateParentReportNote,
  type StudentReportRow,
  type BulkCreateByStudentResult,
} from "@/actions/parent-reports";
import { enhanceMentoringWithAI, type EnhancedMentoringContent } from "@/actions/ai-enhance";

interface Props {
  rows: StudentReportRow[];
}

export function MentoringReportTab({ rows }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeStudentId, setActiveStudentId] = useState<string | null>(rows[0]?.studentId ?? null);
  const [query, setQuery] = useState("");
  const [showOnlyWithReport, setShowOnlyWithReport] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<Record<string, "pending" | "created" | "existing" | "no-mentoring" | "failed">>({});

  // 디테일: 편집 중 customNote
  const activeRow = useMemo(() => rows.find((r) => r.studentId === activeStudentId) ?? null, [rows, activeStudentId]);
  const [noteDraft, setNoteDraft] = useState<string>("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // 활성 학생 바뀌면 편집 draft 리셋
  useMemo(() => {
    setNoteDraft(activeRow?.parentReport?.customNote ?? "");
  }, [activeRow?.parentReport?.id, activeRow?.parentReport?.customNote]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (showOnlyWithReport && !r.parentReport) return false;
      if (q && !r.studentName.toLowerCase().includes(q) && !(r.grade ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, showOnlyWithReport]);

  const createdCount = rows.filter((r) => !!r.parentReport).length;

  function toggleAll() {
    if (filtered.length > 0 && filtered.every((r) => selectedIds.has(r.studentId))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.studentId)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkCreate() {
    if (selectedIds.size === 0) {
      toast.error("학생을 선택하세요");
      return;
    }
    const targets = Array.from(selectedIds);
    const initial: Record<string, "pending"> = {};
    for (const id of targets) initial[id] = "pending";
    setBulkProgress(initial);
    setBulkBusy(true);
    try {
      const results: BulkCreateByStudentResult[] = await createParentReportsForStudents(targets);
      const next: Record<string, "created" | "existing" | "no-mentoring" | "failed"> = {};
      let created = 0, existing = 0, nomenturing = 0, failed = 0;
      for (const r of results) {
        next[r.studentId] = r.status;
        if (r.status === "created") created++;
        else if (r.status === "existing") existing++;
        else if (r.status === "no-mentoring") nomenturing++;
        else failed++;
      }
      setBulkProgress(next);
      toast.success(
        `생성 ${created}건 · 기존 ${existing}건` +
        (nomenturing > 0 ? ` · 멘토링 없음 ${nomenturing}` : "") +
        (failed > 0 ? ` · 실패 ${failed}` : "")
      );
      setShowOnlyWithReport(true);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 생성 실패");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleSaveNote() {
    if (!activeRow?.parentReport) return;
    setNoteSaving(true);
    try {
      await updateParentReportNote(activeRow.parentReport.id, noteDraft);
      toast.success("내용 저장");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleAiEnhance() {
    if (!activeRow?.latestMentoring) return;
    setAiBusy(true);
    try {
      const data: EnhancedMentoringContent = await enhanceMentoringWithAI(activeRow.latestMentoring.id);
      const text = [
        data.content && `[오늘 멘토링 내용]\n${data.content}`,
        data.improvements && `[개선된 점]\n${data.improvements}`,
        data.weaknesses && `[보완할 점]\n${data.weaknesses}`,
        data.nextGoals && `[다음 멘토링 목표]\n${data.nextGoals}`,
        data.notes && `[기타 메모]\n${data.notes}`,
      ].filter(Boolean).join("\n\n");
      setNoteDraft(text);
      toast.success("AI 초안 생성 — 검토 후 저장");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 실패");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!activeRow?.parentReport || typeof window === "undefined") return;
    const url = `${window.location.origin}/r/${activeRow.parentReport.token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("링크가 복사되었습니다");
  }

  async function handleShareKakao() {
    if (!activeRow?.parentReport || typeof window === "undefined") return;
    const url = `${window.location.origin}/r/${activeRow.parentReport.token}`;
    const dateLabel = activeRow.latestMentoring ? formatDate(activeRow.latestMentoring.date) : "오늘";
    const shareText = `안녕하세요, ${activeRow.studentName} 학부모님.\n${dateLabel} 멘토링 내용을 정리해 드립니다.\n아래 링크를 통해 확인해 주세요 👇\n\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${activeRow.studentName} 멘토링 리포트`, text: shareText }); } catch { /* 취소 */ }
    } else {
      await navigator.clipboard.writeText(shareText);
      toast.success("메시지가 복사되었습니다");
    }
  }

  async function handleBulkShareCopy() {
    const targets = Array.from(selectedIds)
      .map((sid) => rows.find((r) => r.studentId === sid))
      .filter((r): r is StudentReportRow => !!r?.parentReport);
    if (targets.length === 0) {
      toast.error("발송할 리포트가 없습니다 (선택 중 리포트 생성된 건 0)");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const lines = targets.map((r) => `${r.studentName} ${r.grade} — ${origin}/r/${r.parentReport!.token}`);
    const text = `${targets.length}건의 학부모 리포트 링크\n\n${lines.join("\n")}`;
    await navigator.clipboard.writeText(text);
    toast.success(`${targets.length}건 링크 복사됨`);
  }

  return (
    <div className="space-y-3">
      {/* 상단 툴바 */}
      <div className="flex items-center gap-2 flex-wrap bg-muted/40 rounded-md px-3 py-2">
        <span className="text-xs text-muted-foreground">
          총 {rows.length}명 · 생성 <b className="text-foreground">{createdCount}</b>건
        </span>
        <div className="ml-auto flex items-center gap-2">
          {bulkBusy && (
            <span className="text-xs text-muted-foreground">
              {Object.values(bulkProgress).filter((s) => s !== "pending").length}/{Object.keys(bulkProgress).length} 진행 중
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            onClick={handleBulkShareCopy}
            disabled={selectedIds.size === 0}
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            선택 링크 복사
          </Button>
          <Button size="sm" onClick={handleBulkCreate} disabled={bulkBusy || selectedIds.size === 0}>
            {bulkBusy ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />생성 중…</>
            ) : (
              <><Link2 className="h-3.5 w-3.5 mr-1" />선택 {selectedIds.size}명 일괄 생성</>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 min-h-[600px]">
        {/* 좌측 학생 리스트 */}
        <div className="border rounded-lg bg-background overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every((r) => selectedIds.has(r.studentId))}
                onChange={toggleAll}
                className="rounded"
                title="화면에 보이는 학생 전체 선택"
              />
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름/학년 검색"
                  className="h-7 pl-7 text-xs"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOnlyWithReport}
                onChange={(e) => setShowOnlyWithReport(e.target.checked)}
                className="rounded h-3 w-3"
              />
              <Filter className="h-3 w-3" />
              생성된 리포트만 보기
              <span className="ml-auto tabular-nums">{filtered.length}/{rows.length}</span>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto divide-y max-h-[600px]">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {query || showOnlyWithReport ? "조건에 맞는 학생 없음" : "활성 학생이 없습니다"}
              </p>
            ) : (
              filtered.map((r) => {
                const isActive = activeStudentId === r.studentId;
                const isChecked = selectedIds.has(r.studentId);
                const prog = bulkProgress[r.studentId];
                return (
                  <div
                    key={r.studentId}
                    onClick={() => setActiveStudentId(r.studentId)}
                    className={cn(
                      "cursor-pointer px-3 py-2.5 border-l-2 transition-colors",
                      isActive ? "bg-primary/5 border-primary" : "hover:bg-muted/40 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => { e.stopPropagation(); toggleOne(r.studentId); }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded shrink-0"
                      />
                      <span className="font-medium text-sm truncate">{r.studentName}</span>
                      <span className="text-[10px] text-muted-foreground">{r.grade}</span>
                      <div className="ml-auto shrink-0 flex items-center gap-1">
                        {prog === "pending" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        ) : prog === "no-mentoring" ? (
                          <span title="완료된 멘토링 없음"><UserMinus className="h-3.5 w-3.5 text-gray-400" /></span>
                        ) : prog === "failed" ? (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-red-300 text-red-700">실패</Badge>
                        ) : r.parentReport ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      {r.latestMentoring ? (
                        <>
                          <span>최근 {formatDate(r.latestMentoring.date)}</span>
                          <span>·</span>
                          <span>{r.latestMentoring.mentorName}</span>
                          {r.parentReport && <span className="text-emerald-600">· 리포트 {formatDate(r.parentReport.createdAt)}</span>}
                        </>
                      ) : (
                        <span className="text-amber-600 inline-flex items-center gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" />
                          완료된 멘토링 없음
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 우측: 상세 */}
        <div className="border rounded-lg bg-background flex flex-col min-h-[600px]">
          {!activeRow ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              좌측에서 학생을 선택하세요
            </div>
          ) : (
            <>
              {/* 헤더 */}
              <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base">{activeRow.studentName}</h3>
                    <span className="text-xs text-muted-foreground">{activeRow.grade}{activeRow.school ? ` · ${activeRow.school}` : ""}</span>
                  </div>
                  {activeRow.latestMentoring ? (
                    <p className="text-[11px] text-muted-foreground">
                      최근 멘토링 {formatDate(activeRow.latestMentoring.date)} · {activeRow.latestMentoring.mentorName}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-600">완료된 멘토링이 없습니다</p>
                  )}
                </div>
              </div>

              {!activeRow.latestMentoring ? (
                <div className="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground text-center">
                  학생에게 완료된 멘토링 기록이 있어야 학부모 리포트를 만들 수 있습니다.
                  <br />
                  먼저 &quot;멘토링 기록&quot; 탭에서 멘토링 완료 처리를 해주세요.
                </div>
              ) : !activeRow.parentReport ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    이 학생의 리포트가 아직 생성되지 않았습니다.
                  </p>
                  <Button size="sm" onClick={() => { setSelectedIds(new Set([activeRow.studentId])); handleBulkCreate(); }}>
                    <Link2 className="h-3.5 w-3.5 mr-1" />
                    이 학생 리포트 생성
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* URL 들어가는 내용 편집 */}
                  <section>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">학부모에게 전달할 내용 (공유 페이지에 표시됨)</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs ml-auto"
                        onClick={handleAiEnhance}
                        disabled={aiBusy}
                      >
                        {aiBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        AI 고도화
                      </Button>
                    </div>
                    <Textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={14}
                      placeholder="학부모에게 전달할 내용을 입력하세요. AI 고도화로 입시 컨설턴트 문체로 다듬을 수 있어요."
                      className="text-sm leading-relaxed resize-y"
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      {noteDraft !== (activeRow.parentReport.customNote ?? "") && (
                        <span className="text-[11px] text-amber-700">변경됨 — 저장 필요</span>
                      )}
                      <Button size="sm" onClick={handleSaveNote} disabled={noteSaving || noteDraft === (activeRow.parentReport.customNote ?? "")}>
                        {noteSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                        저장
                      </Button>
                    </div>
                  </section>

                  {/* URL / 발송 */}
                  <section className="border-t pt-4 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">URL · 발송</h4>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={typeof window !== "undefined" ? `${window.location.origin}/r/${activeRow.parentReport.token}` : `/r/${activeRow.parentReport.token}`}
                        className="text-xs font-mono bg-muted"
                      />
                      <Button variant="outline" size="sm" onClick={handleCopyLink}>
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <a href={`/r/${activeRow.parentReport.token}`} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm" title="학부모 화면 열기">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                    <Button
                      className="w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
                      onClick={handleShareKakao}
                    >
                      <MessageCircle className="h-4 w-4" />
                      카카오톡으로 보내기
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      개별 발송 외에 상단 &quot;선택 링크 복사&quot; 로 여러 명 링크를 한번에 복사할 수 있어요.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
