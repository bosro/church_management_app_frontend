// src/app/models/voting.model.ts
export interface VotingCategory {
  id: string;
  church_id: string;
  title: string;
  description?: string;
  image_url?: string;
  max_votes_per_user: number;
  voting_start_at: string;
  voting_end_at: string;
  nominations_start_at?: string;
  nominations_end_at?: string;
  is_active: boolean;
  show_results: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // computed
  status?: 'upcoming' | 'nominations_open' | 'voting_open' | 'closed';
  nominees?: VotingNominee[];
  user_vote_count?: number;
}

export interface VotingNominee {
  id: string;
  category_id: string;
  church_id: string;
  nominee_name: string;
  nominee_description?: string;
  nominee_photo_url?: string;
  member_id?: string;
  nominated_by?: string;
  is_approved: boolean;
  vote_count: number;
  created_at: string;
  updated_at: string;

  // computed
  has_voted?: boolean;
}

export interface VotingVote {
  id: string;
  category_id: string;
  nominee_id: string;
  voter_id: string;
  church_id: string;
  created_at: string;
}

export interface VotingCategoryFormData {
  title: string;
  description?: string;
  image_url?: string;
  max_votes_per_user: number;
  voting_start_at: string;
  voting_end_at: string;
  nominations_start_at?: string;
  nominations_end_at?: string;
  show_results: boolean;
}

export interface NomineeFormData {
  nominee_name: string;
  nominee_description?: string;
  nominee_photo_url?: string;
  member_id?: string;
}
