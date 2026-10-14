import { serverLanguage, tr } from "./language";
import { equipmentCommands, equipmentInput, type AgentEquipment, type Equipment } from "../core/equipment";
import { AGENTS } from "./agents";
import { deliver, pending } from "./pty-actions";
import type { EquippedMessage, PendingMessage, Session } from "./pty-session";

export function requestEquipment(session: Session, input: unknown, master: AgentEquipment,
  changed: (message: PendingMessage) => void, equipped: (message: EquippedMessage) => void): boolean {
  const agent = AGENTS[session.info.preset];
  if (!agent.hero || (!agent.modelCommand && !agent.thinkingCommand)) {
    throw new Error(tr("途中では かえられません。しゅつじん・よびもどす時だけ かえられます", "Change equipment when embarking or recalling"));
  }
  const next = equipmentInput(input, master, serverLanguage());
  equipmentCommands(session.equipping ?? session.info, next, master, agent, serverLanguage()); // Also validate against any in-flight change.
  const delivered = session.waiting && !session.equipping;
  session.pendingEquipment = next; // The latest choice replaces any earlier held equipment.
  if (delivered) void flushEquipment(session, master, changed, equipped);
  else changed(pending(session)); // Only genuinely held changes announce a wait.
  return delivered;
}

// The same waiting gate as conversation delivery; equipment goes before the held next request.
export async function flushEquipment(session: Session, master: AgentEquipment,
  changed: (message: PendingMessage) => void, equipped: (message: EquippedMessage) => void, sendHeldText = true): Promise<void> {
  if (!session.waiting || session.equipping || !session.pendingEquipment) return;
  const next: Equipment = session.pendingEquipment;
  session.equipping = next; session.waiting = false;
  session.pendingEquipment = undefined;
  changed(pending(session));
  try {
    const commands = equipmentCommands(session.info, next, master, AGENTS[session.info.preset], serverLanguage());
    for (const text of commands) {
      session.terminal.write(AGENTS[session.info.preset].clearDraft);
      deliver(session, text); // Bracketed paste and the same 300ms Enter delay as はなす.
      await new Promise<void>((resolve) => setTimeout(resolve, 650));
      if (session.equipping !== next || session.info.exited || session.ended || session.departing || session.interrupting) return;
    }
    session.info.weapon = next.weapon; session.info.accessory = next.accessory;
    if (commands.length) equipped({ type: "equipped", session: { ...session.info } });
  } catch (error) { console.error("Equipment delivery failed:", error); }
  finally {
    if (session.equipping === next) {
      session.equipping = undefined;
      session.waiting = !session.info.exited && !session.ended && !session.departing && !session.interrupting;
      if (session.waiting && session.pendingEquipment) void flushEquipment(session, master, changed, equipped, sendHeldText);
      else if (session.waiting && session.texts.length && sendHeldText) {
        try {
          deliver(session, session.texts.join("\n")); session.texts = []; changed(pending(session));
        } catch (error) { console.error("Conversation delivery failed:", error); }
      }
    }
  }
}
