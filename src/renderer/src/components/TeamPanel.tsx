import { useCallback, useEffect, useState } from 'react';
import { Copy, Users } from 'lucide-react';
import { api } from '../api';

interface MemberRow {
  email: string;
  role: string;
  accountId: string;
}

interface Props {
  flash: (text: string, ok?: boolean) => void;
  teamEligible: boolean;
}

export default function TeamPanel({ flash, teamEligible }: Props) {
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState('');
  const [newTeamName, setNewTeamName] = useState('My team');
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [seats, setSeats] = useState<{ used: number; limit: number } | null>(null);
  const [configured, setConfigured] = useState(true);
  const [lastInviteUrl, setLastInviteUrl] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await api.team.me();
    setConfigured(data.configured !== false);
    if (data.team) {
      setTeamId(data.team.id);
      setTeamName(data.team.name);
      setRole(data.role ?? null);
      setMembers((data.members ?? []).map((m: { email: string; role: string; accountId: string }) => ({
        email: m.email, role: m.role, accountId: m.accountId,
      })));
      setSeats(data.seats ?? null);
    } else {
      setTeamId(null);
      setTeamName('');
      setMembers([]);
      setSeats(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!teamEligible) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="plan-feature-row">
          <span className="plan-feature-key">Team</span>
          <span className="plan-feature-val">Upgrade to Team for shared libraries and seats.</span>
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Connect the desktop app to the backend (`SNAPFLOW_API_TOKEN`) to manage teams.</p>
      </div>
    );
  }

  const create = async () => {
    const res = await api.team.create(newTeamName.trim() || 'My team');
    if (res.ok) {
      flash('Team created');
      await refresh();
    } else flash(res.detail ?? 'Could not create team', false);
  };

  const invite = async () => {
    if (!teamId || !inviteEmail.trim()) return;
    const res = await api.team.invite({ teamId, email: inviteEmail.trim(), role: 'member' });
    if (res.ok && res.inviteUrl) {
      setLastInviteUrl(res.inviteUrl);
      flash('Invite link ready — copy below');
      setInviteEmail('');
    } else flash(res.detail ?? 'Invite failed', false);
  };

  const leave = async () => {
    if (!teamId) return;
    const res = await api.team.leave(teamId);
    if (res.ok) {
      flash('Left team');
      setLastInviteUrl('');
      await refresh();
    } else flash(res.detail ?? 'Could not leave', false);
  };

  const copyInvite = async () => {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      flash('Invite link copied');
    } catch {
      flash('Copy failed', false);
    }
  };

  return (
    <div className="card account-plan" style={{ marginTop: 16 }}>
      <div className="account-plan-head">
        <h2 className="screen-sub" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={16} /> Team
        </h2>
        {seats && <span className="count-badge">{seats.used} / {seats.limit} seats</span>}
      </div>

      {loading ? (
        <p className="empty" style={{ padding: '12px 0' }}>Loading…</p>
      ) : !teamId ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: '#666' }}>Create a team workspace for shared capture libraries.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="filter-search" style={{ flex: 1 }} value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Team name" />
            <button className="btn-primary" type="button" onClick={() => void create()}>Create</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className="plan-feature-row">
            <span className="plan-feature-key">Name</span>
            <span className="plan-feature-val">{teamName}</span>
          </div>
          <div className="plan-feature-row">
            <span className="plan-feature-key">Your role</span>
            <span className="plan-feature-val">{role}</span>
          </div>

          {(role === 'owner' || role === 'admin') && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, color: '#666' }}>Invite by email (link returned — no email sent)</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input className="filter-search" style={{ flex: 1 }} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" />
                <button className="btn-ghost" type="button" onClick={() => void invite()}>Invite</button>
              </div>
              {lastInviteUrl && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="filter-search" style={{ flex: 1, fontSize: 12 }} readOnly value={lastInviteUrl} />
                  <button className="btn-ghost" type="button" title="Copy invite link" onClick={() => void copyInvite()}><Copy size={14} /></button>
                </div>
              )}
            </div>
          )}

          <MembersList members={members} />

          {role !== 'owner' && (
            <button className="btn-ghost" type="button" style={{ marginTop: 16 }} onClick={() => void leave()}>Leave team</button>
          )}
        </div>
      )}
    </div>
  );
}

function MembersList({ members }: { members: MemberRow[] }) {
  return (
    <div style={{ marginTop: 16 }}>
      <span className="plan-feature-key">Members</span>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
        {members.map(m => (
          <li key={m.accountId} className="plan-feature-row" style={{ padding: '4px 0' }}>
            <span>{m.email}</span>
            <span className="tier-badge" style={{ fontSize: 11 }}>{m.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
