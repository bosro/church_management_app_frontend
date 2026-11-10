// src/app/features/finance/components/welfare-list/welfare-list.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { FormControl } from '@angular/forms';
import { Subject, of } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
} from 'rxjs/operators';
import {
  WelfareService,
  WelfareRow,
  WelfareSettings,
  WelfareStanding,
} from './../../services/welfare.service';
import { FinanceService } from '../../services/finance.service';
import { MemberService } from '../../../members/services/member.service';
import { PermissionService } from '../../../../core/services/permission.service';
import { GivingCategory } from '../../../../models/giving.model';
import { Member } from '../../../../models/member.model';

@Component({
  selector: 'app-welfare-list',
  standalone: false,
  templateUrl: './welfare-list.html',
  styleUrl: './welfare-list.scss',
})
export class WelfareList implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = true;
  errorMessage = '';
  successMessage = '';

  settings: WelfareSettings | null = null;
  rows: WelfareRow[] = [];
  categories: GivingCategory[] = [];

  // Scheme settings form
  showSettings = false;
  formCategoryId = '';
  formMonthly: number | null = null;
  formStartMonth = ''; // YYYY-MM
  savingSettings = false;

  // List filters
  search = '';
  standingFilter: '' | WelfareStanding = '';

  // Enrol modal
  showEnrol = false;
  memberSearch = new FormControl('');
  searchResults: Member[] = [];
  searching = false;
  picked: Member[] = [];
  enrolling = false;
  addingPastPayers = false;

  canManage = false;

  constructor(
    private welfare: WelfareService,
    private financeService: FinanceService,
    private memberService: MemberService,
    private router: Router,
    private location: Location,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.canManage =
      this.permissionService.isAdmin || this.permissionService.finance.manage;
    this.setupMemberSearch();
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack(): void {
    this.location.back();
  }

  // ── Loading ────────────────────────────────────────────────
  async loadAll(): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.categories = await new Promise<GivingCategory[]>((resolve, reject) =>
        this.financeService.getGivingCategories().subscribe({ next: resolve, error: reject }),
      );
      this.settings = await this.welfare.getSettings();
      this.rows = this.settings ? await this.welfare.getOverview() : [];
      if (!this.settings) this.prepareSettingsForm();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not load welfare data.';
    } finally {
      this.loading = false;
    }
  }

  private prepareSettingsForm(): void {
    const welfareCat = this.categories.find((c) => /welfare/i.test(c.name));
    this.formCategoryId = this.settings?.category_id || welfareCat?.id || '';
    this.formMonthly = this.settings?.monthly_amount ?? null;
    this.formStartMonth = this.settings
      ? this.settings.start_month.substring(0, 7)
      : new Date().toISOString().substring(0, 7);
    this.showSettings = true;
  }

  openSettings(): void {
    this.prepareSettingsForm();
  }

  async saveSettings(): Promise<void> {
    if (!this.formCategoryId || !this.formMonthly || this.formMonthly <= 0 || !this.formStartMonth) {
      this.errorMessage = 'Choose the welfare category, a monthly amount and a start month.';
      return;
    }
    this.savingSettings = true;
    this.errorMessage = '';
    try {
      await this.welfare.saveSettings({
        category_id: this.formCategoryId,
        monthly_amount: Number(this.formMonthly),
        start_month: `${this.formStartMonth}-01`,
      });
      this.showSettings = false;
      this.flash('Welfare settings saved.');
      await this.loadAll();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not save settings.';
    } finally {
      this.savingSettings = false;
    }
  }

  // ── Derived numbers ────────────────────────────────────────
  get filteredRows(): WelfareRow[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter((r) => {
      const matchesStanding = !this.standingFilter || r.standing === this.standingFilter;
      const name = `${r.first_name} ${r.last_name} ${r.member_number ?? ''} ${r.phone ?? ''}`.toLowerCase();
      return matchesStanding && (!q || name.includes(q));
    });
  }

  count(standing: WelfareStanding): number {
    return this.rows.filter((r) => r.standing === standing).length;
  }
  get inGoodStanding(): number {
    return this.count('up_to_date') + this.count('ahead');
  }
  get totalCollected(): number {
    return this.rows.reduce((s, r) => s + r.total_paid, 0);
  }
  get totalOwed(): number {
    return this.rows.reduce((s, r) => s + r.amount_owed, 0);
  }

  setStandingFilter(f: '' | WelfareStanding): void {
    this.standingFilter = this.standingFilter === f ? '' : f;
  }

  // ── Enrol ──────────────────────────────────────────────────
  private setupMemberSearch(): void {
    this.memberSearch.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          if (!q || q.length < 2) {
            this.searchResults = [];
            return of([] as Member[]);
          }
          this.searching = true;
          return this.memberService.searchMembers(q).pipe(catchError(() => of([] as Member[])));
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((members) => {
        this.searchResults = members;
        this.searching = false;
      });
  }

  openEnrol(): void {
    this.picked = [];
    this.searchResults = [];
    this.memberSearch.setValue('', { emitEvent: false });
    this.showEnrol = true;
  }

  isEnrolled(id: string): boolean {
    return this.rows.some((r) => r.member_id === id);
  }
  isPicked(id: string): boolean {
    return this.picked.some((m) => m.id === id);
  }
  togglePick(m: Member): void {
    this.picked = this.isPicked(m.id)
      ? this.picked.filter((p) => p.id !== m.id)
      : [...this.picked, m];
  }

  async confirmEnrol(): Promise<void> {
    if (!this.picked.length) return;
    this.enrolling = true;
    this.errorMessage = '';
    try {
      await this.welfare.enrol(this.picked.map((m) => m.id));
      this.showEnrol = false;
      this.flash(`${this.picked.length} member(s) enrolled.`);
      this.rows = await this.welfare.getOverview();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not enrol members.';
    } finally {
      this.enrolling = false;
    }
  }

  async addPastPayers(): Promise<void> {
    if (!this.settings) return;
    this.addingPastPayers = true;
    this.errorMessage = '';
    try {
      const added = await this.welfare.enrolPastPayers(this.settings.category_id);
      this.flash(
        added > 0
          ? `${added} member(s) who already paid welfare were enrolled.`
          : 'Everyone who has paid welfare is already enrolled.',
      );
      this.rows = await this.welfare.getOverview();
    } catch (e: any) {
      this.errorMessage = e?.message || 'Could not add members.';
    } finally {
      this.addingPastPayers = false;
    }
  }

  // ── Navigation / export ────────────────────────────────────
  openMember(r: WelfareRow): void {
    this.router.navigate(['main/finance/welfare', r.member_id]);
  }

  exportCsv(): void {
    const header = [
      'Member No', 'First Name', 'Last Name', 'Phone', 'Status', 'Standing', 'Start Month',
      'Months Covered', 'Paid Through', 'Total Paid', 'Amount Owed', 'Last Payment',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = this.filteredRows.map((r) =>
      [
        r.member_number, r.first_name, r.last_name, r.phone, r.enrol_status,
        this.standingLabel(r.standing), r.start_month, r.months_covered,
        r.paid_through ? r.paid_through.substring(0, 7) : '', r.total_paid.toFixed(2),
        r.amount_owed.toFixed(2), r.last_payment_date ?? '',
      ].map(esc).join(','),
    );
    const csv = [header.map(esc).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welfare_members_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Display helpers ────────────────────────────────────────
  standingLabel(s: WelfareStanding): string {
    const map: Record<WelfareStanding, string> = {
      up_to_date: 'Up to date',
      ahead: 'Paid ahead',
      behind: 'Behind',
      not_paying: 'Not paying',
      paused: 'Paused',
      left: 'Left scheme',
    };
    return map[s] || s;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount || 0);
  }

  formatMonth(date: string | null): string {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  initials(r: WelfareRow): string {
    return `${r.first_name?.[0] ?? ''}${r.last_name?.[0] ?? ''}`.toUpperCase();
  }

  private flash(msg: string): void {
    this.successMessage = msg;
    setTimeout(() => (this.successMessage = ''), 5000);
  }
}