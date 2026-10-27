"use client";

// 차단·허용 대상 고르기 — 규칙 추가와 일시 조치가 같이 쓴다.

import { useState } from "react";
import { Sparkles, TriangleAlert, X } from "lucide-react";
import type { AccessCatalogItem } from "@/actions/access-control";
import { CATALOG_GROUP_LABELS, CATALOG_GROUP_ORDER, RECOMMENDED_BLOCK_IDS } from "@/lib/access-control/catalog";
import { TARGET_KIND_LABELS } from "@/lib/access-control/input";
import type { AccessAction, AccessTargetKind } from "@/lib/access-control/types";
import { FilterChip, FormField, Notice, SearchField, Segmented } from "@/components/backoffice/ui";
import { Checkbox } from "@/components/ui/checkbox";
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
  return [item.name, item.id, ...(item.aliases ?? [])].some((t) => normalize(t).includes(query));
}

/** 탭: "자주 쓰는"(popular) + 묶음 순서대로. 자주 쓰는 항목은 제 묶음 탭에도 함께 나온다. */
function catalogTabs(items: AccessCatalogItem[]): { key: string; label: string; items: AccessCatalogItem[] }[] {
  return [
    { key: "popular", label: "자주 쓰는", items: items.filter((i) => i.popular) },
    ...CATALOG_GROUP_ORDER.map((g) => ({ key: g, label: CATALOG_GROUP_LABELS[g], items: items.filter((i) => i.group === g) })),
  ].filter((t) => t.items.length > 0);
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
  const [tabKey, setTabKey] = useState("popular");

  const selected = new Set(value.services);
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const tabs = catalogTabs(catalog);
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const q = normalize(query);
  // 검색 중에는 탭과 상관없이 전체에서 찾는다
  const list = q ? catalog.filter((item) => matches(item, q)) : (tab?.items ?? []);
  const listAllOn = list.length > 0 && list.every((item) => selected.has(item.id));
  const recommended = RECOMMENDED_BLOCK_IDS.filter((id) => byId.has(id));
  const recommendedAllOn = recommended.every((id) => selected.has(id));
  const cautions = catalog.filter((item) => selected.has(item.id) && item.caution);

  /** 담기(on)는 고른 순서 끝에 붙이고, 빼기는 그 항목만 지운다 */
  function set(ids: string[], on: boolean) {
    const services = on
      ? [...value.services, ...ids.filter((id) => !selected.has(id))]
      : value.services.filter((s) => !ids.includes(s));
    onChange({ ...value, services });
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

          {action === "BLOCK" && recommended.length > 0 && (
            <button
              type="button"
              onClick={() => set(recommended, !recommendedAllOn)}
              className="flex items-center gap-x3 rounded-r3 bg-bg-layer-fill px-x4 py-x3 text-left transition-colors hover:bg-bg-layer-fill-pressed"
            >
              <Sparkles className="size-4 shrink-0 text-fg-brand" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block t4-bold text-fg-neutral">
                  {recommendedAllOn ? "추천 묶음 빼기" : `추천 묶음 ${recommended.length}개 한 번에 담기`}
                </span>
                <span className="block t3-regular text-fg-neutral-subtle">
                  영상·SNS·웹툰·커뮤니티·게임·쇼핑 대표 서비스 (카카오톡·AI 제외)
                </span>
              </span>
            </button>
          )}

          {/* 고른 항목 — 누르면 빠진다 */}
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
          {selected.size > 0 && (
            <div className="flex max-h-24 flex-wrap gap-x1_5 overflow-y-auto">
              {value.services.map((id) => {
                const name = byId.get(id)?.name ?? id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => set([id], false)}
                    aria-label={`${name} 빼기`}
                    className="inline-flex h-7 shrink-0 items-center gap-x1 rounded-full bg-bg-neutral-inverted pr-x2 pl-x2_5 t3-medium text-fg-neutral-inverted transition-opacity hover:opacity-80"
                  >
                    {name}
                    <X className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </button>
                );
              })}
            </div>
          )}

          <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted">
            {!q && (
              <div className="flex flex-wrap gap-x1_5 border-b border-stroke-neutral-muted p-x2" role="tablist" aria-label="묶음">
                {tabs.map((t) => {
                  const picked = t.items.filter((item) => selected.has(item.id)).length;
                  return (
                    <FilterChip
                      key={t.key}
                      role="tab"
                      aria-selected={t.key === tab?.key}
                      selected={t.key === tab?.key}
                      count={picked > 0 ? picked : undefined}
                      onClick={() => setTabKey(t.key)}
                    >
                      {t.label}
                    </FilterChip>
                  );
                })}
              </div>
            )}
            {list.length === 0 ? (
              <p className="px-x4 py-x6 text-center t4-regular text-fg-neutral-subtle">
                찾는 이름이 없어요. 대상 종류를 ‘사이트’로 바꿔 주소로 추가할 수 있어요.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-x2 px-x4 pt-x3">
                  <span className="t3-medium text-fg-neutral-subtle">
                    {q ? `검색 결과 ${list.length}개` : `${tab?.label} ${list.length}개`}
                  </span>
                  <button
                    type="button"
                    onClick={() => set(list.map((item) => item.id), !listAllOn)}
                    className="rounded-r2 px-x1_5 py-x1 t3-bold text-fg-brand transition-colors hover:bg-bg-transparent-pressed"
                  >
                    {listAllOn ? "모두 빼기" : "모두 담기"}
                  </button>
                </div>
                <div className="grid max-h-56 grid-cols-2 gap-x0_5 overflow-y-auto p-x2">
                  {list.map((item) => (
                    <label
                      key={item.id}
                      className="flex min-w-0 cursor-pointer items-center gap-x2 rounded-r2 px-x2 py-x2 transition-colors hover:bg-bg-layer-fill"
                    >
                      <Checkbox checked={selected.has(item.id)} onCheckedChange={(on) => set([item.id], on === true)} />
                      <span className="truncate t4-regular text-fg-neutral" title={item.name}>
                        {item.name}
                      </span>
                    </label>
                  ))}
                </div>
              </>
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
