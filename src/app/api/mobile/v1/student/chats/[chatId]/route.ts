import { type NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";
import { getChatThread, sendChat } from "@/lib/mobile-chat";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> },
) {
  try {
    const [student, { chatId }] = await Promise.all([
      requireMobileStudent(request),
      context.params,
    ]);
    const before = request.nextUrl.searchParams.get("before") ?? undefined;
    return mobileJson(await getChatThread(chatId, { type: "STUDENT", id: student.id }, { before }));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> },
) {
  try {
    const [student, { chatId }, body] = await Promise.all([
      requireMobileStudent(request),
      context.params,
      request.json(),
    ]);
    await sendChat({
      chatId,
      viewer: { type: "STUDENT", id: student.id },
      content: body?.content ?? "",
      attachments: body?.attachments ?? [],
    });
    return mobileJson(await getChatThread(chatId, { type: "STUDENT", id: student.id }));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
