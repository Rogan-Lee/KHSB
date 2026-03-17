import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uuids, message }: { uuids: string[]; message: string } = await request.json();

  if (!uuids?.length || !message?.trim()) {
    return NextResponse.json({ error: "수신자와 메시지를 입력해주세요" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kakaoAccessToken: true },
  });

  if (!user?.kakaoAccessToken) {
    return NextResponse.json({ error: "카카오 미연결", connected: false }, { status: 400 });
  }

  const templateObject = {
    object_type: "text",
    text: message.slice(0, 200),
    link: {
      web_url: process.env.NEXTAUTH_URL ?? "https://khsb.vercel.app",
      mobile_web_url: process.env.NEXTAUTH_URL ?? "https://khsb.vercel.app",
    },
  };

  const res = await fetch("https://kapi.kakao.com/v1/api/talk/friends/message/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.kakaoAccessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      receiver_uuids: JSON.stringify(uuids),
      template_object: JSON.stringify(templateObject),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("[kakao send]", data);
    return NextResponse.json({ error: data.msg ?? "발송 실패" }, { status: 500 });
  }

  const successCount = data.successful_receiver_uuids?.length ?? 0;
  return NextResponse.json({ success: true, sent: successCount });
}
