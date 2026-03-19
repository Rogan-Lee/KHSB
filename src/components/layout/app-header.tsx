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
import { LogOut, User } from "lucide-react";
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
  title: string;
}

export function AppHeader({ user, title }: AppHeaderProps) {
  const { signOut } = useClerk();

  return (
    <header className="h-14 border-b border-[#e1e2e4] bg-white flex items-center justify-between px-6 sticky top-0 z-10">
      <h1 className="text-[15px] font-semibold text-[#1e2124] tracking-tight">{title}</h1>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-[#f4f4f5] transition-colors">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[11px] bg-[#eaf2fe] text-[#005eeb] font-semibold">
                {user.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="text-left hidden sm:block">
              <p className="text-[13px] font-medium text-[#1e2124] leading-none">{user.name}</p>
              <p className="text-[11px] text-[#6d7882] mt-0.5">{ROLE_LABELS[user.role]}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-[13px]">내 계정</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="text-[13px]">
            <User className="mr-2 h-3.5 w-3.5" />
            프로필 설정
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-[13px] text-destructive focus:text-destructive"
            onClick={() => signOut({ redirectUrl: "/sign-in" })}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            로그아웃
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
