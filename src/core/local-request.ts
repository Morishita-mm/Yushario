// The relay binds IPv4 loopback only. Use its actual port, not its preferred port.
export function allowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}
