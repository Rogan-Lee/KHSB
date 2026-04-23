import { redirect } from "next/navigation";

// /reports 진입 시 월간 리포트 워크플로우 페이지로 바로 이동.
// 기존 /reports 에 있던 ReportGeneratorPanel 기능은 /reports/monthly 로 통합됨.
export default function ReportsIndex() {
  redirect("/reports/monthly");
}
