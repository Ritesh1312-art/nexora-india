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
    // My Orders is intentionally not a top-level navigation item.
    const orders = $('#ordersLink');
    if (orders) orders.hidden = true;
  }

  function setRoute(hash) {
    if (location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
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
      if (client) await client.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('Nexora logout:', e);
    }
    authenticated = false;
    window.session = null;
    window.sb = client;
    syncHeader();
    // Never retain the page that was open before logout.
    renderStore();
    navigating = false;
  }

  async function refreshSession() {
    if (!client) return;
    try {
      const result = await client.auth.getSession();
      const next = !!result.data.session;
      authenticated = next;
      window.session = result.data.session || null;
      window.sb = client;
      syncHeader();
      // Auth transitions always land on Store. This also removes any stale Login UI.
      if (next && AUTH_ROUTES.has(location.hash)) renderStore();
      if (!next && !location.hash) renderStore();
    } catch (e) {
      console.warn('Nexora session:', e);
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
    // Wait for the Supabase client exposed by the main app/auth scripts.
    for (let i = 0; i < 40 && !window.sb; i++) await new Promise(r => setTimeout(r, 50));
    client = window.sb || null;
    if (!client || !client.auth) {
      console.warn('Nexora customer router: Supabase client unavailable');
      return;
    }
    await refreshSession();
    syncHeader();

    client.auth.onAuthStateChange((_event, session) => {
      authenticated = !!session;
      window.session = session || null;
      window.sb = client;
      syncHeader();
      if (authenticated) renderStore();
      else renderStore();
    });

    // If an older auth script renders Login after login succeeds, remove that stale
    // auth screen on the next DOM mutation and return to Store.
    const observer = new MutationObserver(() => {
      if (authenticated && AUTH_ROUTES.has(location.hash)) renderStore();
    });
    if (app()) observer.observe(app(), { childList: true, subtree: true });

    // Canonical initial page: Store for both logged-in and logged-out customers.
    if (!location.hash || location.hash === '#') renderStore();
  }

  window.NexoraCustomerRouter = { renderStore, renderProducts, renderAccount, logout, refreshSession };
  boot();
})();
