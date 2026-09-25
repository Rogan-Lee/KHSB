"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VocabBookManager, type VocabBookSummary } from "./vocab-book-manager";
import { VocabExamCreator, type RosterStudent } from "./vocab-exam-creator";
import { VocabResultsBoard, type ExamSummary } from "./vocab-results-board";

export function VocabOnlinePanel({
  books,
  exams,
  students,
  canDeleteExam = false,
}: {
  books: VocabBookSummary[];
  exams: ExamSummary[];
  students: RosterStudent[];
  canDeleteExam?: boolean;
}) {
  return (
    <Tabs defaultValue="exams">
      <TabsList variant="segment">
        <TabsTrigger value="exams">시험 출제</TabsTrigger>
        <TabsTrigger value="results">
          응시 결과
          {exams.length > 0 && <span className="tabular-nums text-fg-neutral-subtle">{exams.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="books">
          단어장
          {books.length > 0 && <span className="tabular-nums text-fg-neutral-subtle">{books.length}</span>}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="exams">
        <VocabExamCreator books={books} students={students} />
      </TabsContent>
      <TabsContent value="results">
        <VocabResultsBoard exams={exams} students={students} canDelete={canDeleteExam} />
      </TabsContent>
      <TabsContent value="books">
        <VocabBookManager books={books} />
      </TabsContent>
    </Tabs>
  );
}
