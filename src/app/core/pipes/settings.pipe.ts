import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'settingScope',
  standalone: false,
})
export class SettingScopePipe implements PipeTransform {
  transform(rows: any[], scope: 'tier' | 'class' | 'school'): any[] {
    if (!rows) return [];
    return rows.filter((r) => r.scope === scope);
  }
}
 