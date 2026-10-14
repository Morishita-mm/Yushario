import { previewOutput } from "../core/preview";
import type { Session } from "./pty-session";

const tails = new WeakMap<Session, string>();
// Run next to retained-output updates, not in the browser or on a second PTY reader.
export function capturePreviewUrls(session: Session, data: string, port: number): void {
  const result = previewOutput(tails.get(session) ?? "", data, port);
  session.info.previewUrls = [...new Set([...(session.info.previewUrls ?? []), ...result.urls])].slice(-20);
  tails.set(session, result.tail);
}
