"use client";

import { useClerk } from "@clerk/nextjs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Menu, User, Bell } from "lucide-react";
import type { Role } from "@/generated/prisma";

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "어드민",
  DIRECTOR: "원장",
  MENTOR: "멘토",
  STAFF: "운영조교",
  STUDENT: "원생",
};

interface AppHeaderProps {
  user: {
    name: string;
    email: string;
    role: Role;
  };
  title?: string;
  onMenuClick?: () => void;
}

export function AppHeader({ user, title, onMenuClick }: AppHeaderProps) {
  const { signOut } = useClerk();

  return (
    <header className="h-12 border-b border-line bg-panel flex items-center justify-between px-4 md:px-5 sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <button
          className="md:hidden p-1.5 rounded-[8px] hover:bg-canvas-2 text-ink-3 transition-colors"
          onClick={onMenuClick}
          aria-label="메뉴 열기"
        >
          <Menu className="h-5 w-5" />
        </button>
        {title && (
          <span className="text-[12.5px] font-medium text-ink-3 tracking-[-0.01em] md:hidden">
            {title}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="grid place-items-center w-[32px] h-[32px] rounded-[8px] text-ink-3 hover:text-ink hover:bg-canvas-2 transition-colors"
          aria-label="알림"
        >
          <Bell className="h-4 w-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-[8px] px-2 py-1 hover:bg-canvas-2 transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[11px] bg-brand-soft text-brand-2 font-semibold">
                  {user.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="text-left hidden sm:block">
                <p className="text-[12.5px] font-medium text-ink leading-none tracking-[-0.01em]">{user.name}</p>
                <p className="text-[11px] text-ink-4 mt-0.5">{ROLE_LABELS[user.role]}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-[12.5px]">내 계정</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-[12.5px]">
              <User className="mr-2 h-3.5 w-3.5" />
              프로필 설정
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[12.5px] text-destructive focus:text-destructive"
              onClick={() => signOut({ redirectUrl: "/sign-in" })}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
