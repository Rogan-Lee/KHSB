import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { notifySlack } from "@/lib/slack";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const body = await request.json();

  if (!body.message && !body.blocks) {
    return NextResponse.json(
      { error: "message 또는 blocks 필드가 필요합니다" },
      { status: 400 },
    );
  }

  if (body.blocks) {
    await notifySlack({ blocks: body.blocks, text: body.text ?? "" });
  } else {
    await notifySlack(body.message);
  }

  return NextResponse.json({ ok: true });
}
