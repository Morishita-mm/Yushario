(() => {
  if (!window.opener) return;
  let target;
  try { target = new URL(document.currentScript.src).origin; } catch { return; }
  const errors = [];
  let count = 0, pending = false;
  const text = (value) => {
    try { return String(value instanceof Error ? value.stack || value.message : value).slice(0, 500); }
    catch { return "[unreadable error]"; }
  };
  const send = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      try {
        if (window.opener) window.opener.postMessage({ type: "yushario-preview", url: location.href.slice(0, 4096),
          title: document.title.slice(0, 200), errors: errors.slice(0, 20), count }, target);
      } catch { /* A closed opener is not a page error. */ }
    }, 0);
  };
  const record = (error) => {
    count = Math.min(count + 1, 1000000);
    if (errors.length < 20) errors.push(text(error));
    send();
  };
  window.addEventListener("error", (event) => record(`${event.message || "Page error"}${event.filename ? ` — ${event.filename}:${event.lineno}:${event.colno}` : ""}`));
  window.addEventListener("unhandledrejection", (event) => record(event.reason));
  const original = console.error;
  console.error = function (...args) {
    record(args.slice(0, 10).map(text).join(" ").slice(0, 500));
    return original.apply(this, args);
  };
  for (const event of ["load", "pageshow", "hashchange", "popstate"]) window.addEventListener(event, send);
  send();
})();
