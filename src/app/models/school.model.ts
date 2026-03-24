export interface SchoolClass {
  id: string;
  church_id: string;
  name: string;
  level_order: number;
  academic_year: string;
  class_teacher?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  student_count?: number;
}

export interface Student {
  id: string;
  church_id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  date_of_birth?: string;
  gender?: string;
  class_id?: string;
  class?: SchoolClass;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  photo_url?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeeStructure {
  id: string;
  church_id: string;
  class_id: string;
  class?: SchoolClass;
  academic_year: string;
  term: string;
  fee_name: string;
  amount: number;
  is_mandatory: boolean;
  created_at: string;
}

export interface StudentFee {
  id: string;
  church_id: string;
  student_id: string;
  student?: Student;
  fee_structure_id?: string;
  academic_year: string;
  term: string;
  fee_name: string;
  amount_due: number;
  amount_paid: number;
  balance?: number;
  status: 'unpaid' | 'partial' | 'paid';
  due_date?: string;
  created_at: string;
}

export interface FeePayment {
  id: string;
  church_id: string;
  student_id: string;
  student?: Student;
  receipt_number: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  academic_year: string;
  term: string;
  received_by?: string;
  notes?: string;
  fee_items: { fee_name: string; amount: number }[];
  created_at: string;
}

export interface Subject {
  id: string;
  church_id: string;
  class_id: string;
  class?: SchoolClass;
  name: string;
  teacher_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface GradingScale {
  id: string;
  church_id: string;
  grade: string;
  min_score: number;
  max_score: number;
  label: string;
}

export interface Exam {
  id: string;
  church_id: string;
  class_id: string;
  class?: SchoolClass;
  exam_name: string;
  academic_year: string;
  term: string;
  exam_date?: string;
  total_marks?: number;
  is_published: boolean;
  created_at: string;
}

export interface ExamResult {
  id: string;
  church_id: string;
  student_id: string;
  student?: Student;
  exam_id: string;
  subject_id: string;
  subject?: Subject;
  marks_obtained?: number;
  grade?: string;
  remarks?: string;
}

export interface StudentReportCard {
  student: Student;
  class: SchoolClass;
  exam: Exam;
  results: ExamResult[];
  total_marks: number;
  average: number;
  position?: number;
  total_students?: number;
  academic_year: string;
  term: string;
}

export interface FeeStatement {
  student: Student;
  class: SchoolClass;
  academic_year: string;
  term: string;
  fees: StudentFee[];
  total_due: number;
  total_paid: number;
  total_balance: number;
  payments: FeePayment[];
}

export const DEFAULT_CLASSES = [
  { name: 'Creche', level_order: 1 },
  { name: 'Nursery', level_order: 2 },
  { name: 'KG 1', level_order: 3 },
  { name: 'KG 2', level_order: 4 },
  { name: 'Primary 1', level_order: 5 },
  { name: 'Primary 2', level_order: 6 },
  { name: 'Primary 3', level_order: 7 },
  { name: 'Primary 4', level_order: 8 },
  { name: 'Primary 5', level_order: 9 },
  { name: 'Primary 6', level_order: 10 },
  { name: 'JHS 1', level_order: 11 },
  { name: 'JHS 2', level_order: 12 },
  { name: 'JHS 3', level_order: 13 },
];

export const DEFAULT_GRADING_SCALE: Omit<GradingScale, 'id' | 'church_id'>[] = [
  { grade: '1', min_score: 90, max_score: 100, label: 'Excellent' },
  { grade: '2', min_score: 80, max_score: 89, label: 'Very Good' },
  { grade: '3', min_score: 70, max_score: 79, label: 'Good' },
  { grade: '4', min_score: 60, max_score: 69, label: 'Credit' },
  { grade: '5', min_score: 50, max_score: 59, label: 'Average' },
  { grade: '6', min_score: 45, max_score: 49, label: 'Pass' },
  { grade: '7', min_score: 40, max_score: 44, label: 'Weak Pass' },
  { grade: '8', min_score: 30, max_score: 39, label: 'Fail' },
  { grade: '9', min_score: 0, max_score: 29, label: 'Poor' },
];

export const TERMS = ['Term 1', 'Term 2', 'Term 3'];
export const PAYMENT_METHODS = [
  'Cash',
  'Mobile Money',
  'Bank Transfer',
  'Cheque',
];






