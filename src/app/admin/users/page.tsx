'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminShell from '@/components/AdminShell';

type AppUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  phone: string | null;
  staffNumber: string | null;
  banned: boolean;
  createdAt: string;
  lastSignIn: string | null;
};

const ROLES = [
  { value: 'super_admin',  label: 'Super Admin' },
  { value: 'admin',        label: 'Admin' },
  { value: 'principal',    label: 'Principal' },
  { value: 'teacher',      label: 'Teacher' },
  { value: 'security',     label: 'Security (Scanner)' },
  { value: 'finance',      label: 'Finance' },
  { value: 'admissions',   label: 'Admissions' },
  { value: 'parent',       label: 'Parent' },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#7c3aed', admin: '#2563eb', principal: '#0891b2',
  teacher: '#16a34a', security: '#d97706', finance: '#db2777',
  admissions: '#ea580c', parent: '#6b7280',
};

function RoleBadge({ role }: { role: string | null }) {
  const color = role ? (ROLE_COLORS[role] || '#6b7280') : '#d1d5db';
  const label = role ? (ROLES.find(r => r.value === role)?.label || role) : 'No role';
  return (
    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: color + '18', color, border: `1px solid ${color}33` }}>
      {label}
    </span>
  );
}

type ModalMode = 'create' | 'edit' | 'password' | null;

export default function UserManagement() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);

  // Form state
  const [fEmail, setFEmail] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [fName, setFName] = useState('');
  const [fRole, setFRole] = useState('security');
  const [fPhone, setFPhone] = useState('');
  const [fNewPass, setFNewPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const showFlash = (msg: string, ok = true) => { setFlash({ msg, ok }); setTimeout(() => setFlash(null), 4000); };

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/users');
    const d = await res.json();
    setUsers(d.users || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openCreate = () => {
    setFEmail(''); setFPassword(''); setFName(''); setFRole('security'); setFPhone(''); setFormErr('');
    setEditTarget(null); setModalMode('create');
  };

  const openEdit = (u: AppUser) => {
    setFName(u.fullName || ''); setFRole(u.role || 'security'); setFPhone(u.phone || ''); setFormErr('');
    setEditTarget(u); setModalMode('edit');
  };

  const openPassword = (u: AppUser) => {
    setFNewPass(''); setFormErr('');
    setEditTarget(u); setModalMode('password');
  };

  const handleCreate = async () => {
    if (!fEmail || !fPassword || !fRole) { setFormErr('Email, password and role are required'); return; }
    setSaving(true); setFormErr('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fEmail, password: fPassword, fullName: fName || null, role: fRole, phone: fPhone || null }),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) { setFormErr(d.error || 'Failed'); return; }
    setModalMode(null);
    showFlash('User created successfully');
    refresh();
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true); setFormErr('');
    const res = await fetch(`/api/admin/users/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: fName || null, role: fRole, phone: fPhone || null }),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) { setFormErr(d.error || 'Failed'); return; }
    setModalMode(null);
    showFlash('User updated');
    refresh();
  };

  const handlePassword = async () => {
    if (!editTarget || !fNewPass) { setFormErr('New password required'); return; }
    if (fNewPass.length < 6) { setFormErr('Password must be at least 6 characters'); return; }
    setSaving(true); setFormErr('');
    const res = await fetch(`/api/admin/users/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: fNewPass }),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) { setFormErr(d.error || 'Failed'); return; }
    setModalMode(null);
    showFlash('Password updated');
  };

  const toggleBan = async (u: AppUser) => {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned: !u.banned }),
    });
    const d = await res.json();
    if (!d.success) { showFlash(d.error || 'Failed', false); return; }
    showFlash(u.banned ? 'User re-enabled' : 'User disabled');
    refresh();
  };

  const filtered = users.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return (u.email || '').toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q);
    }
    return true;
  });

  const InputStyle = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 13px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const };
  const LabelStyle = { display: 'block' as const, fontSize: 10, fontWeight: 800 as const, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: '#9ca3af', marginBottom: 5 };

  return (
    <AdminShell title="User Management">
      <div className="space-y-5">

        {/* Modal */}
        {modalMode && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440, padding: '24px 28px' }}>
              <div style={{ fontWeight: 900, fontSize: 17, color: '#062d2a', marginBottom: 20 }}>
                {modalMode === 'create' ? 'Create New User' : modalMode === 'password' ? 'Reset Password' : `Edit — ${editTarget?.email}`}
              </div>

              <div className="space-y-4">
                {modalMode === 'create' && (
                  <>
                    <div><label style={LabelStyle}>Email</label><input value={fEmail} onChange={e => setFEmail(e.target.value)} type="email" autoComplete="off" style={InputStyle} /></div>
                    <div><label style={LabelStyle}>Password</label><input value={fPassword} onChange={e => setFPassword(e.target.value)} type="password" autoComplete="new-password" style={InputStyle} /></div>
                  </>
                )}

                {modalMode !== 'password' && (
                  <>
                    <div><label style={LabelStyle}>Full Name</label><input value={fName} onChange={e => setFName(e.target.value)} style={InputStyle} /></div>
                    <div>
                      <label style={LabelStyle}>Role</label>
                      <select value={fRole} onChange={e => setFRole(e.target.value)} style={InputStyle}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <div><label style={LabelStyle}>Phone (optional)</label><input value={fPhone} onChange={e => setFPhone(e.target.value)} style={InputStyle} /></div>
                  </>
                )}

                {modalMode === 'password' && (
                  <div><label style={LabelStyle}>New Password</label><input value={fNewPass} onChange={e => setFNewPass(e.target.value)} type="password" autoComplete="new-password" style={InputStyle} /></div>
                )}
              </div>

              {formErr && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 12 }}>{formErr}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button onClick={() => setModalMode(null)} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button
                  onClick={modalMode === 'create' ? handleCreate : modalMode === 'password' ? handlePassword : handleEdit}
                  disabled={saving}
                  style={{ padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#062d2a', color: '#fff', fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving…' : modalMode === 'create' ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Flash */}
        {flash && (
          <div style={{ padding: '10px 18px', borderRadius: 12, fontWeight: 700, fontSize: 14, background: flash.ok ? '#dcfce7' : '#fee2e2', color: flash.ok ? '#166534' : '#991b1b' }}>
            {flash.msg}
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontWeight: 900, fontSize: 20, color: '#062d2a' }}>User Management</h2>
            <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>Create and manage all system logins and their access roles.</p>
          </div>
          <button onClick={openCreate} style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: '#062d2a', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            + Create User
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by name or email…"
            style={{ flex: 1, minWidth: 180, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit' }} />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit' }}>
            <option value="all">All roles</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No users match your filters.</div>
          ) : (
            <>
              <div style={{ padding: '11px 18px', borderBottom: '1px solid #f3f4f6', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
                {filtered.length} user{filtered.length !== 1 ? 's' : ''}
              </div>
              {filtered.map(u => (
                <div key={u.id} style={{ padding: '12px 18px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {/* Avatar */}
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: u.role ? (ROLE_COLORS[u.role] + '22') : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: u.role ? (ROLE_COLORS[u.role] || '#6b7280') : '#9ca3af', flexShrink: 0 }}>
                    {(u.fullName || u.email || '?').charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: u.banned ? '#9ca3af' : '#111' }}>
                      {u.fullName || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No name</span>}
                      {u.banned && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, background: '#fee2e2', color: '#991b1b', padding: '1px 7px', borderRadius: 99 }}>DISABLED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{u.email}</div>
                  </div>
                  <RoleBadge role={u.role} />
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(u)} style={{ padding: '5px 13px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>Edit</button>
                    <button onClick={() => openPassword(u)} style={{ padding: '5px 13px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>Password</button>
                    <button onClick={() => toggleBan(u)} style={{ padding: '5px 13px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: u.banned ? '#16a34a' : '#dc2626' }}>
                      {u.banned ? 'Enable' : 'Disable'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
