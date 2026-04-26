import { useEffect, useMemo, useState } from 'react';
import { authFetch } from './apiUrl';

export const teacherPagePermissionsByPath: Record<string, string> = {
  '/teacher': 'pages.teacher.dashboard',
  '/teacher/classes': 'pages.teacher.classes',
  '/teacher/courses': 'pages.teacher.courses',
  '/teacher/courses/new': 'pages.teacher.courses_form',
  '/teacher/students': 'pages.teacher.students',
  '/teacher/quizzes': 'pages.teacher.quizzes',
  '/teacher/quizzes/new': 'pages.teacher.quiz_builder',
  '/teacher/exams': 'pages.teacher.exams',
  '/teacher/results': 'pages.teacher.results',
  '/teacher/modules': 'pages.teacher.modules',
  '/teacher/lessons': 'pages.teacher.lessons',
  '/teacher/assignments': 'pages.teacher.assignments',
  '/teacher/attendance': 'pages.teacher.attendance',
  '/teacher/certificates': 'pages.teacher.certificates',
  '/teacher/live-sessions': 'pages.teacher.live_sessions',
  '/teacher/community': 'pages.teacher.community',
  '/teacher/announcements': 'pages.teacher.announcements',
  '/teacher/progress': 'pages.teacher.progress',
  '/teacher/profile': 'pages.teacher.profile',
};

const teacherDynamicRoutePermissions: Array<{ test: (path: string) => boolean; permission: string }> = [
  { test: (path) => /^\/teacher\/courses\/[^/]+\/edit$/.test(path), permission: 'pages.teacher.courses_form' },
  { test: (path) => /^\/teacher\/quizzes\/edit\/[^/]+$/.test(path), permission: 'pages.teacher.quiz_builder' },
  { test: (path) => /^\/teacher\/live-sessions\/[^/]+\/room$/.test(path), permission: 'pages.teacher.live_session_room' },
];

export const getTeacherPagePermission = (path: string): string | null => {
  if (teacherPagePermissionsByPath[path]) return teacherPagePermissionsByPath[path];
  const dynamic = teacherDynamicRoutePermissions.find((r) => r.test(path));
  return dynamic?.permission || null;
};

export function useTeacherPermissions() {
  const [permissionMap, setPermissionMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/teacher/permissions');
        const json = await res.json().catch(() => null);
        const perms = json?.permissions;
        if (active) setPermissionMap(perms && typeof perms === 'object' ? perms : {});
      } catch {
        if (active) setPermissionMap({});
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const onRolesUpdated = () => void load();
    window.addEventListener('roles-updated', onRolesUpdated);
    return () => {
      active = false;
      window.removeEventListener('roles-updated', onRolesUpdated);
    };
  }, []);

  const can = useMemo(
    () => (permissionId: string, fallback = true) => {
      if (!permissionId) return fallback;
      if (!(permissionId in permissionMap)) return fallback;
      return !!permissionMap[permissionId];
    },
    [permissionMap],
  );

  return { loading, permissionMap, can };
}
