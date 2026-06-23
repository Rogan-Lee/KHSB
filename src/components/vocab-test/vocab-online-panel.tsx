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
      <TabsList>
        <TabsTrigger value="exams">시험 출제</TabsTrigger>
        <TabsTrigger value="results">응시 결과</TabsTrigger>
        <TabsTrigger value="books">단어장</TabsTrigger>
      </TabsList>
      <TabsContent value="exams" className="mt-4">
        <VocabExamCreator books={books} students={students} />
      </TabsContent>
      <TabsContent value="results" className="mt-4">
        <VocabResultsBoard exams={exams} students={students} canDelete={canDeleteExam} />
      </TabsContent>
      <TabsContent value="books" className="mt-4">
        <VocabBookManager books={books} />
      </TabsContent>
    </Tabs>
  );
}
