import { LinkTabs } from "@/components/backoffice/ui";

const TABS = [
  { value: "DIRECTOR", label: "원장 면담", href: "/consultations" },
  { value: "HEAD_TEACHER", label: "책임T 면담", href: "/consultations?owner=HEAD_TEACHER" },
];

/** 면담 담당자 전환 — URL(?owner=) 기반 SEED 라인 탭 */
export function ConsultationOwnerTabs({ current }: { current: string }) {
  return <LinkTabs items={TABS} current={current} />;
}
