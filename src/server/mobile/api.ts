import type { IncomingMessage, ServerResponse } from "node:http";
import { mobileBase64url, mobileObject } from "../../core/mobile-protocol";
import { readJsonBody } from "../http-body";
import type { MobileGateway } from "./gateway";
import { mobileJson } from "./http";

// Called only AFTER relay's existing Host, Origin and screen-token authorization.
// No registry public keys, secrets, push tokens or sequence state leave this API.
export async function handleMobileApi(request: IncomingMessage, response: ServerResponse, url: URL, gateway?: MobileGateway): Promise<void> {
  try {
    if (url.pathname === "/api/mobile" && request.method === "GET") { mobileJson(response, gateway?.snapshot() ?? { enabled: false }); return; }
    if (!gateway) throw Error("Mobile is disabled");
    const device = /^\/api\/mobile\/devices\/([^/]+)$/.exec(url.pathname);
    if (device && request.method === "DELETE") {
      const id = decodeURIComponent(device[1]);
      if (!mobileBase64url(id, 32) || !gateway.store.remove(id)) throw Error("Device not found");
    } else if (request.method === "POST") {
      const result = await readJsonBody(request, response, 4096);
      if (!result.ok) return;
      const body = result.value;
      if (url.pathname === "/api/mobile/pair" && (mobileObject(body, []) || mobileObject(body, ["addresses"]))) {
        const addresses = "addresses" in body ? body.addresses : gateway.addresses;
        if (!Array.isArray(addresses) || !addresses.every(value => typeof value === "string")) throw Error("Invalid addresses");
        gateway.startPairing(addresses);
      } else if (url.pathname === "/api/mobile/confirm" && mobileObject(body, ["deviceId", "approve"])
        && typeof body.deviceId === "string" && typeof body.approve === "boolean") {
        if (!gateway.confirm(body.deviceId, body.approve)) throw Error("Pairing no longer pending");
      } else if (url.pathname === "/api/mobile/cancel" && mobileObject(body, [])) gateway.cancelPairing();
      else throw Error("Invalid mobile operation");
    } else throw Error("Invalid mobile route");
    mobileJson(response, gateway.snapshot());
  } catch { mobileJson(response, { error: "rejected" }, 400); }
}
