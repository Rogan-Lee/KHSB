"use client";

// 차단·허용 대상 고르기 — 규칙 추가와 일시 조치가 같이 쓴다.

import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import type { AccessCatalogItem } from "@/actions/access-control";
import { CATALOG_GROUP_ORDER } from "@/lib/access-control/catalog";
import { TARGET_KIND_LABELS } from "@/lib/access-control/input";
import type { AccessAction, AccessTargetKind } from "@/lib/access-control/types";
import { FilterChip, FormField, Notice, SearchField, Segmented } from "@/components/backoffice/ui";
import { Textarea } from "@/components/ui/textarea";

export type TargetValue = {
  kind: AccessTargetKind;
  /** 고른 서비스 id */
  services: string[];
  /** 사이트 주소 입력 원문 */
  domainsText: string;
};

export const EMPTY_TARGET: TargetValue = { kind: "SERVICE", services: [], domainsText: "" };

/** 서버에 보낼 targets — 주소 정리·검증은 서버가 한다 */
export function targetsOf(value: TargetValue): string[] | undefined {
  if (value.kind === "SERVICE") return value.services;
  if (value.kind === "DOMAIN") {
    return value.domainsText
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return undefined;
}

const KIND_OPTIONS: { value: AccessTargetKind; label: string }[] = [
  { value: "SERVICE", label: TARGET_KIND_LABELS.SERVICE },
  { value: "DOMAIN", label: TARGET_KIND_LABELS.DOMAIN },
  { value: "ALL", label: TARGET_KIND_LABELS.ALL },
];

const normalize = (s: string) => s.toLowerCase().replace(/\s/g, "");

function matches(item: AccessCatalogItem, query: string): boolean {
  if (!query) return true;
  return [item.name, item.id, ...(item.aliases ?? [])].some((t) => normalize(t).includes(query));
}

/** "자주 쓰는 항목"을 맨 위에, 나머지는 묶음 순서대로 */
function groupCatalog(items: AccessCatalogItem[]): { key: string; label: string; items: AccessCatalogItem[] }[] {
  const groups = [{ key: "popular", label: "자주 쓰는 항목", items: items.filter((i) => i.popular) }];
  for (const group of CATALOG_GROUP_ORDER) {
    const inGroup = items.filter((i) => !i.popular && i.group === group);
    if (inGroup.length > 0) groups.push({ key: group, label: inGroup[0].groupLabel, items: inGroup });
  }
  return groups.filter((g) => g.items.length > 0);
}

export function TargetPicker({
  catalog,
  action,
  value,
  onChange,
}: {
  catalog: AccessCatalogItem[];
  action: AccessAction;
  value: TargetValue;
  onChange: (next: TargetValue) => void;
}) {
  const [query, setQuery] = useState("");

  const selected = new Set(value.services);
  const groups = groupCatalog(catalog.filter((item) => matches(item, normalize(query))));
  const cautions = catalog.filter((item) => selected.has(item.id) && item.caution);

  function toggle(id: string) {
    onChange({
      ...value,
      services: selected.has(id) ? value.services.filter((s) => s !== id) : [...value.services, id],
    });
  }

  return (
    <>
      <FormField label="대상 종류">
        <Segmented
          aria-label="대상 종류"
          value={value.kind}
          onChange={(kind) => onChange({ ...value, kind })}
          options={KIND_OPTIONS}
        />
      </FormField>

      {value.kind === "SERVICE" && (
        <FormField label="앱·서비스" htmlFor="access-target-search">
          <SearchField
            id="access-target-search"
            className="sm:w-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            // 검색어를 치고 Enter 를 눌러도 폼이 제출되지 않게 한다
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="이름으로 찾기 (예: 유튜브)"
          />
          <div className="max-h-64 overflow-y-auto rounded-r3 border border-stroke-neutral-muted p-x3">
            {groups.length === 0 ? (
              <p className="py-x6 text-center t4-regular text-fg-neutral-subtle">
                찾는 이름이 없어요. 대상 종류를 ‘사이트’로 바꿔 주소로 추가할 수 있어요.
              </p>
            ) : (
              <div className="flex flex-col gap-x4">
                {groups.map((group) => (
                  <div key={group.key} role="group" aria-label={group.label}>
                    <p className="mb-x2 t3-medium text-fg-neutral-subtle">{group.label}</p>
                    <div className="flex flex-wrap gap-x1_5">
                      {group.items.map((item) => (
                        <FilterChip key={item.id} selected={selected.has(item.id)} onClick={() => toggle(item.id)}>
                          {selected.has(item.id) && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
                          {item.name}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-x2">
            <p className="t3-regular text-fg-neutral-subtle" aria-live="polite">
              {selected.size > 0 ? (
                <>
                  <span className="t3-bold tabular-nums text-fg-brand">{selected.size}개</span> 골랐어요
                </>
              ) : (
                "하나 이상 골라 주세요"
              )}
            </p>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => onChange({ ...value, services: [] })}
                className="rounded-r2 px-x1_5 py-x1 t3-medium text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
              >
                모두 해제
              </button>
            )}
          </div>
          {cautions.map((item) => (
            <Notice key={item.id} tone="warn" icon={TriangleAlert} title={item.name}>
              {item.caution}
            </Notice>
          ))}
        </FormField>
      )}

      {value.kind === "DOMAIN" && (
        <FormField
          label="사이트 주소"
          htmlFor="access-target-domains"
          hint="여러 개는 줄을 바꾸거나 쉼표로 나눠 주세요. 하위 주소까지 함께 적용돼요."
        >
          <Textarea
            id="access-target-domains"
            rows={3}
            value={value.domainsText}
            onChange={(e) => onChange({ ...value, domainsText: e.target.value })}
            placeholder={"youtube.com\nnamu.wiki"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </FormField>
      )}

      {value.kind === "ALL" && (
        <p className="rounded-r3 bg-bg-layer-fill px-x4 py-x3 t4-regular text-fg-neutral-muted">
          {action === "BLOCK"
            ? "따로 허용해 둔 곳만 빼고 인터넷 전체를 막아요. 학생 앱과 와이파이 연결 확인은 항상 열려 있어요."
            : "인터넷 전체 잠금만 풀어요. 유튜브 차단처럼 따로 막아 둔 곳은 그대로 막혀 있어요."}
        </p>
      )}
    </>
  );
}
