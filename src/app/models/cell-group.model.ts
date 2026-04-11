// src/app/models/cell-group.model.ts — replace entirely
export interface CellGroup {
  id: string;
  church_id: string;
  branch_id?: string;
  name: string;
  description?: string;
  leader_id?: string;
  meeting_day?: string;
  meeting_time?: string;
  meeting_location?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // from cell_groups_with_leader view
  leader_name?: string | null;
  leader_email?: string | null;
  leader_avatar?: string | null;
  member_count?: number | null;
}

export interface CellGroupCreateInput {
  name: string;
  description?: string;
  leader_id?: string;
  branch_id?: string;
  meeting_day?: string;
  meeting_time?: string;
  meeting_location?: string;
}

export interface CellGroupUpdateInput extends Partial<CellGroupCreateInput> {
  is_active?: boolean;
}
