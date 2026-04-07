"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimePickerInput } from "@/components/ui/time-picker";
import {
  createMentor,
  updateMentor,
  deleteMentor,
  saveMentorScheduleForMentor,
  deleteMentorScheduleById,
} from "@/actions/mentors";
import type { MentorSchedule, User } from "@/generated/prisma";

type MentorUser = Pick<User, "id" | "name" | "email" | "role">;

const DAYS = [
  { value: 0, label: "일", weekend: true },
  { value: 1, label: "월", weekend: false },
  { value: 2, label: "화", weekend: false },
  { value: 3, label: "수", weekend: false },
  { value: 4, label: "목", weekend: false },
  { value: 5, label: "금", weekend: false },
  { value: 6, label: "토", weekend: true },
];

interface Props {
  mentors: MentorUser[];
  schedules: MentorSchedule[];
}

export function MentorManager({ mentors: initialMentors, schedules: initialSchedules }: Props) {
  const [mentors, setMentors] = useState(initialMentors);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Schedule edit state
  const [editDay, setEditDay] = useState<{ mentorId: string; day: number } | null>(null);
  const [editStart, setEditStart] = useState("14:00");
  const [editEnd, setEditEnd] = useState("18:00");

  function handleAddMentor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createMentor(formData);
        toast.success("멘토가 등록되었습니다");
        setShowAddForm(false);
        // Refresh by reloading page data - we'll use router.refresh pattern
        window.location.reload();
      } catch {
        toast.error("등록 실패");
      }
    });
  }

  function handleUpdateMentor(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateMentor(id, formData);
        toast.success("수정되었습니다");
        setEditingId(null);
        window.location.reload();
      } catch {
        toast.error("수정 실패");
      }
    });
  }

  function handleDeleteMentor(id: string, name: string) {
    if (!confirm(`${name} 멘토를 삭제하시겠습니까?\n관련 데이터가 모두 삭제될 수 있습니다.`)) return;
    startTransition(async () => {
      try {
        await deleteMentor(id);
        setMentors((prev) => prev.filter((m) => m.id !== id));
        setSchedules((prev) => prev.filter((s) => s.mentorId !== id));
        toast.success("삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  function startEditSchedule(mentorId: string, day: number) {
    const existing = schedules.find((s) => s.mentorId === mentorId && s.dayOfWeek === day);
    setEditStart(existing?.timeStart ?? "14:00");
    setEditEnd(existing?.timeEnd ?? "18:00");
    setEditDay({ mentorId, day });
  }

  function handleSaveSchedule() {
    if (!editDay) return;
    startTransition(async () => {
      try {
        await saveMentorScheduleForMentor(editDay.mentorId, editDay.day, editStart, editEnd);
        setSchedules((prev) => {
          const filtered = prev.filter((s) => !(s.mentorId === editDay.mentorId && s.dayOfWeek === editDay.day));
          return [...filtered, { id: crypto.randomUUID(), orgId: "", mentorId: editDay.mentorId, dayOfWeek: editDay.day, timeStart: editStart, timeEnd: editEnd, createdAt: new Date(), updatedAt: new Date() }];
        });
        toast.success("저장되었습니다");
        setEditDay(null);
      } catch {
        toast.error("저장 실패");
      }
    });
  }

  function handleDeleteSchedule(id: string) {
    startTransition(async () => {
      try {
        await deleteMentorScheduleById(id);
        setSchedules((prev) => prev.filter((s) => s.id !== id));
        toast.success("삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 멘토 목록 */}
      <div className="space-y-2">
        {mentors.map((mentor) => {
          const mySchedules = schedules.filter((s) => s.mentorId === mentor.id);
          const scheduleMap = new Map(mySchedules.map((s) => [s.dayOfWeek, s]));
          const isExpanded = expandedId === mentor.id;
          const isEditing = editingId === mentor.id;

          return (
            <Card key={mentor.id}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{mentor.name}</span>
                        <Badge
                          variant={mentor.role === "ADMIN" || mentor.role === "DIRECTOR" ? "default" : mentor.role === "STAFF" ? "outline" : "secondary"}
                          className="text-xs"
                        >
                          {mentor.role === "ADMIN" ? "어드민" : mentor.role === "DIRECTOR" ? "원장" : mentor.role === "STAFF" ? "운영조교" : "멘토"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{mentor.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingId(isEditing ? null : mentor.id); setExpandedId(null); }}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMentor(mentor.id, mentor.name)}
                      disabled={isPending || mentor.role === "DIRECTOR" || mentor.role === "ADMIN"}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setExpandedId(isExpanded ? null : mentor.id); setEditingId(null); }}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardHeader>

              {/* 멘토 정보 수정 폼 */}
              {isEditing && (
                <CardContent className="pt-0 pb-4 border-t">
                  <form onSubmit={(e) => handleUpdateMentor(mentor.id, e)} className="space-y-3 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">이름 *</Label>
                        <Input name="name" defaultValue={mentor.name} required className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">이메일 *</Label>
                        <Input name="email" type="email" defaultValue={mentor.email} required className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">역할 (권한)</Label>
                        <select name="role" defaultValue={mentor.role} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                          <option value="MENTOR">멘토</option>
                          <option value="STAFF">운영조교</option>
                          <option value="DIRECTOR">원장</option>
                          <option value="ADMIN">어드민</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={isPending}>저장</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>취소</Button>
                    </div>
                  </form>
                </CardContent>
              )}

              {/* 근무 시간 스케줄 */}
              {isExpanded && (
                <CardContent className="pt-0 pb-4 border-t">
                  <p className="text-xs text-muted-foreground pt-3 pb-2">주간 근무 시간</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {DAYS.map((d) => {
                          const sch = scheduleMap.get(d.value);
                          const isEditingThis = editDay?.mentorId === mentor.id && editDay?.day === d.value;

                          return (
                            <tr key={d.value} className={cn("border-b last:border-0", d.weekend ? "bg-muted/20" : "")}>
                              <td className={cn("px-3 py-2 font-medium text-sm w-16 whitespace-nowrap", d.weekend ? "text-red-500" : "")}>
                                {d.label}
                              </td>
                              <td className="px-3 py-2 flex-1">
                                {isEditingThis ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <TimePickerInput value={editStart} onChange={setEditStart} size="sm" />
                                    <span className="text-muted-foreground text-xs">~</span>
                                    <TimePickerInput value={editEnd} onChange={setEditEnd} size="sm" />
                                    <Button size="sm" className="h-7 text-xs px-2" onClick={handleSaveSchedule} disabled={isPending}>저장</Button>
                                    <button onClick={() => setEditDay(null)} className="text-xs text-muted-foreground hover:text-foreground">취소</button>
                                  </div>
                                ) : sch ? (
                                  <span className="font-mono text-sm">{sch.timeStart} ~ {sch.timeEnd}</span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">미등록</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {!isEditingThis && (
                                  <div className="flex items-center gap-2 justify-end">
                                    <button
                                      onClick={() => startEditSchedule(mentor.id, d.value)}
                                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                                    >
                                      {sch ? "수정" : "등록"}
                                    </button>
                                    {sch && (
                                      <button onClick={() => handleDeleteSchedule(sch.id)} disabled={isPending} className="text-muted-foreground hover:text-destructive">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* 직원 추가 */}
      {showAddForm ? (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">직원 추가</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <form onSubmit={handleAddMentor} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">이름 *</Label>
                  <Input name="name" required className="h-8 text-sm" placeholder="홍길동" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">역할 *</Label>
                  <select name="role" required className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="MENTOR">멘토</option>
                    <option value="STAFF">운영조교</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">이메일 *</Label>
                <Input name="email" type="email" required className="h-8 text-sm" placeholder="staff@example.com" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isPending}>등록</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowAddForm(false)}>취소</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          직원 추가
        </Button>
      )}
    </div>
  );
}
