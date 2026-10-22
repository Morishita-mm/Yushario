import { mobileInteger, mobileRequestBodyValues, type MobileRequest } from "./mobile-protocol";
import { mobileResponseBodyValues, type MobileResponse } from "./mobile-display";

export type MobilePublicKeys = {
  gatewayEncryptionKey: string; gatewaySigningKey: string;
  phoneEncryptionKey: string; phoneSigningKey: string;
};

export function mobileRequestSigningInput(request: MobileRequest): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(["yushario.request.v1", request.v, request.deviceId,
    request.seq, request.timestamp, request.operation, mobileRequestBodyValues(request)]));
}

export function mobileResponseSigningInput(response: MobileResponse): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(["yushario.response.v1", response.v, response.deviceId,
    response.seq, response.timestamp, response.operation, mobileResponseBodyValues(response)]));
}

export function mobileAad(direction: "request" | "response", deviceId: string, seq: number, keys: MobilePublicKeys): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(["yushario.aead.v1", direction, 1, deviceId, seq,
    keys.gatewayEncryptionKey, keys.gatewaySigningKey, keys.phoneEncryptionKey, keys.phoneSigningKey]));
}

export function mobileNonce(seq: number): Uint8Array {
  if (!mobileInteger(seq, 1)) throw new RangeError("Invalid mobile sequence");
  const nonce = new Uint8Array(12);
  let remaining = seq;
  for (let i = 11; i >= 4; i--) {
    nonce[i] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  return nonce;
}
