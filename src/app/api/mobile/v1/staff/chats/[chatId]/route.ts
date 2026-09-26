import { type NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";
import { getChatThread, sendChat } from "@/lib/mobile-chat";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> },
) {
  try {
    const [appUser, { chatId }] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
    ]);
    const before = request.nextUrl.searchParams.get("before") ?? undefined;
    return mobileJson(await getChatThread(chatId, { type: "STAFF", id: appUser.id }, { before }));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> },
) {
  try {
    const [appUser, { chatId }, body] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
      request.json(),
    ]);
    await sendChat({
      chatId,
      viewer: { type: "STAFF", id: appUser.id },
      content: body?.content ?? "",
      attachments: body?.attachments ?? [],
    });
    return mobileJson(await getChatThread(chatId, { type: "STAFF", id: appUser.id }));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
