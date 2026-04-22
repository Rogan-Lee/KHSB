import { ExamType } from "@/generated/prisma";

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  OFFICIAL_MOCK: "공식 모의고사",
  PRIVATE_MOCK: "사설 모의고사",
  SCHOOL_EXAM: "학교 내신",
};
