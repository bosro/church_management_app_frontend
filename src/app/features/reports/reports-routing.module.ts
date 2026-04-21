// src/app/features/sermons/sermons-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RoleGuard } from '../../core/guards/role-guard';
import { PermissionGuard } from '../../core/guards/permission.guard';
import { ReportsOverview } from './components/reports-overview/reports-overview';
import { StudentsList } from './components/students/students-list/students-list';
import { AddStudent } from './components/students/add-student/add-student';
import { StudentDetail } from './components/students/student-detail/student-detail';
import { EditStudent } from './components/students/edit-student/edit-student';
import { ClassesList } from './components/classes/classes-list/classes-list';
import { FeeStructures } from './components/fees/fee-structures/fee-structures';
import { RecordPayment } from './components/fees/record-payment/record-payment';
import { FeeReport } from './components/fees/fee-report/fee-report';
import { ReceiptView } from './components/receipts/receipt-view/receipt-view';
import { ExamsList } from './components/exams/exams-list/exams-list';
import { CreateExam } from './components/exams/create-exam/create-exam';
import { EnterResults } from './components/exams/enter-results/enter-results';
import { ResultsReport } from './components/exams/results-report/results-report';
import { SharedModule } from '../../shared/shared-module';
import { GradingScaleComponent } from './components/settings/grading-scale/grading-scale';
import { SubjectsList } from './components/settings/subjects-list/subjects-list';
import { StudentFees } from './components/fees/student-fees/student-fees';
import { ImportStudents } from './components/add-student/import-students/import-students';
import { FeedingAdmin } from './components/feeding/feeding-admin/feeding-admin';

const routes: Routes = [
  {
    path: '',
    component: ReportsOverview,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'finance_officer'],
      permission: 'reports.view',
      requiresFeature: 'reports',
    },
  },
  // Students
  {
    path: 'students',
    component: StudentsList,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'finance_officer'],
      permission: 'school.view',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'students/add',
    component: AddStudent,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.manage',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'students/import',
    component: ImportStudents,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.manage',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'students/:id',
    component: StudentDetail,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'finance_officer'],
      permission: 'school.view',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'students/:id/edit',
    component: EditStudent,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.manage',
      requiresFeature: 'reports',
    },
  },
  // Classes
  {
    path: 'classes',
    component: ClassesList,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'finance_officer'],
      permission: 'school.view',
      requiresFeature: 'reports',
    },
  },
  // Fees
  {
    path: 'fees/structures',
    component: FeeStructures,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.fees',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'fees/students',
    component: StudentFees,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.fees',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'fees/record/:studentId',
    component: RecordPayment,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.fees',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'fees/report',
    component: FeeReport,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.fees',
      requiresFeature: 'reports',
    },
  },
   {
    path: 'fees/feeding-admin',
    component: FeedingAdmin,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin'],
      permission: 'school.manage',
      requiresFeature: 'reports',
    },
  },
  // Receipts
  {
    path: 'receipts/:receiptNumber',
    component: ReceiptView,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.receipts',
      requiresFeature: 'reports',
    },
  },
  // Exams
  {
    path: 'exams',
    component: ExamsList,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'finance_officer'],
      permission: 'school.exams',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'exams/create',
    component: CreateExam,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin'],
      permission: 'school.exams',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'exams/:id/results',
    component: EnterResults,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'finance_officer'],
      permission: 'school.exams',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'exams/:examId/students/:studentId/report',
    component: ResultsReport,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin', 'pastor', 'finance_officer'],
      permission: 'school.exams',
      requiresFeature: 'reports',
    },
  },
  // Settings
  {
    path: 'settings/grading',
    component: GradingScaleComponent,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin'],
      permission: 'school.manage',
      requiresFeature: 'reports',
    },
  },
  {
    path: 'settings/subjects',
    component: SubjectsList,
    canActivate: [PermissionGuard],
    data: {
      roles: ['super_admin', 'church_admin'],
      permission: 'school.manage',
      requiresFeature: 'reports',
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule, SharedModule],
})
export class ReportsRoutingModule {}



