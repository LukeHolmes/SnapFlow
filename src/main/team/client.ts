import { readFileSync } from 'node:fs';
import type { Capture, DeliverResult } from '../../shared/types';
import { teamInviteErrorMessage } from '../../shared/team-invite';

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamSummary {
  id: string;
  name: string;
  workspaceId: string;
  ownerId: string;
  seatLimit: number;
  createdAt: number;
}

export interface TeamMemberRow {
  teamId: string;
  accountId: string;
  email: string;
  role: TeamRole;
  joinedAt: number;
}

export interface TeamMeResponse {
  team: TeamSummary | null;
  role?: TeamRole;
  members?: TeamMemberRow[];
  seats?: { used: number; limit: number };
}

export class TeamBackendClient {
  constructor(private baseUrl?: string, private token?: string) {}

  get configured(): boolean {
    return !!(this.baseUrl && this.token);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.configured) throw new Error('Team API not configured (set SNAPFLOW_API_TOKEN and SNAPFLOW_AI_PROXY_URL)');
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => ({})) as T & { error?: string; message?: string };
    if (!res.ok) {
      const code = (json as { error?: string }).error;
      const serverMessage = (json as { message?: string }).message;
      const detail = code ? teamInviteErrorMessage(code, serverMessage) : serverMessage ?? `HTTP ${res.status}`;
      throw new Error(detail);
    }
    return json as T;
  }

  async me(): Promise<TeamMeResponse> {
    return this.request<TeamMeResponse>('/v1/teams/me');
  }

  async createTeam(name: string): Promise<TeamMeResponse & { team: TeamSummary }> {
    return this.request(`/v1/teams`, { method: 'POST', body: JSON.stringify({ name }) });
  }

  async invite(teamId: string, email: string, role: TeamRole = 'member'): Promise<{ inviteUrl: string; expiresAt: number }> {
    return this.request(`/v1/teams/${encodeURIComponent(teamId)}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  async acceptInvite(token: string): Promise<{ ok: true; team: TeamSummary; role?: TeamRole }> {
    return this.request(`/v1/teams/invites/accept`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async leave(teamId: string): Promise<DeliverResult> {
    await this.request(`/v1/teams/${encodeURIComponent(teamId)}/members/me`, { method: 'DELETE' });
    return { ok: true, detail: 'Left team' };
  }

  async shareCapture(teamId: string, capture: Capture): Promise<DeliverResult> {
    const baseUrl = this.baseUrl!;
    const token = this.token!;
    const blobRes = await fetch(`${baseUrl}/v1/sync/blob/${encodeURIComponent(capture.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ base64: readFileSync(capture.imagePath).toString('base64') }),
    });
    if (!blobRes.ok) {
      const err = await blobRes.json().catch(() => ({})) as { message?: string };
      throw new Error(err.message ?? `Blob upload failed (${blobRes.status})`);
    }
    await this.request(`/v1/teams/${encodeURIComponent(teamId)}/library`, {
      method: 'POST',
      body: JSON.stringify({
        captureId: capture.id,
        filename: capture.filename,
        tag: capture.tag,
        ocrText: capture.ocrText,
        hasPii: capture.hasPii,
      }),
    });
    return { ok: true, detail: 'Shared with team library' };
  }
}

export const teamClientFromEnv = (): TeamBackendClient =>
  new TeamBackendClient(process.env.SNAPFLOW_CLOUD_URL || process.env.SNAPFLOW_AI_PROXY_URL, process.env.SNAPFLOW_API_TOKEN);
