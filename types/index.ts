export type UserRole = 'admin' | 'director' | 'coordinator' | 'teacher' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  schoolId: string;
  profileImage?: string;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: Date;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  recipients: Recipient[];
  metadata?: {
    imageUrl?: string;
    documentUrl?: string;
  };
}

export interface Recipient {
  id: string;
  type: 'student' | 'course' | 'level' | 'shift' | 'school';
  name: string;
  count?: number;
}

export interface Course {
  id: string;
  name: string;
  level: string;
  shift: 'morning' | 'afternoon' | 'evening';
  studentCount: number;
}

export interface Student {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  courseId: string;
  parentPhone?: string;
}

export interface Level {
  id: string;
  name: string;
  courses: Course[];
}

export interface SchoolConfig {
  id: string;
  name: string;
  whatsappApiKey: string;
  whatsappPhoneNumber: string;
  levels: Level[];
  adminUsers: User[];
}
