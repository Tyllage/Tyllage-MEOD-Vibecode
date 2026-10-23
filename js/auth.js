/* Demo session handling.
 *
 * WARNING: this is client-side only. Anyone can edit sessionStorage and
 * become "admin". It exists to demo role-based screens. Real sign-in must
 * happen on a server (hashed passwords, httpOnly cookies, server-side RBAC)
 * before any real customer data is connected — see SECURITY.md.
 */
(function () {
  'use strict';
  var M = window.MEOD;
  var KEY = 'meod-session';

  var ROLE_HOME = { admin: 'staff', staff: 'staff', leader: 'leader', customer: 'customer' };

  function current() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  function signIn(email, password) {
    email = String(email || '').trim().toLowerCase();
    var user = M.state.users.filter(function (u) { return u.email === email; })[0];
    if (!user || password !== M.DEMO_PASSWORD) return { ok: false, error: 'Email or password is incorrect.' };
    if (user.disabled) return { ok: false, error: 'This account has been disabled. Contact MEOD admin.' };
    var session = {
      email: user.email, name: user.name, role: user.role,
      customerId: user.customerId || null, leaderId: user.leaderId || null,
      at: new Date().toISOString()
    };
    sessionStorage.setItem(KEY, JSON.stringify(session));
    M.audit(user.email, 'auth.sign_in', user.role);
    M.save();
    return { ok: true, session: session };
  }

  function signOut() {
    var s = current();
    if (s) { M.audit(s.email, 'auth.sign_out', s.role); M.save(); }
    sessionStorage.removeItem(KEY);
  }

  function can(session, permission) {
    var matrix = {
      admin: ['inventory', 'orders', 'orders.update', 'inbox', 'campaigns', 'campaigns.approve', 'groupbuy', 'groupbuy.manage', 'customers', 'customers.pii', 'users', 'audit', 'settings', 'clearance', 'clearance.minprice', 'harvest', 'visits'],
      staff: ['inventory', 'orders', 'orders.update', 'inbox', 'campaigns', 'groupbuy', 'customers', 'clearance', 'harvest', 'visits'],
      leader: ['leader'],
      customer: ['customer']
    };
    return Boolean(session && (matrix[session.role] || []).indexOf(permission) > -1);
  }

  M.auth = { current: current, signIn: signIn, signOut: signOut, can: can, ROLE_HOME: ROLE_HOME };
})();
