/* Nexora-India FINAL CUSTOMER ROUTER
   Single authority for customer navigation. Loaded last on purpose. */
(function () {
  'use strict';
  let client = null;
  let authenticated = false;
  let navigating = false;
  const AUTH_ROUTES = new Set(['#/login', '#/register', '#/forgot']);
  const $ = (s) => document.querySelector(s);
  const app = () => $('#app');

  function syncHeader() {
    const login = $('#loginLink'), account = $('#accountLink'), cart = $('#cartNav'), logout = $('#logoutBtn'), orders = $('#ordersLink');
    if (login) login.hidden = authenticated;
    if (account) account.hidden = !authenticated;
    if (cart) cart.hidden = !authenticated;
    if (logout) logout.hidden = !authenticated;
    if (orders) orders.hidden = true;
  }

  function setRoute(hash) {
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function renderStore() {
    setRoute('#/');
    if (typeof window.renderHome === 'function') window.renderHome();
    else if (typeof window.route === 'function') window.route();
  }

  function renderProducts() {
    setRoute('#/products');
    if (typeof window.renderProducts === 'function') window.renderProducts();
    else if (typeof window.route === 'function') window.route();
  }

  function renderAccount() {
    if (!authenticated) return renderLogin();
    setRoute('#/account');
    // Account.js owns the account route. Do not depend on a global renderAccount export.
    if (typeof window.route === 'function') window.route();
  }

  function renderLogin() {
    if (typeof window.renderLogin === 'function') window.renderLogin();
    else if (typeof window.route === 'function') window.route();
  }

  function renderCurrent() {
    const h = location.hash || '#/';
    if (authenticated && AUTH_ROUTES.has(h)) return renderStore();
    if (!authenticated && (h === '#/account' || h === '#/checkout')) return renderLogin();
    if (h === '#/') return renderStore();
    if (h === '#/products') return renderProducts();
    if (h === '#/account') return renderAccount();
    if (typeof window.route === 'function') window.route();
  }

  async function logout() {
    navigating = true;
    try { if (client) await client.auth.signOut({ scope: 'local' }); }
    catch (e) { console.warn('Nexora logout:', e); }
    authenticated = false;
    window.session = null;
    window.sb = client;
    syncHeader();
    // Logout always has one destination: Store.
    renderStore();
    navigating = false;
  }

  async function refreshSession() {
    if (!client) return;
    try {
      const result = await client.auth.getSession();
      authenticated = !!result.data.session;
      window.session = result.data.session || null;
      window.sb = client;
      syncHeader();
      if (authenticated && AUTH_ROUTES.has(location.hash)) renderStore();
      if (!location.hash || location.hash === '#') renderStore();
    } catch (e) { console.warn('Nexora session:', e); }
  }

  function headerTarget(el) {
    if (!el || !el.closest('.topbar')) return null;
    if (el.id === 'logoutBtn') return 'logout';
    if (el.id === 'accountLink' || (el.textContent || '').trim().toLowerCase() === 'account') return 'account';
    const href = (el.getAttribute('href') || '').split('?')[0];
    const text = (el.textContent || '').trim().toLowerCase();
    if (href === '#/' || text === 'store') return 'store';
    if (href === '#/products' || text === 'products') return 'products';
    if (el.id === 'cartNav' || href === '#/cart') return 'cart';
    if (el.id === 'loginLink') return 'login';
    return null;
  }

  document.addEventListener('click', async (event) => {
    const el = event.target.closest('a,button'), target = headerTarget(el);
    if (!target) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    if (target === 'store') return renderStore();
    if (target === 'products') return renderProducts();
    if (target === 'account') return renderAccount();
    if (target === 'logout') return logout();
    if (target === 'login') return authenticated ? renderStore() : renderLogin();
    if (target === 'cart') {
      if (!authenticated) return renderLogin();
      setRoute('#/cart');
      if (typeof window.route === 'function') window.route();
    }
  }, true);

  window.addEventListener('hashchange', () => { if (!navigating) renderCurrent(); });

  async function boot() {
    for (let i = 0; i < 40 && !window.sb; i++) await new Promise(r => setTimeout(r, 50));
    client = window.sb || null;
    if (!client?.auth) { console.warn('Nexora customer router: Supabase client unavailable'); return; }
    await refreshSession();
    syncHeader();
    client.auth.onAuthStateChange((_event, session) => {
      authenticated = !!session;
      window.session = session || null;
      window.sb = client;
      syncHeader();
      // Every authentication transition has Store as the visible destination.
      renderStore();
    });
    const observer = new MutationObserver(() => {
      if (authenticated && AUTH_ROUTES.has(location.hash)) renderStore();
    });
    if (app()) observer.observe(app(), { childList: true, subtree: true });
    if (!location.hash || location.hash === '#') renderStore();
  }

  window.NexoraCustomerRouter = { renderStore, renderProducts, renderAccount, logout, refreshSession };
  boot();
})();
