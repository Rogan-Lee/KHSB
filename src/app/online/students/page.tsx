import { redirect } from "next/navigation";

// 온라인 학생 목록은 원생 관리의 온라인 탭으로 옮겼다. 상세(/online/students/[id]/*)는 그대로.
export default function OnlineStudentsPage() {
  redirect("/students?type=online");
}
