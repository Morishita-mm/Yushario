import { timingSafeEqual } from "node:crypto";
import { agentTokenBytes } from "../core/party";
import type { Session, TerminalSession } from "./pty-session";

// No terminal header/body is needed: the credential itself identifies its PTY.
export function authenticatedHookSession(authorization: string | undefined, sessions: Iterable<Session>): TerminalSession | undefined {
  const supplied = agentTokenBytes(authorization?.replace(/^Bearer /, ""));
  if (!supplied) return;
  for (const session of sessions) {
    const expected = agentTokenBytes(session.agentToken);
    const matches = expected && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
    if (matches && !session.ended && !session.departing && !session.info.exited) return session.info;
  }
}
