// ══════════════════════════════
//  CONFIG SUPABASE PARTAGÉE
// ══════════════════════════════
const SUPABASE_URL = 'https://tpyjpobheliuqkkriuod.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wCTVTGyYstnDSLmJh-lFjA_ORruAhnm'

// Client initialisé une seule fois, lazily
let _sb = null
function getSb() {
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  return _sb
}

// ══════════════════════════════
//  VÉRIFICATION SESSION + RÔLE
// ══════════════════════════════
async function requireRole(expectedRole, callbacks = {}) {
  const sb = getSb()
  const { data: { session }, error } = await sb.auth.getSession()

  // Pas connecté → auth
  if (!session || error) {
    window.location.href = 'auth.html'
    return
  }

  const user = session.user
  const role = user.user_metadata?.role || 'student'

  // Mauvais rôle → bon dashboard
  if (role !== expectedRole) {
    if (role === 'admin')        window.location.href = 'dashboard-admin.html'
    else if (role === 'teacher') window.location.href = 'dashboard-teacher.html'
    else                         window.location.href = 'dashboard-student.html'
    return
  }

  // Infos utilisateur
  const fullName  = user.user_metadata?.full_name
                 || `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim()
                 || user.email.split('@')[0]
  const firstName = user.user_metadata?.first_name || fullName.split(' ')[0] || 'Utilisateur'
  const initials  = fullName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??'

  // Remplir les éléments communs
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }
  setEl('user-name',   fullName)
  setEl('user-email',  user.email)
  setEl('user-avatar', initials)
  setEl('welcome-msg', `Bonjour, ${firstName} 👋`)

  // Callback après auth réussie
  if (callbacks.onSuccess) callbacks.onSuccess({ user, role, fullName, firstName, initials })
}

// ══════════════════════════════
//  DÉCONNEXION
// ══════════════════════════════
async function handleLogout() {
  await getSb().auth.signOut()
  window.location.href = 'auth.html'
}