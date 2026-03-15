// ══════════════════════════════════════════════
//  BIBLIOTECH — db.js
//  Config Supabase + helpers DB + protection routes
// ══════════════════════════════════════════════

const SUPABASE_URL = 'https://tpyjpobheliuqkkriuod.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wCTVTGyYstnDSLmJh-lFjA_ORruAhnm'

let _sb = null
function getSb() {
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  return _sb
}

// ══════════════════════════════════════════════
//  AUTH — SESSION & PROTECTION ROUTE
// ══════════════════════════════════════════════

/**
 * Vérifie la session et le rôle.
 * allowedRoles: tableau ex. ['admin'] ou ['admin','teacher','student']
 * Redirige si non connecté ou mauvais rôle.
 * Retourne { user, member } si OK.
 */
async function requireAuth(allowedRoles = ['admin', 'teacher', 'student']) {
  const sb = getSb()
  const { data: { session }, error } = await sb.auth.getSession()

  if (!session || error) {
    window.location.href = 'auth.html'
    return null
  }

  const user = session.user

  // Récupérer le membre depuis la table members
  const { data: member, error: memberErr } = await sb
    .from('members')
    .select('*')
    .eq('id', user.id)
    .single()

  if (memberErr || !member) {
    // Membre introuvable → déconnexion
    await sb.auth.signOut()
    window.location.href = 'auth.html'
    return null
  }

  // Vérifier le rôle
  if (!allowedRoles.includes(member.role)) {
    // Rediriger vers le bon dashboard
    if (member.role === 'admin')        window.location.href = 'dashboard-admin.html'
    else if (member.role === 'teacher') window.location.href = 'dashboard-teacher.html'
    else                                window.location.href = 'dashboard-student.html'
    return null
  }

  return { user, member }
}

/**
 * Remplit les éléments communs du sidebar avec les infos du membre.
 */
function fillUserUI(member) {
  const fullName = `${member.first_name} ${member.last_name}`.trim() || member.email
  const initials = fullName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }
  setEl('user-name',   fullName)
  setEl('user-email',  member.email)
  setEl('user-avatar', initials)
  setEl('welcome-msg', `Bonjour, ${member.first_name || fullName.split(' ')[0]} 👋`)
  setEl('today-date',  new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }))
}

async function handleLogout() {
  await getSb().auth.signOut()
  window.location.href = 'auth.html'
}

// ══════════════════════════════════════════════
//  BOOKS
// ══════════════════════════════════════════════

async function getBooks() {
  const { data, error } = await getSb()
    .from('books')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('getBooks:', error); return [] }
  return data
}

async function addBook({ title, author, status = 'available' }) {
  const { data, error } = await getSb()
    .from('books')
    .insert([{ title, author, status }])
    .select()
    .single()
  if (error) throw error
  return data
}

async function updateBook(id, fields) {
  const { data, error } = await getSb()
    .from('books')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

async function deleteBook(id) {
  const { error } = await getSb().from('books').delete().eq('id', id)
  if (error) throw error
}

// ══════════════════════════════════════════════
//  MEMBERS
// ══════════════════════════════════════════════

async function getMembers() {
  const { data, error } = await getSb()
    .from('members')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('getMembers:', error); return [] }
  return data
}

async function updateMember(id, fields) {
  const { data, error } = await getSb()
    .from('members')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

async function deleteMember(id) {
  const { error } = await getSb().from('members').delete().eq('id', id)
  if (error) throw error
}

// ══════════════════════════════════════════════
//  BORROWINGS
// ══════════════════════════════════════════════

async function getBorrowings() {
  const { data, error } = await getSb()
    .from('borrowings')
    .select(`
      *,
      books ( id, title, author ),
      members ( id, first_name, last_name, email, role )
    `)
    .order('created_at', { ascending: false })
  if (error) { console.error('getBorrowings:', error); return [] }
  return data
}

async function getMyBorrowings(memberId) {
  const { data, error } = await getSb()
    .from('borrowings')
    .select(`*, books ( id, title, author )`)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
  if (error) { console.error('getMyBorrowings:', error); return [] }
  return data
}

async function addBorrowing({ bookId, memberId, borrowDate }) {
  const sb = getSb()

  // 1. Vérifier la limite du membre
  const { data: member } = await sb.from('members').select('*').eq('id', memberId).single()
  const max = member.role === 'teacher' ? 10 : 3
  if (member.borrowed_count >= max) {
    throw new Error(`Limite atteinte : ${member.first_name} ne peut pas emprunter plus de ${max} livres.`)
  }

  // 2. Créer l'emprunt
  const { data: borrowing, error } = await sb
    .from('borrowings')
    .insert([{ book_id: bookId, member_id: memberId, borrow_date: borrowDate, status: 'active' }])
    .select()
    .single()
  if (error) throw error

  // 3. Mettre à jour le statut du livre
  await sb.from('books').update({ status: 'borrowed' }).eq('id', bookId)

  // 4. Incrémenter borrowed_count du membre
  await sb.from('members').update({ borrowed_count: member.borrowed_count + 1 }).eq('id', memberId)

  return borrowing
}

async function returnBorrowing(borrowingId) {
  const sb = getSb()

  // 1. Récupérer l'emprunt
  const { data: borrowing } = await sb
    .from('borrowings').select('*').eq('id', borrowingId).single()

  // 2. Marquer comme retourné
  await sb.from('borrowings')
    .update({ status: 'returned', return_date: new Date().toISOString().split('T')[0] })
    .eq('id', borrowingId)

  // 3. Remettre le livre disponible
  await sb.from('books').update({ status: 'available' }).eq('id', borrowing.book_id)

  // 4. Décrémenter borrowed_count
  const { data: member } = await sb.from('members').select('*').eq('id', borrowing.member_id).single()
  await sb.from('members')
    .update({ borrowed_count: Math.max(0, member.borrowed_count - 1) })
    .eq('id', borrowing.member_id)
}

// ══════════════════════════════════════════════
//  TOAST UTILITAIRE
// ══════════════════════════════════════════════
function toast(msg, type = 'info') {
  let c = document.getElementById('toasts')
  if (!c) {
    c = document.createElement('div')
    c.id = 'toasts'
    c.className = 'toasts'
    document.body.appendChild(c)
  }
  const t = document.createElement('div')
  t.className = `toast ${type}`
  t.textContent = msg
  c.appendChild(t)
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = '.3s'
    setTimeout(() => t.remove(), 300)
  }, 3500)
}