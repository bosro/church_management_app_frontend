import { Pipe, PipeTransform } from '@angular/core';
import { WeeklyStudentRow } from '../../features/reports/services/feeding.service';

@Pipe({ name: 'totalField', standalone: false, })
export class TotalFieldPipe implements PipeTransform {
  transform(rows: WeeklyStudentRow[], field: keyof WeeklyStudentRow): number {
    return rows.reduce((s, r) => s + Number(r[field] ?? 0), 0);
  }
}

@Pipe({ name: 'totalPresentDays', standalone: false, })
export class TotalPresentDaysPipe implements PipeTransform {
  transform(rows: WeeklyStudentRow[]): number {
    return rows.reduce((s, r) => s + r.presentDays, 0);
  }
}
