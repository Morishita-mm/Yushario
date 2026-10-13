// Replay recorded events without connecting a PTY or sending agent input.
export function boot(url, sessions, towns) {
  window.__pvBase = 1800000000000; window.__pvMs = 0; window.__pvMotion = 43000;
  Date.now = () => __pvBase + __pvMs;
  Object.defineProperty(performance, 'now', { value: () => __pvMotion });
  const queue = [];
  window.requestAnimationFrame = fn => { queue.push(fn); return queue.length; };
  window.__pvTick = () => { for (const fn of queue.splice(0)) fn(__pvMotion); };
  localStorage.setItem('agent-character-status-size', 'small');
  window.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    constructor(address) {
      if (address.includes('/pty')) throw Error('PV: PTY disabled');
      setTimeout(() => this.onopen?.(), 0);
    }
    set onmessage(fn) { window.__pvDeliver = data => fn({ data: JSON.stringify(data) }); }
    send() { throw Error('PV: input disabled'); }
    close() {}
  };
  const nativeFetch = fetch.bind(window);
  window.fetch = (resource, options) => {
    const address = new URL(typeof resource === 'string' ? resource : resource.url, url);
    if (options?.method && options.method !== 'GET') throw Error('PV: writes disabled');
    if (address.pathname === '/api/sessions') return Promise.resolve(Response.json(sessions));
    if (address.pathname === '/api/names') return Promise.resolve(Response.json({}));
    if (address.pathname === '/api/towns') return Promise.resolve(Response.json(towns));
    if (address.pathname === '/api/settings') return Promise.resolve(Response.json({ archiveAfterDays: 30, startupCwd: '/demo/tiny-quest' }));
    if (address.pathname.startsWith('/api/')) address.searchParams.set('token', new URL(url).searchParams.get('token'));
    return nativeFetch(address, options);
  };
}
