(() => {
  const app = new URL(globalThis.SC_CODE_PUBLIC.appUrl);
  const marker = 'sc_code_public';
  const page = 'scp_page';
  const initial = new URL(window.location.href);
  const original = ['sc_code_kind', 'sc_code_invite', 'sc_code_event']
    .map(key => [key, initial.searchParams.get(key)])
    .filter(([, value]) => value !== null);

  function read(path) {
    const url = new URL(path, app);
    if (url.origin !== app.origin || url.pathname !== app.pathname || !url.searchParams.has(marker)) return path;
    const virtual = url.searchParams.get(page) || '/';
    if (!virtual.startsWith('/') || virtual.startsWith('//')) return '/';
    const route = new URL(virtual, app.origin);
    for (const [key, value] of original) route.searchParams.set(key, value);
    return route.pathname + route.search + route.hash;
  }

  for (const method of ['pushState', 'replaceState']) {
    const originalMethod = history[method].bind(history);
    history[method] = (state, unused, path) => {
      if (path == null) return originalMethod(state, unused, path);
      const next = new URL(path, app.origin);
      if (next.origin !== app.origin) return originalMethod(state, unused, path);
      const url = new URL(app);
      const virtual = new URL(read(next.href), app.origin);
      for (const [key] of original) virtual.searchParams.delete(key);
      url.searchParams.set(page, virtual.pathname + virtual.search + virtual.hash);
      return originalMethod(state, unused, url);
    };
  }
  globalThis.SC_CODE_PUBLIC_ROUTER = { read };
})();
