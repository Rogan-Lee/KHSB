import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { Badge, Card, SectionTitle } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';

const students = [
  { grade: '고3', name: '김학생', status: '입실', time: '08:12' },
  { grade: '고2', name: '박서준', status: '외출', time: '12:40' },
  { grade: '고1', name: '이수빈', status: '미입실', time: '-' },
  { grade: '재수', name: '최민호', status: '입실', time: '09:03' },
];

export default function AttendanceScreen() {
  const [filter, setFilter] = useState('전체');
  const [query, setQuery] = useState('');

  const visible = students.filter(
    (student) =>
      (filter === '전체' || student.status === filter) && student.name.includes(query.trim()),
  );

  return (
    <AppScreen subtitle="오늘 학생 상태를 빠르게 변경합니다." title="입퇴실 관리">
      <View style={styles.search}>
        <Search color={colors.muted} size={18} />
        <TextInput
          onChangeText={setQuery}
          placeholder="학생 이름 검색"
          placeholderTextColor="#9AA49F"
          style={styles.searchInput}
          value={query}
        />
      </View>

      <View style={styles.filters}>
        {['전체', '입실', '외출', '미입실'].map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.filter, filter === item && styles.filterActive]}>
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle action={<Text style={styles.count}>{visible.length}명</Text>}>학생 현황</SectionTitle>
      <Card>
        {visible.map((student, index) => (
          <View key={student.name}>
            <View style={styles.student}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{student.name.slice(0, 1)}</Text>
              </View>
              <View style={styles.studentText}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentMeta}>
                  {student.grade} · {student.time}
                </Text>
              </View>
              <Badge
                tone={
                  student.status === '입실'
                    ? 'primary'
                    : student.status === '외출'
                      ? 'amber'
                      : 'red'
                }>
                {student.status}
              </Badge>
            </View>
            {index < visible.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  search: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filter: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  filterActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.surface,
  },
  count: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  student: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarText: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: '800',
  },
  studentText: {
    flex: 1,
    gap: 3,
  },
  studentName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  studentMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
});
