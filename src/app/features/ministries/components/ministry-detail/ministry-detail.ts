// src/app/features/ministries/components/ministry-detail/ministry-detail.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { MinistryService } from '../../services/ministry.service';
import { Ministry, MinistryMember, MinistryLeader } from '../../../../models/ministry.model';

@Component({
  selector: 'app-ministry-detail',
  standalone: false,
  templateUrl: './ministry-detail.html',
  styleUrl: './ministry-detail.scss',
})
export class MinistryDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  ministryId: string = '';
  ministry: Ministry | null = null;
  members: MinistryMember[] = [];
  leaders: MinistryLeader[] = [];
  loading = true;
  errorMessage = '';
  successMessage = '';

  // Active tab
  activeTab: 'members' | 'leaders' = 'members';

  // Add Member
  showAddMember = false;
  searchControl = new FormControl('');
  searchResults: any[] = [];
  searching = false;
  addingMember = false;

  // Add Leader
  showAddLeader = false;
  selectedMemberForLeader: any = null;
  leaderPosition = '';
  leaderStartDate = new Date().toISOString().split('T')[0];
  leaderEndDate = '';
  addingLeader = false;

  // Permissions
  canManageMinistries = false;
  canManageMembers = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ministryService: MinistryService
  ) {}

  ngOnInit(): void {
    this.checkPermissions();
    this.ministryId = this.route.snapshot.paramMap.get('id') || '';

    if (this.ministryId) {
      this.loadMinistryDetails();
      this.setupMemberSearch();
    } else {
      this.errorMessage = 'Invalid ministry ID';
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    this.canManageMinistries = this.ministryService.canManageMinistries();
    this.canManageMembers = this.ministryService.canManageMembers();

    if (!this.ministryService.canViewMinistries()) {
      this.router.navigate(['/unauthorized']);
    }
  }

  private loadMinistryDetails(): void {
    this.loading = true;
    this.errorMessage = '';

    // Load ministry
    this.ministryService
      .getMinistryById(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ministry) => {
          this.ministry = ministry;
          this.loading = false;
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to load ministry';
          this.loading = false;
          console.error('Ministry load error:', error);
        }
      });

    // Load members
    this.loadMembers();

    // Load leaders
    this.loadLeaders();
  }

  private loadMembers(): void {
    this.ministryService
      .getMinistryMembers(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (members) => {
          this.members = members;
        },
        error: (error) => {
          console.error('Error loading members:', error);
          // Don't show error for members load failure
        }
      });
  }

  private loadLeaders(): void {
    this.ministryService
      .getMinistryLeaders(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (leaders) => {
          this.leaders = leaders;
        },
        error: (error) => {
          console.error('Error loading leaders:', error);
          // Don't show error for leaders load failure
        }
      });
  }

  private setupMemberSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(query => {
          if (!query || query.length < 2) {
            this.searchResults = [];
            return [];
          }
          this.searching = true;
          return this.ministryService.searchAvailableMembers(this.ministryId, query);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (members) => {
          this.searchResults = members;
          this.searching = false;
        },
        error: (error) => {
          console.error('Search error:', error);
          this.searchResults = [];
          this.searching = false;
        }
      });
  }

  // Tab switching
  switchTab(tab: 'members' | 'leaders'): void {
    this.activeTab = tab;

    // Reset add forms when switching tabs
    if (tab === 'members') {
      this.showAddLeader = false;
      this.selectedMemberForLeader = null;
    } else {
      this.showAddMember = false;
    }

    this.searchControl.setValue('');
    this.searchResults = [];
  }

  // Add Member
  toggleAddMember(): void {
    if (!this.canManageMembers) {
      this.errorMessage = 'You do not have permission to manage ministry members';
      this.scrollToTop();
      return;
    }

    this.showAddMember = !this.showAddMember;
    if (!this.showAddMember) {
      this.searchControl.setValue('');
      this.searchResults = [];
    }
  }

  addMemberToMinistry(member: any): void {
    if (this.addingMember) return;

    this.addingMember = true;
    this.errorMessage = '';

    this.ministryService
      .addMemberToMinistry(this.ministryId, member.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${this.getMemberName(member)} added successfully!`;
          this.loadMembers();
          this.toggleAddMember();
          this.addingMember = false;

          // Reload ministry to update member count
          this.ministryService.getMinistryById(this.ministryId)
            .pipe(takeUntil(this.destroy$))
            .subscribe(ministry => this.ministry = ministry);

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to add member';
          this.addingMember = false;
          this.scrollToTop();
          console.error('Add member error:', error);
        }
      });
  }

  removeMember(membershipId: string): void {
    if (!this.canManageMembers) {
      this.errorMessage = 'You do not have permission to manage ministry members';
      this.scrollToTop();
      return;
    }

    const membership = this.members.find(m => m.id === membershipId);
    if (!membership) return;

    const memberName = this.getMemberName(membership.member);
    if (!confirm(`Are you sure you want to remove ${memberName} from this ministry?`)) {
      return;
    }

    this.ministryService
      .removeMemberFromMinistry(membershipId, this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${memberName} removed successfully!`;
          this.loadMembers();

          // Reload ministry to update member count
          this.ministryService.getMinistryById(this.ministryId)
            .pipe(takeUntil(this.destroy$))
            .subscribe(ministry => this.ministry = ministry);

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to remove member';
          this.scrollToTop();
          console.error('Remove member error:', error);
        }
      });
  }

  // Add Leader
  toggleAddLeader(): void {
    if (!this.canManageMembers) {
      this.errorMessage = 'You do not have permission to manage ministry leaders';
      this.scrollToTop();
      return;
    }

    this.showAddLeader = !this.showAddLeader;
    if (!this.showAddLeader) {
      this.selectedMemberForLeader = null;
      this.leaderPosition = '';
      this.leaderStartDate = new Date().toISOString().split('T')[0];
      this.leaderEndDate = '';
      this.searchControl.setValue('');
      this.searchResults = [];
    }
  }

  selectMemberForLeader(member: any): void {
    this.selectedMemberForLeader = member;
    this.searchControl.setValue('');
    this.searchResults = [];
  }

  addLeader(): void {
    if (!this.selectedMemberForLeader || !this.leaderPosition || !this.leaderStartDate) {
      this.errorMessage = 'Please fill in all required fields';
      this.scrollToTop();
      return;
    }

    if (this.leaderPosition.trim().length < 2) {
      this.errorMessage = 'Position must be at least 2 characters';
      this.scrollToTop();
      return;
    }

    if (this.addingLeader) return;

    this.addingLeader = true;
    this.errorMessage = '';

    this.ministryService
      .addMinistryLeader(
        this.ministryId,
        this.selectedMemberForLeader.id,
        this.leaderPosition.trim(),
        this.leaderStartDate,
        this.leaderEndDate || undefined
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${this.getMemberName(this.selectedMemberForLeader)} added as leader!`;
          this.loadLeaders();
          this.toggleAddLeader();
          this.addingLeader = false;

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to add leader';
          this.addingLeader = false;
          this.scrollToTop();
          console.error('Add leader error:', error);
        }
      });
  }

  removeLeader(leadershipId: string): void {
    if (!this.canManageMembers) {
      this.errorMessage = 'You do not have permission to manage ministry leaders';
      this.scrollToTop();
      return;
    }

    const leadership = this.leaders.find(l => l.id === leadershipId);
    if (!leadership) return;

    const leaderName = this.getMemberName(leadership.member);
    const confirmMessage = `Are you sure you want to remove ${leaderName} as ${leadership.position}?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.ministryService
      .removeMinistryLeader(leadershipId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${leaderName} removed as leader!`;
          this.loadLeaders();

          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to remove leader';
          this.scrollToTop();
          console.error('Remove leader error:', error);
        }
      });
  }

  // Export
  exportMinistryReport(): void {
    this.ministryService
      .exportMinistryReport(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.ministry?.name.replace(/\s+/g, '_')}_members_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          this.successMessage = 'Report exported successfully!';
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          this.errorMessage = 'Failed to export report';
          console.error('Export error:', error);
        }
      });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['main/ministries']);
  }

  editMinistry(): void {
    if (!this.canManageMinistries) {
      this.errorMessage = 'You do not have permission to edit ministries';
      this.scrollToTop();
      return;
    }
    this.router.navigate(['main/ministries', this.ministryId, 'edit']);
  }

  deleteMinistry(): void {
    if (!this.canManageMinistries) {
      this.errorMessage = 'You do not have permission to delete ministries';
      this.scrollToTop();
      return;
    }

    if (!this.ministry) return;

    let confirmMessage = `Are you sure you want to delete "${this.ministry.name}"?`;

    if (this.ministry.member_count && this.ministry.member_count > 0) {
      alert(`"${this.ministry.name}" has ${this.ministry.member_count} members. Please remove all members before deleting the ministry.`);
      return;
    }

    if (!confirm(confirmMessage)) {
      return;
    }

    this.ministryService
      .deleteMinistry(this.ministryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.router.navigate(['main/ministries']);
        },
        error: (error) => {
          this.errorMessage = error.message || 'Failed to delete ministry';
          this.scrollToTop();
          console.error('Delete error:', error);
        }
      });
  }

  // Helper methods
  getMemberName(member: any): string {
    if (!member) return 'Unknown';
    return `${member.first_name} ${member.last_name}`;
  }

  getMemberInitials(member: any): string {
    if (!member) return '??';
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
