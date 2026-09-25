"use client";

import { getMinimumPlan, PLAN_LABELS, type FeatureKey, type PlanTier } from "@/lib/features";
import { Lock, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";

// 플랜 배지 색 — lib/features 의 PLAN_LABELS.color(원색 유틸) 대신 SEED 역할색으로 표시
const PLAN_TONE: Record<PlanTier, Tone> = {
  STARTER: "gray",
  STANDARD: "info",
  PREMIUM: "violet",
};

const PLAN_ORDER: PlanTier[] = ["STARTER", "STANDARD", "PREMIUM"];

/**
 * 현재 플랜에서 사용할 수 없는 기능에 접근했을 때 표시하는 업그레이드 안내 컴포넌트.
 * 각 page.tsx에서 feature gate로 사용.
 */
export function UpgradeGate({
  feature,
  currentPlan,
}: {
  feature: FeatureKey;
  currentPlan: PlanTier;
}) {
  const requiredPlan = getMinimumPlan(feature);
  const planInfo = PLAN_LABELS[requiredPlan];
  const currentPlanInfo = PLAN_LABELS[currentPlan];

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-x4 py-x12 text-center">
      <span
        aria-hidden
        className="mb-x5 grid size-x14 place-items-center rounded-full bg-bg-neutral-weak text-fg-neutral-subtle"
      >
        <Lock className="size-7" />
      </span>

      <h2 className="t7-bold text-fg-neutral">플랜 업그레이드가 필요해요</h2>

      <p className="mt-x2 max-w-md t4-regular text-fg-neutral-subtle">
        이 기능은{" "}
        <StatusBadge tone={PLAN_TONE[requiredPlan]}>{planInfo.label}</StatusBadge>
        {" "}플랜부터 사용할 수 있어요. 지금은{" "}
        <StatusBadge tone={PLAN_TONE[currentPlan]}>{currentPlanInfo.label}</StatusBadge>
        {" "}플랜을 쓰고 있어요.
      </p>

      <div className="mt-x8 w-full max-w-sm rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5 text-left">
        <ul className="flex flex-col divide-y divide-stroke-neutral-muted">
          {PLAN_ORDER.map((tier) => (
            <PlanCompare key={tier} tier={tier} requiredPlan={requiredPlan} current={tier === currentPlan} />
          ))}
        </ul>

        <Button className="mt-x5 w-full" disabled>
          업그레이드 (준비 중)
        </Button>
        <p className="mt-x2 text-center t3-regular text-fg-neutral-subtle">
          결제 시스템을 준비하고 있어요. 관리자에게 문의해 주세요.
        </p>
      </div>
    </div>
  );
}

function PlanCompare({
  tier,
  requiredPlan,
  current,
}: {
  tier: PlanTier;
  requiredPlan: PlanTier;
  current: boolean;
}) {
  const isIncluded = PLAN_ORDER.indexOf(tier) >= PLAN_ORDER.indexOf(requiredPlan);
  const info = PLAN_LABELS[tier];

  return (
    <li className="flex items-center justify-between gap-x3 py-x3 first:pt-0 last:pb-0">
      <span className={cn("flex items-center gap-x2 t4-medium", isIncluded ? "text-fg-neutral" : "text-fg-neutral-subtle")}>
        {info.label}
        {current && <StatusBadge tone="gray">현재</StatusBadge>}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-x1 t3-medium",
          isIncluded ? "text-fg-positive" : "text-fg-neutral-subtle",
        )}
      >
        {isIncluded ? <Check className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
        {isIncluded ? "포함" : "미포함"}
      </span>
    </li>
  );
}
