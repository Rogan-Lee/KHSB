"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SIZE = {
  32: "size-x8 t3-bold",
  40: "size-x10 t4-bold",
  56: "size-x14 t7-bold",
} as const;

/** 원생 프로필 사진 — 없으면 이름 첫 글자(무채색). 표·카드·상세 머리에서 같이 쓴다 */
export function StudentAvatar({
  name,
  imageUrl,
  size = 32,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <Avatar className={cn(SIZE[size], className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt={name} className="object-cover" />}
      <AvatarFallback className="bg-bg-neutral-weak text-fg-neutral-muted">
        {name.trim().slice(0, 1) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
