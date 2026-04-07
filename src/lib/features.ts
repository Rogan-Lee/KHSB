/**
 * 플랜별 기능 게이팅 시스템
 *
 * Organization.plan 기반으로 동작. layout.tsx에서 plan prop으로 전달.
 */

import type { PlanTier } from "@/generated/prisma";
export type { PlanTier } from "@/generated/prisma";

export type FeatureKey =
  // Starter
  | "students" | "attendance" | "seat-map" | "timetable" | "todos" | "handover"
  // Standard
  | "mentoring" | "mentoring-plan" | "merit-demerit" | "consultations"
  | "assignments" | "exam-scores" | "reports" | "vocab-test"
  | "academic-plans" | "meeting-minutes" | "requests" | "calendar"
  // Premium
  | "ai-enhance" | "ai-followup" | "card-news" | "google-calendar"
  | "google-sheets" | "kakao-messages" | "analytics" | "parent-reports"
  | "mentors";

const STARTER_FEATURES: FeatureKey[] = [
  "students", "attendance", "seat-map", "timetable", "todos", "handover",
];

const STANDARD_FEATURES: FeatureKey[] = [
  ...STARTER_FEATURES,
  "mentoring", "mentoring-plan", "merit-demerit", "consultations",
  "assignments", "exam-scores", "reports", "vocab-test",
  "academic-plans", "meeting-minutes", "requests", "calendar",
];

const PREMIUM_FEATURES: FeatureKey[] = [
  ...STANDARD_FEATURES,
  "ai-enhance", "ai-followup", "card-news", "google-calendar",
  "google-sheets", "kakao-messages", "analytics", "parent-reports",
  "mentors",
];

const PLAN_FEATURES: Record<PlanTier, FeatureKey[]> = {
  STARTER: STARTER_FEATURES,
  STANDARD: STANDARD_FEATURES,
  PREMIUM: PREMIUM_FEATURES,
};

/** 해당 플랜에서 특정 기능 사용 가능 여부 */
export function hasFeature(plan: PlanTier, feature: FeatureKey): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

/** 해당 플랜에서 사용 가능한 전체 기능 목록 */
export function getAvailableFeatures(plan: PlanTier): FeatureKey[] {
  return PLAN_FEATURES[plan];
}

/** 해당 기능이 포함되는 최소 플랜 반환 */
export function getMinimumPlan(feature: FeatureKey): PlanTier {
  if (STARTER_FEATURES.includes(feature)) return "STARTER";
  if (STANDARD_FEATURES.includes(feature)) return "STANDARD";
  return "PREMIUM";
}

/** 플랜 표시 라벨 */
export const PLAN_LABELS: Record<PlanTier, { label: string; color: string }> = {
  STARTER: { label: "Starter", color: "text-gray-600 bg-gray-50 border-gray-200" },
  STANDARD: { label: "Standard", color: "text-blue-600 bg-blue-50 border-blue-200" },
  PREMIUM: { label: "Premium", color: "text-violet-600 bg-violet-50 border-violet-200" },
};

/** @deprecated layout.tsx에서 user.orgPlan을 직접 DashboardShell에 전달 */
export function getCurrentPlan(): PlanTier {
  return "PREMIUM";
}

/** 라우트 경로 → 기능 키 매핑 */
export const ROUTE_FEATURE_MAP: Record<string, FeatureKey> = {
  "/students": "students",
  "/attendance": "attendance",
  "/seat-map": "seat-map",
  "/timetable": "timetable",
  "/todos": "todos",
  "/handover": "handover",
  "/mentoring": "mentoring",
  "/mentoring-plan": "mentoring-plan",
  "/merit-demerit": "merit-demerit",
  "/consultations": "consultations",
  "/assignments": "assignments",
  "/reports": "reports",
  "/vocab-test": "vocab-test",
  "/academic-plans": "academic-plans",
  "/meeting-minutes": "meeting-minutes",
  "/requests": "requests",
  "/calendar": "calendar",
  "/analytics": "analytics",
  "/card-news": "card-news",
  "/messages": "kakao-messages",
  "/mentors": "mentors",
};
