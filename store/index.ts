import { User, Message, Course, Student, Level } from '@/types';
import { create } from 'zustand';

const decodePermissionsFromToken = (token: string | null): string[] => {
  if (!token) return [];
  try {
    const base64 = token.split('.')[1];
    const nodeBuffer = typeof globalThis !== 'undefined' ? (globalThis as any).Buffer : undefined;
    const json =
      typeof window !== 'undefined'
        ? atob(base64)
        : nodeBuffer
          ? nodeBuffer.from(base64, 'base64').toString('utf-8')
          : '';
    if (!json) return [];
    const payload = JSON.parse(json);
    const perms = payload?.permissions;
    if (Array.isArray(perms)) {
      return perms.map((p: string) => (p || '').toLowerCase());
    }
  } catch {
    // ignore decode errors
  }
  return [];
};

interface AuthState {
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  setUser: (user: User | null, permissions?: string[]) => void;
  hasPermission: (permission: string) => boolean;
  logout: () => void;
}

interface SchoolState {
  levels: Level[];
  courses: Course[];
  students: Student[];
  selectedLevel: Level | null;
  selectedCourse: Course | null;
  setLevels: (levels: Level[]) => void;
  setCourses: (courses: Course[]) => void;
  setStudents: (students: Student[]) => void;
  selectLevel: (level: Level) => void;
  selectCourse: (course: Course) => void;
}

interface MessageState {
  messages: Message[];
  draftMessages: Message[];
  addMessage: (message: Message) => void;
  addDraftMessage: (message: Message) => void;
  removeDraftMessage: (id: string) => void;
  setMessages: (messages: Message[]) => void;
}

interface YearState {
  year: string;
  setYear: (year: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  isAuthenticated: false,
  setUser: (user: User | null, permissions?: string[]) => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const permsFromUser =
      Array.isArray((user as any)?.permissions) ? (user as any).permissions : undefined;
    const perms = user
      ? permissions ?? permsFromUser ?? decodePermissionsFromToken(token)
      : [];
    set({
      user,
      permissions: perms,
      isAuthenticated: !!user,
    });
  },
  hasPermission: (permission: string) => {
    if (!permission) return true;
    const { permissions, user } = get();
    if ((user?.schoolId || '').toLowerCase() === 'global') return true;
    const perms = permissions || [];
    if (!perms.length) return false;
    const p = permission.toLowerCase();
    return perms.includes('*') || perms.includes(p) || perms.includes(`${p}.self`);
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
    }
    set({
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  },
}));

export const useSchoolStore = create<SchoolState>((set) => ({
  levels: [],
  courses: [],
  students: [],
  selectedLevel: null,
  selectedCourse: null,
  setLevels: (levels: Level[]) => set({ levels }),
  setCourses: (courses: Course[]) => set({ courses }),
  setStudents: (students: Student[]) => set({ students }),
  selectLevel: (level: Level) =>
    set({
      selectedLevel: level,
      selectedCourse: null,
    }),
  selectCourse: (course: Course) =>
    set({
      selectedCourse: course,
    }),
}));

export const useMessageStore = create<MessageState>((set) => ({
  messages: [],
  draftMessages: [],
  addMessage: (message: Message) =>
    set((state: MessageState) => ({
      messages: [message, ...state.messages],
    })),
  addDraftMessage: (message: Message) =>
    set((state: MessageState) => ({
      draftMessages: [message, ...state.draftMessages],
    })),
  removeDraftMessage: (id: string) =>
    set((state: MessageState) => ({
      draftMessages: state.draftMessages.filter((msg: Message) => msg.id !== id),
    })),
  setMessages: (messages: Message[]) => set({ messages }),
}));

export const useYearStore = create<YearState>((set) => ({
  // For dashboards/reports we only surface the current calendar year to avoid stale selections.
  year: new Date().getFullYear().toString(),
  setYear: () => {
    // Ignore external changes; always stick to the current year.
    set({ year: new Date().getFullYear().toString() });
  },
}));
