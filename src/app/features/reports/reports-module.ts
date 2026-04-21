import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReportsOverview } from './components/reports-overview/reports-overview';
import { ExamsList } from './components/exams/exams-list/exams-list';
import { CreateExam } from './components/exams/create-exam/create-exam';
import { EnterResults } from './components/exams/enter-results/enter-results';
import { ResultsReport } from './components/exams/results-report/results-report';
import { FeeStructures } from './components/fees/fee-structures/fee-structures';
import { StudentFees } from './components/fees/student-fees/student-fees';
import { RecordPayment } from './components/fees/record-payment/record-payment';
import { FeeReport } from './components/fees/fee-report/fee-report';
import { ReceiptView } from './components/receipts/receipt-view/receipt-view';
import { ClassesList } from './components/classes/classes-list/classes-list';
import { StudentsList } from './components/students/students-list/students-list';
import { AddStudent } from './components/students/add-student/add-student';
import { EditStudent } from './components/students/edit-student/edit-student';
import { StudentDetail } from './components/students/student-detail/student-detail';
import { RouterModule } from '@angular/router';
import { ReportsRoutingModule } from './reports-routing.module';
import { GradingScaleComponent } from './components/settings/grading-scale/grading-scale';
import { SubjectsList } from './components/settings/subjects-list/subjects-list';
import { ImportStudents } from './components/add-student/import-students/import-students';
import { ExportBrandingSettings } from './components/export-branding-settings/export-branding-settings';
import { FeedingRecord } from '../public/feeding-record/feeding-record';
import { FeedingAdmin } from './components/feeding/feeding-admin/feeding-admin';



@NgModule({
  declarations: [
    ReportsOverview,
    ExamsList,
    CreateExam,
    EnterResults,
    ResultsReport,
    FeeStructures,
    StudentFees,
    RecordPayment,
    FeeReport,
    ReceiptView,
    ClassesList,
    StudentsList,
    AddStudent,
    EditStudent,
    StudentDetail,
    GradingScaleComponent,
    SubjectsList,
    ImportStudents,
    ExportBrandingSettings,
    FeedingAdmin
  ],
  imports: [
    CommonModule,
    ReportsRoutingModule
  ]
})
export class ReportsModule { }
