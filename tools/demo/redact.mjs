// Shared by event/PTY recorders; only demo material, never user CLI history.
export function redact(value) {
  if (typeof value === 'string') return value
    .replaceAll(/(?:\/private)?\/tmp\/agent-quest-demo\.[A-Za-z0-9_-]+/g, '/demo')
    .replaceAll(/(?:\/private)?\/tmp\/claude-[^\s"'<>`\x1b]+/g, '/demo/claude-task.output')
    .replaceAll(/\/Users\/[^\s"'<>`\x1b]+|\/home\/[^\s"'<>`\x1b]+/g, '/demo/user')
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'demo@example.invalid');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
}
