import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowed.includes(file.type) && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "이미지 파일만 업로드할 수 있습니다" }, { status: 400 });
  }

  try {
    const blob = await put(`study-plans/${Date.now()}-${file.name}`, file, {
      access: "public",
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("[upload] blob put error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
