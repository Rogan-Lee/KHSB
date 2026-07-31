import { MobileApiError } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/suggestions";
import type { SuggestionCategory } from "@/generated/prisma/enums";

const MAX_TITLE_LEN = 120;
const MAX_CONTENT_LEN = 2000;
const CATEGORIES: SuggestionCategory[] = [
  "FACILITY",
  "CLASS",
  "OPERATION",
  "ETC",
];

function isUnseen(
  statusUpdatedAt: Date | null,
  studentReadAt: Date | null,
): boolean {
  if (!statusUpdatedAt) return false;
  if (!studentReadAt) return true;
  return statusUpdatedAt.getTime() > studentReadAt.getTime();
}

/** 본인 건의 목록(최신순) + 조회 시 읽음 처리. */
export async function getMobileStudentSuggestions(studentId: string) {
  const rows = await prisma.studentSuggestion.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const items = rows.map((r) => ({
    id: r.id,
    category: r.category,
    categoryLabel: CATEGORY_LABELS[r.category],
    title: r.title,
    content: r.content,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status],
    staffReply: r.staffReply,
    handledByName: r.handledByName,
    handledAt: r.handledAt ? r.handledAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    hasUnseenUpdate: isUnseen(r.statusUpdatedAt, r.studentReadAt),
  }));

  const unseen = items.filter((i) => i.hasUnseenUpdate).length;

  // 본인이 목록을 열면 미확인 배지 클리어
  await prisma.studentSuggestion.updateMany({
    where: { studentId },
    data: { studentReadAt: new Date() },
  });

  return { items, summary: { total: items.length, unseen } };
}

/** 새 건의 제출. */
export async function createMobileStudentSuggestion(
  student: { id: string; name: string; grade: string },
  input: unknown,
) {
  const body = (input ?? {}) as Record<string, unknown>;
  const category: SuggestionCategory = CATEGORIES.includes(
    body.category as SuggestionCategory,
  )
    ? (body.category as SuggestionCategory)
    : "ETC";

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new MobileApiError("제목을 입력해 주세요", 400);
  if (title.length > MAX_TITLE_LEN) {
    throw new MobileApiError(`제목은 ${MAX_TITLE_LEN}자 이하로 작성해 주세요`, 400);
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) throw new MobileApiError("건의 내용을 입력해 주세요", 400);
  if (content.length > MAX_CONTENT_LEN) {
    throw new MobileApiError(
      `내용은 ${MAX_CONTENT_LEN}자 이하로 작성해 주세요`,
      400,
    );
  }

  const created = await prisma.studentSuggestion.create({
    data: {
      studentId: student.id,
      category,
      title,
      content,
      status: "RECEIVED",
      studentReadAt: new Date(),
    },
    select: { id: true },
  });

  void notifySlack(
    `📮 [학생 건의·앱] ${student.name}(${student.grade}) · ${CATEGORY_LABELS[category]} — "${title}"`,
  );

  return { ok: true, id: created.id };
}
