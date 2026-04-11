// src/app/features/voting/components/voting-detail/voting-detail.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { VotingService } from '../../services/voting.service';
import { VotingCategory, VotingNominee } from '../../../../models/voting.model';
import { PermissionService } from '../../../../core/services/permission.service';
import { MemberService } from '../../../members/services/member.service';
import { Member } from '../../../../models/member.model';

@Component({
  selector: 'app-voting-detail',
  standalone: false,
  templateUrl: './voting-detail.html',
  styleUrl: './voting-detail.scss',
})
export class VotingDetail implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  categoryId = '';
  category: VotingCategory | null = null;
  nominees: VotingNominee[] = [];
  allNominees: VotingNominee[] = [];

  loading = false;
  loadingNominees = false;
  voting: Record<string, boolean> = {};
  errorMessage = '';
  successMessage = '';

  userVoteCount = 0;
  canManage = false;
  activeTab: 'vote' | 'manage' = 'vote';

  // ── Nominate Modal ─────────────────────────────────
  showNominateModal = false;
  memberSearchTerm = '';
  memberSearchResults: Member[] = [];
  searchingMembers = false;
  selectedMember: Member | null = null;
  nominationNote = '';
  submittingNomination = false;

  // ── Delete Nominee Confirm Modal ───────────────────
  showDeleteNomineeModal = false;
  nomineeToDelete: VotingNominee | null = null;
  deletingNominee = false;

  constructor(
    private votingService: VotingService,
    private membersService: MemberService,
    private router: Router,
    private route: ActivatedRoute,
    public permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.canManage =
      this.permissionService.isAdmin ||
      this.permissionService.hasRole(['church_admin', 'pastor']);
    this.categoryId = this.route.snapshot.paramMap.get('id') || '';
    if (this.categoryId) {
      this.loadCategory();
      this.loadNominees();
      if (this.canManage) this.loadAllNominees();
    }

    // Debounced member search
    this.searchSubject
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => this.searchMembers(term));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data Loading ───────────────────────────────────

  private loadCategory(): void {
    this.loading = true;
    this.votingService.getCategoryById(this.categoryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cat) => { this.category = cat; this.loading = false; },
        error: (err) => { this.errorMessage = err.message; this.loading = false; },
      });
  }

  private loadNominees(): void {
    this.loadingNominees = true;
    this.votingService.getNominees(this.categoryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (nominees) => {
          this.nominees = nominees;
          this.userVoteCount = nominees.filter(n => n.has_voted).length;
          this.loadingNominees = false;
        },
        error: (err) => { this.errorMessage = err.message; this.loadingNominees = false; },
      });
  }

  private loadAllNominees(): void {
    this.votingService.getAllNominees(this.categoryId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (nominees) => { this.allNominees = nominees; },
        error: () => {},
      });
  }

  // ── Nominate Modal: Member Search ──────────────────

  openNominateModal(): void {
    this.showNominateModal = true;
    this.memberSearchTerm = '';
    this.memberSearchResults = [];
    this.selectedMember = null;
    this.nominationNote = '';
  }

  closeNominateModal(): void {
    this.showNominateModal = false;
    this.memberSearchTerm = '';
    this.memberSearchResults = [];
    this.selectedMember = null;
    this.nominationNote = '';
  }

  onMemberSearch(term: string): void {
    this.selectedMember = null;
    if (term.trim().length < 2) {
      this.memberSearchResults = [];
      return;
    }
    this.searchSubject.next(term.trim());
  }

  private searchMembers(term: string): void {
    this.searchingMembers = true;
   this.membersService.getMembers({ search_term: term }, 1, 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data }) => {
          // Filter out already-nominated members
          const nominatedMemberIds = new Set(
            this.allNominees.map(n => n.member_id).filter(Boolean)
          );
          this.memberSearchResults = data.filter(m => !nominatedMemberIds.has(m.id));
          this.searchingMembers = false;
        },
        error: () => { this.searchingMembers = false; },
      });
  }

  selectMember(member: Member): void {
    this.selectedMember = member;
    this.memberSearchTerm = this.getMemberFullName(member);
    this.memberSearchResults = [];
  }

  clearSelectedMember(): void {
    this.selectedMember = null;
    this.memberSearchTerm = '';
    this.memberSearchResults = [];
  }

  getMemberFullName(member: Member): string {
    return [member.first_name, member.middle_name, member.last_name]
      .filter(Boolean).join(' ');
  }

  submitNomination(): void {
    if (!this.selectedMember) return;
    this.submittingNomination = true;

    const formData = {
      nominee_name: this.getMemberFullName(this.selectedMember),
      nominee_description: this.nominationNote.trim() || undefined,
      nominee_photo_url: this.selectedMember.photo_url || undefined,
      member_id: this.selectedMember.id,
    };

    this.votingService.addNominee(this.categoryId, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${formData.nominee_name} has been nominated! An admin will review before they appear on the ballot.`;
          this.closeNominateModal();
          this.submittingNomination = false;
          if (this.canManage) this.loadAllNominees();
          setTimeout(() => (this.successMessage = ''), 6000);
        },
        error: (err) => {
          this.errorMessage = err.message || 'Failed to submit nomination';
          this.submittingNomination = false;
        },
      });
  }

  // ── Voting ─────────────────────────────────────────

  castVote(nominee: VotingNominee): void {
    if (!this.isVotingOpen) return;
    if (nominee.has_voted) { this.removeVote(nominee); return; }

    if (this.userVoteCount >= this.maxVotes) {
      this.errorMessage = `You have used all ${this.maxVotes} vote(s) for this category.`;
      setTimeout(() => (this.errorMessage = ''), 4000);
      return;
    }

    this.voting[nominee.id] = true;
    this.votingService.castVote(this.categoryId, nominee.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          nominee.has_voted = true;
          nominee.vote_count++;
          this.userVoteCount++;
          this.voting[nominee.id] = false;
          this.successMessage = `Voted for ${nominee.nominee_name}!`;
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.voting[nominee.id] = false;
        },
      });
  }

  removeVote(nominee: VotingNominee): void {
    this.voting[nominee.id] = true;
    this.votingService.removeVote(this.categoryId, nominee.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          nominee.has_voted = false;
          nominee.vote_count = Math.max(0, nominee.vote_count - 1);
          this.userVoteCount = Math.max(0, this.userVoteCount - 1);
          this.voting[nominee.id] = false;
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.voting[nominee.id] = false;
        },
      });
  }

  // ── Admin Actions ──────────────────────────────────

  approveNominee(nominee: VotingNominee): void {
    this.votingService.approveNominee(nominee.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          nominee.is_approved = true;
          this.loadNominees();
          this.successMessage = `${nominee.nominee_name} approved — now visible on the ballot!`;
          setTimeout(() => (this.successMessage = ''), 4000);
        },
        error: (err) => { this.errorMessage = err.message; },
      });
  }

  openDeleteNomineeModal(nominee: VotingNominee): void {
    this.nomineeToDelete = nominee;
    this.showDeleteNomineeModal = true;
  }

  closeDeleteNomineeModal(): void {
    this.nomineeToDelete = null;
    this.showDeleteNomineeModal = false;
  }

  confirmDeleteNominee(): void {
    if (!this.nomineeToDelete) return;
    this.deletingNominee = true;

    this.votingService.deleteNominee(this.nomineeToDelete.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage = `${this.nomineeToDelete!.nominee_name} removed from nominees.`;
          this.deletingNominee = false;
          this.closeDeleteNomineeModal();
          this.loadNominees();
          this.loadAllNominees();
          setTimeout(() => (this.successMessage = ''), 3000);
        },
        error: (err) => {
          this.errorMessage = err.message;
          this.deletingNominee = false;
        },
      });
  }

  // ── Computed getters ───────────────────────────────

  get isVotingOpen(): boolean { return this.category?.status === 'voting_open'; }
  get isNominationsOpen(): boolean {
    return this.category?.status === 'nominations_open' || this.category?.status === 'voting_open';
  }
  get maxVotes(): number { return this.category?.max_votes_per_user || 1; }
  get votesRemaining(): number { return Math.max(0, this.maxVotes - this.userVoteCount); }
  get totalVotes(): number { return this.nominees.reduce((sum, n) => sum + n.vote_count, 0); }

  getVotePercent(nominee: VotingNominee): number {
    if (this.totalVotes === 0) return 0;
    return Math.round((nominee.vote_count / this.totalVotes) * 100);
  }

  getStatusLabel(status: VotingCategory['status']): string {
    const map: Record<string, string> = {
      upcoming: 'Upcoming', nominations_open: 'Nominations Open',
      voting_open: 'Voting Open', closed: 'Closed',
    };
    return map[status || 'upcoming'] || '';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GH', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  goBack(): void { this.router.navigate(['/main/voting']); }
}
