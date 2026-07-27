import { useEffect, useState } from 'react'
import {
  listAllUsers,
  listAllOrganisations,
  listAllInvites,
  createOrganisation,
  assignUserToOrganisation,
  changeUserRole,
  createInvite,
  deleteInvite,
} from '../api/client'

const ROLES = ['owner', 'developer', 'admin', 'user']
// Owner/developer are org-less by data-model convention (see the User table
// docs) and have no signup path through invites — they're bootstrapped via
// OWNER_EMAILS/DEVELOPER_EMAILS or promoted from an existing row instead.
// Invites are only for the org-bound roles.
const INVITABLE_ROLES = ['admin', 'user']

const NEW_ORG_DEFAULTS = { name: '', subscription_tier: 'standard', seats_allowed: '', is_demo: false, trial_days: '' }
const NEW_INVITE_DEFAULTS = { email: '', role: 'user', organisation_id: '' }

export default function OwnerDashboard({ onBack }) {
  const [users, setUsers] = useState([])
  const [organisations, setOrganisations] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newOrg, setNewOrg] = useState(NEW_ORG_DEFAULTS)
  const [savingUserId, setSavingUserId] = useState(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newInvite, setNewInvite] = useState(NEW_INVITE_DEFAULTS)
  const [savingInvite, setSavingInvite] = useState(false)

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [usersData, orgsData, invitesData] = await Promise.all([
        listAllUsers(),
        listAllOrganisations(),
        listAllInvites(),
      ])
      setUsers(usersData)
      setOrganisations(orgsData)
      setInvites(invitesData)
    } catch {
      setError('Could not load owner data. Are you signed in as an owner?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreateOrg(e) {
    e.preventDefault()
    if (!newOrg.name.trim()) return
    setError('')
    try {
      await createOrganisation({
        name: newOrg.name.trim(),
        subscription_tier: newOrg.subscription_tier,
        seats_allowed: newOrg.seats_allowed === '' ? null : Number(newOrg.seats_allowed),
        is_demo: newOrg.is_demo,
        trial_days: newOrg.trial_days === '' ? null : Number(newOrg.trial_days),
      })
      setNewOrg(NEW_ORG_DEFAULTS)
      await refresh()
    } catch {
      setError('Could not create the organisation.')
    }
  }

  async function handleAssignOrg(userId, orgIdRaw) {
    const orgId = Number(orgIdRaw)
    if (!orgId) return
    setSavingUserId(userId)
    setError('')
    try {
      await assignUserToOrganisation(userId, orgId)
      await refresh()
    } catch {
      setError('Could not assign that user to the organisation.')
    } finally {
      setSavingUserId(null)
    }
  }

  async function handleChangeRole(userId, role) {
    setSavingUserId(userId)
    setError('')
    try {
      await changeUserRole(userId, role)
      await refresh()
    } catch {
      setError('Could not change that user’s role.')
    } finally {
      setSavingUserId(null)
    }
  }

  async function handleAddUser(e) {
    e.preventDefault()
    const email = newInvite.email.trim()
    if (!email || !newInvite.organisation_id) return
    setSavingInvite(true)
    setError('')
    try {
      await createInvite(email, newInvite.role, Number(newInvite.organisation_id))
      setNewInvite(NEW_INVITE_DEFAULTS)
      setShowAddUser(false)
      await refresh()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not invite that user.')
    } finally {
      setSavingInvite(false)
    }
  }

  async function handleCancelInvite(inviteId) {
    setError('')
    try {
      await deleteInvite(inviteId)
      await refresh()
    } catch {
      setError('Could not cancel that invite.')
    }
  }

  return (
    <div className="owner-screen">
      <div className="owner-back">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Back to board
        </button>
      </div>

      <h1 className="owner-title">Owner dashboard</h1>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <section className="owner-section">
            <h2>Organisations</h2>
            <div className="owner-table-wrap">
              <table className="owner-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Tier</th>
                    <th>Demo?</th>
                    <th>Trial days</th>
                    <th>Seats</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {organisations.map((org) => (
                    <tr key={org.id}>
                      <td>{org.name}</td>
                      <td>{org.subscription_tier}</td>
                      <td>{org.is_demo ? 'Yes' : 'No'}</td>
                      <td>{org.trial_days ?? '—'}</td>
                      <td>{org.seats_allowed ?? 'Unlimited'}</td>
                      <td>{org.user_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form className="owner-new-org" onSubmit={handleCreateOrg}>
              <input
                type="text"
                placeholder="New organisation name"
                value={newOrg.name}
                onChange={(e) => setNewOrg((o) => ({ ...o, name: e.target.value }))}
              />
              <select
                value={newOrg.subscription_tier}
                onChange={(e) => setNewOrg((o) => ({ ...o, subscription_tier: e.target.value }))}
              >
                <option value="trial">trial</option>
                <option value="standard">standard</option>
                <option value="premium">premium</option>
              </select>
              <input
                type="number"
                min="0"
                placeholder="Seats (blank = unlimited)"
                value={newOrg.seats_allowed}
                onChange={(e) => setNewOrg((o) => ({ ...o, seats_allowed: e.target.value }))}
              />
              <label className="owner-checkbox">
                <input
                  type="checkbox"
                  checked={newOrg.is_demo}
                  onChange={(e) => setNewOrg((o) => ({ ...o, is_demo: e.target.checked }))}
                />
                Demo org
              </label>
              {newOrg.is_demo && (
                <input
                  type="number"
                  min="0"
                  placeholder="Trial days"
                  value={newOrg.trial_days}
                  onChange={(e) => setNewOrg((o) => ({ ...o, trial_days: e.target.value }))}
                />
              )}
              <button type="submit" className="btn btn-primary">
                Create organisation
              </button>
            </form>
          </section>

          <section className="owner-section">
            <div className="owner-section-header">
              <h2>Users ({users.length})</h2>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddUser((s) => !s)}>
                {showAddUser ? 'Cancel' : 'Add user'}
              </button>
            </div>

            {showAddUser && (
              <form className="owner-new-org" onSubmit={handleAddUser}>
                <input
                  type="email"
                  placeholder="Email"
                  value={newInvite.email}
                  onChange={(e) => setNewInvite((i) => ({ ...i, email: e.target.value }))}
                  required
                />
                <select
                  value={newInvite.role}
                  onChange={(e) => setNewInvite((i) => ({ ...i, role: e.target.value }))}
                >
                  {INVITABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <select
                  value={newInvite.organisation_id}
                  onChange={(e) => setNewInvite((i) => ({ ...i, organisation_id: e.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Organisation…
                  </option>
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary" disabled={savingInvite}>
                  {savingInvite ? 'Inviting…' : 'Send invite'}
                </button>
              </form>
            )}

            {invites.length > 0 && (
              <div className="owner-table-wrap owner-invites-wrap">
                <table className="owner-table">
                  <thead>
                    <tr>
                      <th>Pending invite</th>
                      <th>Role</th>
                      <th>Organisation</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite) => (
                      <tr key={invite.id}>
                        <td>{invite.email}</td>
                        <td>{invite.role}</td>
                        <td>{invite.organisation_name}</td>
                        <td>{invite.created_at.slice(0, 10)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-danger"
                            onClick={() => handleCancelInvite(invite.id)}
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="owner-table-wrap">
              <table className="owner-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Organisation</th>
                    <th>Trial</th>
                    <th>Usage events</th>
                    <th>Data deleted</th>
                    <th>Assign to org</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>
                        <select
                          value={u.role}
                          disabled={savingUserId === u.id}
                          onChange={(e) => handleChangeRole(u.id, e.target.value)}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{u.organisation_name ?? '—'}</td>
                      <td>
                        {u.trial_expires_at
                          ? `${u.days_remaining ?? 0}d left`
                          : u.role === 'owner' || u.role === 'developer'
                            ? '—'
                            : 'no trial'}
                      </td>
                      <td>{u.usage_event_count}</td>
                      <td>{u.data_deleted ? 'Yes' : 'No'}</td>
                      <td>
                        {u.role === 'owner' || u.role === 'developer' ? (
                          '—'
                        ) : (
                          <select
                            defaultValue=""
                            disabled={savingUserId === u.id}
                            onChange={(e) => handleAssignOrg(u.id, e.target.value)}
                          >
                            <option value="" disabled>
                              Move to…
                            </option>
                            {organisations
                              .filter((org) => org.id !== u.organisation_id)
                              .map((org) => (
                                <option key={org.id} value={org.id}>
                                  {org.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
