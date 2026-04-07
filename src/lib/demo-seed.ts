import { prisma } from "./prisma";

/**
 * 트라이얼 가입 시 호출: org별 데모 데이터를 생성하여
 * 빈 대시보드가 아닌 실제 운영 느낌을 체험하게 한다.
 */
export async function seedDemoData(orgId: string, directorUserId: string) {
  // 1. 데모 멘토 생성
  const mentor = await prisma.user.create({
    data: {
      email: `demo-mentor-${orgId.slice(0, 8)}@studyroom.demo`,
      name: "김멘토",
      role: "MENTOR",
      isMentor: true,
    },
  });

  await prisma.membership.create({
    data: { userId: mentor.id, orgId, role: "MENTOR" },
  });

  // 2. 샘플 학생 5명
  const studentData = [
    { name: "김지훈", grade: "고3", seat: "A-01", parentPhone: "010-0000-0001" },
    { name: "이수연", grade: "고2", seat: "A-02", parentPhone: "010-0000-0002" },
    { name: "박민준", grade: "N수", seat: "B-01", parentPhone: "010-0000-0003" },
    { name: "최서아", grade: "고1", seat: "B-02", parentPhone: "010-0000-0004" },
    { name: "정우성", grade: "고3", seat: "C-01", parentPhone: "010-0000-0005" },
  ];

  const students = [];
  for (const data of studentData) {
    const student = await prisma.student.create({
      data: {
        ...data,
        orgId,
        startDate: new Date("2025-03-01"),
        mentorId: mentor.id,
        status: "ACTIVE",
      },
    });
    students.push(student);
  }

  // 3. 출결 스케줄 (평일 09:00-22:00)
  for (const student of students) {
    for (let day = 1; day <= 5; day++) {
      await prisma.attendanceSchedule.create({
        data: {
          studentId: student.id,
          orgId,
          dayOfWeek: day,
          startTime: "09:00",
          endTime: "22:00",
        },
      });
    }
  }

  // 4. 최근 3일 출결 기록
  const today = new Date();
  for (let daysAgo = 0; daysAgo < 3; daysAgo++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(0, 0, 0, 0);

    for (const student of students) {
      const checkIn = new Date(date);
      checkIn.setHours(8, 50 + Math.floor(Math.random() * 20), 0, 0);

      await prisma.attendanceRecord.create({
        data: {
          studentId: student.id,
          orgId,
          date,
          checkIn,
          checkOut: daysAgo > 0 ? new Date(new Date(date).setHours(22, 0, 0, 0)) : null,
          type: "NORMAL",
        },
      });
    }
  }

  // 5. 멘토링 세션 2건
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  await prisma.mentoring.create({
    data: {
      studentId: students[0].id,
      mentorId: mentor.id,
      orgId,
      scheduledAt: yesterday,
      scheduledTimeStart: "14:00",
      scheduledTimeEnd: "15:00",
      status: "COMPLETED",
      content: "수학 모의고사 오답 분석. 미적분 파트 집중 보완 필요.",
      improvements: "함수 개념 이해도 향상",
      weaknesses: "적분 응용 문제 풀이 속도",
      nextGoals: "적분 응용 문제 20제 풀이",
    },
  });

  await prisma.mentoring.create({
    data: {
      studentId: students[1].id,
      mentorId: mentor.id,
      orgId,
      scheduledAt: today,
      scheduledTimeStart: "16:00",
      scheduledTimeEnd: "17:00",
      status: "SCHEDULED",
    },
  });

  // 6. 상벌점 3건
  await prisma.meritDemerit.createMany({
    data: [
      { studentId: students[0].id, orgId, date: yesterday, type: "MERIT", points: 3, reason: "자습 태도 우수", createdById: directorUserId },
      { studentId: students[2].id, orgId, date: yesterday, type: "DEMERIT", points: 1, reason: "지각 (10분)", createdById: directorUserId },
      { studentId: students[4].id, orgId, date: today, type: "MERIT", points: 2, reason: "동료 학습 도움", createdById: directorUserId },
    ],
  });

  // 7. 투두 3건
  await prisma.todo.createMany({
    data: [
      { orgId, title: "신규 원생 입실 상담 준비", priority: "HIGH", authorId: directorUserId, authorName: "원장님" },
      { orgId, title: "이번 주 멘토링 스케줄 확인", priority: "NORMAL", authorId: directorUserId, authorName: "원장님" },
      { orgId, title: "학부모 면담 일정 조율", priority: "NORMAL", authorId: directorUserId, authorName: "원장님" },
    ],
  });
}
