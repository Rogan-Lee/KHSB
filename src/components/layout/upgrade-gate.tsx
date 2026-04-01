"use client";

import { getMinimumPlan, PLAN_LABELS, type FeatureKey, type PlanTier } from "@/lib/features";
import { Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>

      <h2 className="text-xl font-bold mb-2">
        플랜 업그레이드가 필요합니다
      </h2>

      <p className="text-sm text-muted-foreground max-w-md mb-6">
        이 기능은{" "}
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${planInfo.color}`}>
          {planInfo.label}
        </span>
        {" "}플랜부터 사용할 수 있습니다.
        현재{" "}
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${currentPlanInfo.color}`}>
          {currentPlanInfo.label}
        </span>
        {" "}플랜을 이용 중입니다.
      </p>

      <div className="rounded-xl border bg-card p-6 max-w-sm w-full space-y-4">
        <div className="space-y-2">
          <PlanCompare label="Starter" tier="STARTER" requiredPlan={requiredPlan} />
          <PlanCompare label="Standard" tier="STANDARD" requiredPlan={requiredPlan} />
          <PlanCompare label="Premium" tier="PREMIUM" requiredPlan={requiredPlan} />
        </div>

        <Button className="w-full gap-2" disabled>
          업그레이드 (준비 중)
          <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-[11px] text-muted-foreground">
          결제 시스템 준비 중입니다. 문의: 관리자에게 연락해주세요.
        </p>
      </div>
    </div>
  );
}

function PlanCompare({ label, tier, requiredPlan }: { label: string; tier: PlanTier; requiredPlan: PlanTier }) {
  const order: PlanTier[] = ["STARTER", "STANDARD", "PREMIUM"];
  const isIncluded = order.indexOf(tier) >= order.indexOf(requiredPlan);
  const info = PLAN_LABELS[tier];

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
      isIncluded ? info.color : "text-muted-foreground bg-muted/30 border-transparent"
    }`}>
      <span className="font-medium">{label}</span>
      <span className="text-xs">
        {isIncluded ? "포함" : "미포함"}
      </span>
    </div>
  );
}
