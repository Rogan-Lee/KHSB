"use client";

import { useState } from "react";
import { Clock, Plus, ShieldBan, Trash2 } from "lucide-react";
import {
  deleteAccessRule,
  setAccessRuleEnabled,
  type AccessOverview,
  type AccessRuleView,
} from "@/actions/access-control";
import type { AccessAction, AccessScope } from "@/lib/access-control/types";
import { EmptyState, FilterChip, SearchField, Section, StatusBadge, Toolbar } from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";
import { Switch } from "seed-design/ui/switch";
import { cn } from "@/lib/utils";
import { RuleDialog } from "./rule-dialog";
import { RuleScheduleDialog } from "./rule-schedule-dialog";
import { ActionBadge, KindBadge, scheduleText, studentText, useAccessAction } from "./shared";

export function RulesTab({ overview }: { overview: AccessOverview }) {
  const { rules, canManage } = overview;
  const { busyKey, run } = useAccessAction();
  const { confirm, dialog } = useConfirmDialog();
  const [actionFilter, setActionFilter] = useState<AccessAction | null>(null);
  const [scopeFilter, setScopeFilter] = useState<AccessScope | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = rules.filter(
    (r) =>
      (!actionFilter || r.action === actionFilter) &&
      (!scopeFilter || r.scope === scopeFilter) &&
      (!q || r.label.toLowerCase().includes(q) || (r.student?.name.toLowerCase().includes(q) ?? false)),
  );
  // 열어 둔 사이 규칙이 지워졌으면 다이얼로그도 닫힌다
  const editing = rules.find((r) => r.id === editingId) ?? null;

  function toggle(rule: AccessRuleView) {
    run(() => setAccessRuleEnabled(rule.id, !rule.enabled), {
      key: rule.id,
      success: rule.enabled ? "규칙을 껐어요" : "규칙을 켰어요",
    });
  }

  async function remove(rule: AccessRuleView) {
    const ok = await confirm({
      title: `${rule.label} ${rule.action === "BLOCK" ? "차단" : "허용"} 규칙을 삭제할까요?`,
      description: "삭제하면 되돌릴 수 없어요. 잠깐만 멈추려면 규칙을 꺼 두세요.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    run(() => deleteAccessRule(rule.id), { key: rule.id, success: "규칙을 삭제했어요" });
  }

  return (
    <div className="flex flex-col gap-x4">
      {!canManage && <p className="t4-regular text-fg-neutral-subtle">규칙은 원장 계정만 바꿀 수 있어요.</p>}

      <div>
        <Toolbar>
          <div className="flex flex-wrap items-center gap-x2" role="group" aria-label="동작 필터">
            <FilterChip selected={actionFilter === null} count={rules.length} onClick={() => setActionFilter(null)}>
              전체
            </FilterChip>
            <FilterChip
              selected={actionFilter === "BLOCK"}
              count={rules.filter((r) => r.action === "BLOCK").length}
              onClick={() => setActionFilter("BLOCK")}
            >
              차단
            </FilterChip>
            <FilterChip
              selected={actionFilter === "ALLOW"}
              count={rules.filter((r) => r.action === "ALLOW").length}
              onClick={() => setActionFilter("ALLOW")}
            >
              허용
            </FilterChip>
          </div>
          <span className="hidden h-5 w-px bg-stroke-neutral-muted sm:block" aria-hidden />
          {/* 대상 필터는 다시 누르면 풀린다 */}
          <div className="flex flex-wrap items-center gap-x2" role="group" aria-label="대상 필터">
            <FilterChip
              selected={scopeFilter === "GLOBAL"}
              onClick={() => setScopeFilter(scopeFilter === "GLOBAL" ? null : "GLOBAL")}
            >
              전체 대상
            </FilterChip>
            <FilterChip
              selected={scopeFilter === "STUDENT"}
              onClick={() => setScopeFilter(scopeFilter === "STUDENT" ? null : "STUDENT")}
            >
              학생 대상
            </FilterChip>
          </div>
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            placeholder="대상·학생 이름 검색"
            aria-label="규칙 검색"
            className="sm:ml-auto"
          />
          {canManage && (
            <Button variant="ink" onClick={() => setAdding(true)} className="w-full sm:w-auto">
              <Plus /> 규칙 추가
            </Button>
          )}
        </Toolbar>

        <Section flush className="overflow-hidden">
          {shown.length === 0 ? (
            rules.length === 0 ? (
              <EmptyState
                icon={ShieldBan}
                title="아직 규칙이 없어요"
                description={
                  canManage
                    ? "‘규칙 추가’로 막을 앱·사이트와 시간을 정해 보세요."
                    : "원장 계정에서 규칙을 만들면 여기에 보여요."
                }
              />
            ) : (
              <EmptyState compact icon={ShieldBan} title="조건에 맞는 규칙이 없어요" description="필터나 검색어를 바꿔 보세요." />
            )
          ) : (
            <ul className="divide-y divide-stroke-neutral-muted">
              {shown.map((r) => (
                <li key={r.id} className="flex flex-col gap-x3 px-x5 py-x4 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-x3">
                    {canManage && (
                      <Switch
                        size="24"
                        checked={r.enabled}
                        disabled={busyKey === r.id}
                        onCheckedChange={() => toggle(r)}
                        inputProps={{ "aria-label": `${r.label} ${r.action === "BLOCK" ? "차단" : "허용"} 규칙 사용` }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x2">
                        <ActionBadge action={r.action} />
                        <span className={cn("t4-bold", r.enabled ? "text-fg-neutral" : "text-fg-neutral-subtle")}>
                          {r.label}
                        </span>
                        <KindBadge kind={r.targetKind} />
                        {r.activeNow && <StatusBadge tone="brand">지금 적용</StatusBadge>}
                        {r.overriddenNow && <StatusBadge tone="gray">다른 조치가 우선</StatusBadge>}
                        {!r.enabled && <StatusBadge tone="gray">꺼짐</StatusBadge>}
                      </div>
                      <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                        <span className="t3-medium text-fg-neutral-muted">
                          {r.student ? studentText(r.student) : "전체"}
                        </span>
                        {" · "}
                        {scheduleText(r)}
                      </p>
                      {r.note && <p className="mt-x1_5 t4-regular text-fg-neutral-muted">{r.note}</p>}
                      {r.createdByName && (
                        <p className="mt-x1_5 t3-regular text-fg-neutral-subtle">{r.createdByName} 등록</p>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-x2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyKey === r.id}
                        onClick={() => setEditingId(r.id)}
                        className="flex-1 sm:flex-none"
                      >
                        <Clock /> 시간 변경
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyKey === r.id}
                        onClick={() => remove(r)}
                        className="flex-1 sm:flex-none"
                      >
                        <Trash2 /> 삭제
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="rounded-r4 bg-bg-layer-fill px-x5 py-x4">
        <p className="t4-medium text-fg-neutral-muted">겹칠 때는 이렇게 적용돼요</p>
        <ul className="mt-x2 flex list-disc flex-col gap-x1 pl-x5 t3-regular text-fg-neutral-subtle">
          <li>일시 조치가 규칙보다 먼저예요.</li>
          <li>학생 대상이 전체 대상보다 먼저예요.</li>
          <li>시간을 정한 규칙이 ‘항상’ 규칙보다 먼저예요. 유튜브를 항상 막고 점심시간에만 허용해 두면 점심시간에는 열려요.</li>
          <li>인터넷 전체 허용은 전체 잠금만 풀어요. 유튜브 차단처럼 따로 막아 둔 곳은 그대로 막혀 있어요.</li>
        </ul>
      </div>

      {adding && <RuleDialog catalog={overview.catalog} students={overview.students} onClose={() => setAdding(false)} />}
      {editing && <RuleScheduleDialog key={editing.id} rule={editing} onClose={() => setEditingId(null)} />}
      {dialog}
    </div>
  );
}
