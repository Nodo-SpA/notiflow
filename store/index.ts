import { User, Message, Course, Student, Level } from '@/types';
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user: User | null) =>
    set({
      user,
      isAuthenticated: !!user,
    }),
  logout: () =>
    set({
      user: null,
      isAuthenticated: false,
    }),
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
