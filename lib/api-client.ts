import axios, { AxiosInstance, AxiosError } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.notiflow.app';

class APIClient {
  client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 20000, // llamadas normales
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Interceptor para agregar token de autenticación
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Interceptor para manejo de errores
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Permisos profesores
  async getTeacherPermissions() {
    return (this.client as any).get('/teacher-permissions');
  }

  async updateTeacherPermission(email: string, data: { email: string; allowedGroupIds: string[] }) {
    return (this.client as any).put(`/teacher-permissions/${encodeURIComponent(email)}`, data);
  }

  // Autenticación
  async login(email: string, password: string) {
    return this.client.post('/auth/login', { email, password });
  }

  async getAuthMe() {
    return this.client.get('/auth/me');
  }

  async logout() {
    return this.client.post('/auth/logout');
  }

  // Mensajes
  async sendMessage(data: {
    content: string;
    recipients: string[];
    channels: string[];
    scheduleAt?: string;
    year?: string;
    reason?: string;
    groupIds?: string[];
    attachments?: {
      fileName: string;
      mimeType: string;
      base64: string;
      inline?: boolean;
      cid?: string;
    }[];
  }) {
    return this.client.post('/messages', data, { timeout: 120000 });
  }

  // Plantillas
  async getTemplates() {
    return this.client.get('/templates');
  }

  async createTemplate(data: { name: string; content: string }) {
    return this.client.post('/templates', data);
  }

  async updateTemplate(id: string, data: { name: string; content: string }) {
    return this.client.put(`/templates/${id}`, data);
  }

  async deleteTemplate(id: string) {
    return this.client.delete(`/templates/${id}`);
  }

  // Uso / métricas
  async getUsageMetrics() {
    return this.client.get('/reports/usage');
  }

  async getMessages(params?: any) {
    return this.client.get('/messages', { params });
  }

  async getMessageById(id: string) {
    return this.client.get(`/messages/${id}`);
  }

  async deleteMessage(id: string) {
    return this.client.delete(`/messages/${id}`);
  }

  async getStudents(params?: any) {
    return this.client.get('/students', { params });
  }

  async createStudent(data: {
    schoolId?: string;
    year?: string;
    course?: string;
    run?: string;
    gender?: string;
    firstName: string;
    lastNameFather?: string;
    lastNameMother?: string;
    address?: string;
    commune?: string;
    email?: string;
    phone?: string;
    guardianFirstName?: string; // legacy
    guardianLastName?: string; // legacy
    guardians?: { name?: string; email?: string; phone?: string }[];
  }) {
    return this.client.post('/students', data);
  }

  async updateStudent(
    id: string,
    data: {
      schoolId?: string;
      year?: string;
      course?: string;
      run?: string;
      gender?: string;
      firstName: string;
      lastNameFather?: string;
      lastNameMother?: string;
    address?: string;
    commune?: string;
    email?: string;
    phone?: string;
    guardianFirstName?: string; // legacy
    guardianLastName?: string; // legacy
    guardians?: { name?: string; email?: string; phone?: string }[];
  }
  ) {
    return this.client.put(`/students/${id}`, data);
  }

  // Datos de escuela
  async getSchoolData() {
    return this.client.get('/school');
  }

  async getSchoolById(id: string) {
    return this.client.get(`/schools/${id}`);
  }

  async updateSchool(id: string, data: { name: string; currentYear?: string; logoUrl?: string }) {
    return this.client.put(`/schools/${id}`, data);
  }

  async createSchool(data: { id: string; name: string; currentYear?: string; logoUrl?: string }) {
    return this.client.post('/schools', data);
  }

  async uploadSchoolLogo(id: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.client.post(`/schools/${id}/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  async getCourses(levelId?: string) {
    return this.client.get('/courses', { params: { levelId } });
  }

  async getLevels() {
    return this.client.get('/levels');
  }

  // Usuarios
  async getCurrentUser() {
    return this.client.get('/auth/me');
  }

  async getUsers(params?: string | { role?: string; page?: number; pageSize?: number; q?: string }) {
    const requestParams = typeof params === 'string' ? { role: params } : params;
    return this.client.get('/users', { params: requestParams });
  }

  async createUser(data: {
    name: string;
    email: string;
    role: string;
    schoolId: string;
    schoolName: string;
    rut: string;
  }) {
    return this.client.post('/users', data);
  }

  async updateUser(id: string, data: {
    name: string;
    email: string;
    role: string;
    schoolId: string;
    schoolName: string;
    rut: string;
  }) {
    return this.client.put(`/users/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.client.delete(`/users/${id}`);
  }

  async requestOtp(email: string) {
    return this.client.post('/auth/otp/request', { email });
  }

  async verifyOtp(email: string, code: string) {
    return this.client.post('/auth/otp/verify', { email, code, studentsOnly: false });
  }

  async getSchools() {
    return this.client.get('/schools');
  }

  async getGroups(schoolId?: string, year?: string, q?: string, page?: number, pageSize?: number) {
    return this.client.get('/groups', { params: { schoolId, year, q, page, pageSize } });
  }

  // Eventos
  async getEvents(params?: { from?: string; to?: string; type?: string }) {
    return this.client.get('/events', { params });
  }

  async createEvent(data: {
    title: string;
    description?: string;
    startDateTime: string;
    endDateTime?: string;
    type?: string;
    id?: string;
    audience?: { userIds?: string[]; groupIds?: string[] };
  }) {
    return this.client.post('/events', data);
  }

  async deleteEvent(id: string) {
    return this.client.delete(`/events/${id}`);
  }

  async createGroup(data: {
    name: string;
    description?: string;
    memberIds: string[];
    schoolId?: string;
    year?: string;
  }) {
    return this.client.post('/groups', data);
  }

  async updateGroup(
    id: string,
    data: {
      name: string;
      description?: string;
      memberIds: string[];
      schoolId?: string;
      year?: string;
    }
  ) {
    return this.client.put(`/groups/${id}`, data);
  }

  async deleteGroup(id: string) {
    return this.client.delete(`/groups/${id}`);
  }

  async forgotPassword(email: string) {
    return this.client.post('/auth/forgot', { email });
  }

  async resetPassword(token: string, newPassword: string) {
    return this.client.post('/auth/reset', { token, newPassword });
  }

  // IA (Vertex)
  async aiRewriteModerate(text: string, subject?: string, tone?: string) {
    return this.client.post('/ai/rewrite-moderate', { text, subject, tone });
  }

  async getAiPolicy() {
    return this.client.get('/ai/policy');
  }

  async updateAiPolicy(data: { rewritePrompt: string; moderationRules: string[] }) {
    return this.client.put('/ai/policy', data);
  }

  // Importación de estudiantes (solo superadmin)
  async importStudentsCsv(file: File, schoolId: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('schoolId', schoolId);
    return this.client.post('/import/students', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000, // hasta 3 minutos para imports grandes
    });
  }
}

export const apiClient = new APIClient();
