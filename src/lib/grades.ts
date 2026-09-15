import "server-only";
import { db } from "./db";
import type { CourseGrade, GradeGroup, GradeItem } from "./types";

export interface SyncedGradeItem extends GradeItem {
  group_name: string;
  group_position: number;
  group_weight: number | null;
  position: number;
}

export interface SyncedCourseGrades {
  course_key: string;
  current_score: number | null;
  current_grade: string;
  final_score: number | null;
  final_grade: string;
  weighted: boolean;
  items: SyncedGradeItem[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Replaces the stored grades for the synced courses. */
export function saveCourseGrades(courses: SyncedCourseGrades[], syncedAt: string) {
  const d = db();
  const insert = d.prepare(
    `INSERT INTO grade_items (key, course_key, name, group_name, group_position, group_weight, points_possible, score, grade, weight, status, due_at, url, counts, position, synced_at)
     VALUES (@key, @course_key, @name, @group_name, @group_position, @group_weight, @points_possible, @score, @grade, @weight, @status, @due_at, @url, @counts, @position, @synced_at)`,
  );
  d.transaction(() => {
    for (const course of courses) {
      d.prepare("DELETE FROM grade_items WHERE course_key = ?").run(course.course_key);
      for (const item of course.items) insert.run({ ...item, course_key: course.course_key, counts: item.counts ? 1 : 0, synced_at: syncedAt });
      d.prepare(
        `UPDATE course_links SET current_score = ?, current_grade = ?, final_score = ?, final_grade = ?, weighted = ?, grades_synced_at = ? WHERE course_key = ?`,
      ).run(course.current_score, course.current_grade, course.final_score, course.final_grade, course.weighted ? 1 : 0, syncedAt, course.course_key);
    }
  })();
}

export function clearGrades() {
  db().prepare("DELETE FROM grade_items").run();
}

interface ItemRow extends Omit<GradeItem, "counts"> {
  course_key: string;
  group_name: string;
  group_weight: number | null;
  counts: number;
}

interface CourseRow {
  course_key: string;
  label: string;
  class_id: number | null;
  class_name: string | null;
  class_color: string | null;
  current_score: number | null;
  current_grade: string;
  final_score: number | null;
  weighted: number;
  grades_synced_at: string | null;
}

const isGraded = (item: GradeItem) => item.counts && item.status !== "excused" && item.score !== null && (item.points_possible ?? 0) > 0;

/** Every course that has grades, with per-group scores and how much of the final grade is decided. */
export function listCourseGrades(): CourseGrade[] {
  const d = db();
  const courses = d
    .prepare(
      `SELECT l.course_key, l.label, l.class_id, c.name AS class_name, c.color AS class_color,
              l.current_score, l.current_grade, l.final_score, l.weighted, l.grades_synced_at
       FROM course_links l LEFT JOIN classes c ON c.id = l.class_id
       WHERE EXISTS (SELECT 1 FROM grade_items g WHERE g.course_key = l.course_key)
       ORDER BY c.position IS NULL, c.position, l.label`,
    )
    .all() as CourseRow[];
  const items = d
    .prepare("SELECT * FROM grade_items ORDER BY course_key, group_position, group_name, position, due_at IS NULL, due_at, name")
    .all() as ItemRow[];

  return courses.map((course) => {
    const groups = new Map<string, GradeGroup>();
    for (const row of items) {
      if (row.course_key !== course.course_key) continue;
      const { course_key: _c, group_name, group_weight, counts, ...rest } = row;
      void _c;
      const item: GradeItem = { ...rest, counts: counts === 1 };
      let group = groups.get(group_name);
      if (!group) groups.set(group_name, (group = { name: group_name, weight: group_weight, percent: null, earned: 0, possible: 0, items: [] }));
      group.items.push(item);
      if (isGraded(item)) {
        group.earned += item.score!;
        group.possible += item.points_possible!;
      }
    }
    for (const group of groups.values()) group.percent = group.possible > 0 ? round1((100 * group.earned) / group.possible) : null;

    const list = [...groups.values()];
    const weighted = course.weighted === 1;
    let estimate: number | null = null;
    if (weighted) {
      const counted = list.filter((g) => g.percent !== null && (g.weight ?? 0) > 0);
      const totalWeight = counted.reduce((s, g) => s + g.weight!, 0);
      if (totalWeight > 0) estimate = round1(counted.reduce((s, g) => s + g.weight! * g.percent!, 0) / totalWeight);
    } else {
      const earned = list.reduce((s, g) => s + g.earned, 0);
      const possible = list.reduce((s, g) => s + g.possible, 0);
      if (possible > 0) estimate = round1((100 * earned) / possible);
    }

    let gradedWeight = 0;
    let earnedWeight = 0;
    for (const group of list)
      for (const item of group.items)
        if (isGraded(item) && item.weight) {
          gradedWeight += item.weight;
          earnedWeight += (item.weight * item.score!) / item.points_possible!;
        }

    return {
      course_key: course.course_key,
      label: course.label,
      class_id: course.class_id,
      class_name: course.class_name,
      class_color: course.class_color,
      current_score: course.current_score ?? estimate,
      current_grade: course.current_grade,
      final_score: course.final_score,
      weighted,
      graded_weight: round1(Math.min(100, gradedWeight)),
      earned_weight: round1(earnedWeight),
      groups: list,
      synced_at: course.grades_synced_at,
    };
  });
}
