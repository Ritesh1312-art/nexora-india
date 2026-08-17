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
    const login = $('#loginLink');
    const account = $('#accountLink');
    const cart = $('#cartNav');
    const logout = $('#logoutBtn');
    if (login) login.hidden = authenticated;
    if (account) account.hidden = !authenticated;
    if (cart) cart.hidden = !authenticated;
    if (logout) logout.hidden = !authenticated;
    const orders = $('#ordersLink');
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

  async function renderAccount() {
    if (!authenticated) return renderLogin();
    setRoute('#/account');
    if (typeof window.renderAccount === 'function') await window.renderAccount();
    else if (typeof window.route === 'function') window.route();
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
    try {
      if (client && client.auth) await client.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('Nexora logout:', e);
    }
    authenticated = false;
    window.session = null;
    if (client) window.sb = client;
    syncHeader();
    renderStore();
    navigating = false;
  }

  async function refreshSession() {
    /* IMPORTANT: app.js/auth-rescue may already have a valid session before this
       router finishes booting. Never let a stale getSession race overwrite it. */
    if (window.session) authenticated = true;
    syncHeader();

    if (!client || !client.auth) return;
    try {
      const result = await client.auth.getSession();
      const session = result?.data?.session || window.session || null;
      authenticated = !!session;
      window.session = session;
      window.sb = client;
      syncHeader();
      if (authenticated && AUTH_ROUTES.has(location.hash)) renderStore();
      if (!authenticated && (!location.hash || location.hash === '#')) renderStore();
    } catch (e) {
      /* If getSession temporarily races during boot, preserve the already-known
         authenticated state instead of rendering a Login screen over the Store. */
      authenticated = !!window.session;
      syncHeader();
      if (authenticated && AUTH_ROUTES.has(location.hash)) renderStore();
    }
  }

  function headerTarget(el) {
    if (!el || !el.closest('.topbar')) return null;
    if (el.id === 'logoutBtn') return 'logout';
    if (el.id === 'accountLink' || (el.textContent || '').trim().toLowerCase() === 'account') return 'account';
    const href = (el.getAttribute('href') || '').split('?')[0];
    if (href === '#/' || (el.textContent || '').trim().toLowerCase() === 'store') return 'store';
    if (href === '#/products' || (el.textContent || '').trim().toLowerCase() === 'products') return 'products';
    if (el.id === 'cartNav' || href === '#/cart') return 'cart';
    if (el.id === 'loginLink') return 'login';
    return null;
  }

  document.addEventListener('click', async (event) => {
    const el = event.target.closest('a,button');
    const target = headerTarget(el);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();

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

  window.addEventListener('hashchange', () => {
    if (navigating) return;
    renderCurrent();
  });

  async function boot() {
    /* First trust the session already established by the earlier auth layer. */
    authenticated = !!window.session;
    syncHeader();

    /* Wait for the main app's Supabase client, but do not wait forever. */
    for (let i = 0; i < 100 && !window.sb; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    client = window.sb || null;

    await refreshSession();
    syncHeader();

    if (client && client.auth) {
      client.auth.onAuthStateChange((_event, session) => {
        authenticated = !!session;
        window.session = session || null;
        window.sb = client;
        syncHeader();
        /* Every login/logout transition has exactly one canonical destination. */
        renderStore();
      });
    }

    /* Kill stale Login/Register/Forgot DOM if authentication has already succeeded. */
    const observer = new MutationObserver(() => {
      if (window.session) {
        authenticated = true;
        syncHeader();
        if (AUTH_ROUTES.has(location.hash)) renderStore();
      }
    });
    if (app()) observer.observe(app(), { childList: true, subtree: true });

    /* Canonical initial page: Store for both logged-in and logged-out customers. */
    if (!location.hash || location.hash === '#') renderStore();
    else if (authenticated && AUTH_ROUTES.has(location.hash)) renderStore();
  }

  window.NexoraCustomerRouter = { renderStore, renderProducts, renderAccount, logout, refreshSession };
  boot();
})();
