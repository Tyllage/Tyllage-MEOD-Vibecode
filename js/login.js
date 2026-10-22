(function () {
  'use strict';
  var M = window.MEOD;
  var form = document.getElementById('login-form');
  var errorBox = document.querySelector('[data-login-error]');
  var pitch = document.querySelector('[data-role-pitch]');
  var grid = document.querySelector('[data-demo-grid]');

  // Leader invite links carry ?code=… — hold it until the customer signs in.
  var code = new URLSearchParams(location.search).get('code');
  if (code) { try { sessionStorage.setItem('meod-join-code', code.slice(0, 24)); } catch (e) { /* ignore */ } }

  // Buy to Clear's bag card carries ?bagSize=&bagExclude= — hold it until the Shop pre-selects it.
  var qs = new URLSearchParams(location.search);
  var bagSize = qs.get('bagSize'), bagExclude = qs.get('bagExclude');
  if (bagSize) {
    try {
      sessionStorage.setItem('meod-bag-size', bagSize.slice(0, 20));
      if (bagExclude) sessionStorage.setItem('meod-bag-exclude', bagExclude.slice(0, 20));
    } catch (e) { /* ignore */ }
  }

  if (M.auth.current()) { location.replace('dashboard.html'); return; }

  var PITCH = {
    customer: ['Track your orders and deliveries', 'Join a group buy with a leader\'s code', 'Picks based on what you\'ve bought before', 'Choose what messages you get'],
    leader: ['Share your group code and link', 'See your group\'s orders, with members\' details kept private', 'Commission worked out for you, refunds included', 'No more Excel settlements'],
    staff: ['Stock, orders and sync status in one view', 'Inbox for tickets and farm bookings', 'Campaign Studio, with approval before anything sends', 'Group-buy settlement and audit log']
  };
  var ACCOUNTS = {
    customer: [['customer@meod.test', 'Customer', 'Aster Lim']],
    leader: [['leader@meod.test', 'Group leader', 'Punggol'], ['leader2@meod.test', 'Group leader', 'Bukit Batok']],
    staff: [['admin@meod.test', 'Admin', 'Full access'], ['sales@meod.test', 'Sales staff', 'No approvals']]
  };

  function selectRole(role) {
    document.querySelectorAll('[data-role-tab]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-role-tab') === role));
    });
    pitch.textContent = '';
    PITCH[role].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; pitch.appendChild(li); });
    grid.textContent = '';
    ACCOUNTS[role].forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<strong></strong><span></span>';
      b.querySelector('strong').textContent = a[1];
      b.querySelector('span').textContent = a[2];
      b.addEventListener('click', function () { go(a[0], M.DEMO_PASSWORD); });
      grid.appendChild(b);
    });
    form.email.value = ACCOUNTS[role][0][0];
    form.password.value = '';
  }

  function go(email, password) {
    var r = M.auth.signIn(email, password);
    if (!r.ok) { errorBox.textContent = r.error; errorBox.hidden = false; return; }
    location.href = 'dashboard.html';
  }

  document.querySelectorAll('[data-role-tab]').forEach(function (b) {
    b.addEventListener('click', function () { selectRole(b.getAttribute('data-role-tab')); });
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); go(form.email.value, form.password.value); });

  var wanted = new URLSearchParams(location.search).get('role');
  selectRole(PITCH[wanted] ? wanted : 'customer');
})();
