export type TeamRole = 'owner' | 'admin' | 'member';

export interface Team {
  id: string;
  name: string;
  workspaceId: string;
  ownerId: string;
  seatLimit: number;
  createdAt: number;
}

export interface TeamMember {
  teamId: string;
  accountId: string;
  email: string;
  role: TeamRole;
  joinedAt: number;
}

export interface TeamLibraryItem {
  teamId: string;
  captureId: string;
  ownerAccountId: string;
  sharedBy: string;
  filename: string;
  tag: string | null;
  ocrText: string;
  hasPii: boolean;
  createdAt: number;
  updatedAt: number;
}
