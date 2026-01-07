
export enum UserRole {
  EMPLOYEE = 'EMPLOYEE',
  VISITOR = 'VISITOR',
  ADMIN = 'ADMIN'
}

export enum LogStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING'
}

export enum AttendanceAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  GATE_OUT = 'GATE_OUT',
  GATE_IN = 'GATE_IN'
}

export enum OvertimeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED'
}

export interface VisitorReason {
  id: string;
  text: string;
}

export interface Notice {
  id?: string;
  content: string;
  isActive: boolean;
  updatedAt: number;
  icon?: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface SystemSettings {
  lateThreshold: string;
  earlyThreshold: string;
  dayStart: string;
  dayEnd: string;
  outsideLogin: string;
  outsideLogout: string;
  companyMotto: string;
  companyContact: string;
  adminPassword?: string;
  // New Time Tracking Settings
  standardDayHours: number; // e.g. 8
  lunchDurationMinutes: number; // e.g. 60
  breakDurationMinutes: number; // e.g. 30
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  pin: string;
  fingerprintHash: string;
  qrCodeData: string;
  imageId?: string;
  createdAt: number;
  outsideWorkUntil?: number | null;
  totalDaysWorked?: number; // Legacy field, now calculated dynamically
  phoneNumber?: string;
  nextOfKin?: string;
  address?: string;
}

export interface Visitor {
  id: string;
  firstName: string;
  lastName: string;
  reason: string;
  identityType: 'ZIM_ID' | 'PASSPORT';
  identityNumber: string;
  timestamp: number;
  photoBase64?: string;
}

export interface FrequentVisitor {
  id: string;
  name: string;
  surname: string;
  idNumber: string;
  phone: string;
  fingerprintHash: string;
}

export interface AttendanceLog {
  id: string;
  subjectId: string;
  subjectName: string;
  timestamp: number;
  status: LogStatus;
  action: AttendanceAction;
  confidence: number;
  type: 'EMPLOYEE' | 'VISITOR';
  category?: 'EARLY' | 'LATE' | 'ON-TIME';
  isOutsideWork?: boolean;
}

export interface InformalLog {
  id: string;
  employeeId: string;
  employeeName: string;
  timeOut: number;
  timeIn?: number;
  duration?: string;
  date: string;
}

export interface AttendanceSession {
  subjectId: string;
  name: string;
  date: string;
  timeIn: string;
  timeOut: string;
  department?: string;
  type: 'EMPLOYEE' | 'VISITOR';
}

// New Interfaces for Calculation
export interface OvertimeDecision {
  id?: string;
  employeeId: string;
  date: string; // DD/MM/YYYY
  hours: number;
  status: OvertimeStatus;
  timestamp: number;
}

export interface DailyWorkRecord {
  date: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  rawHours: number;
  regularHours: number;
  overtimeHours: number;
  overtimeStatus: OvertimeStatus;
  isNightShift: boolean;
  totalContributedHours: number; // regular + (approved OT)
  dayValue: number; // 1 day, 0.5 day etc.
}
