// Browser side of passkeys: turn the server's JSON options into the binary
// structures navigator.credentials expects, and the result back into JSON.
// (PublicKeyCredential.parseCreationOptionsFromJSON isn't available on iOS 16.)

type Json = Record<string, unknown>;

function fromB64url(value: string): ArrayBuffer {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function toB64url(buffer: ArrayBuffer | null): string | null {
  if (!buffer) return null;
  let bin = "";
  for (const byte of new Uint8Array(buffer)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function descriptors(list: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.map((d: Json) => ({ ...(d as object), id: fromB64url(d.id as string) }) as PublicKeyCredentialDescriptor);
}

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials;
}

export async function createPasskey(options: Json): Promise<Json> {
  const user = options.user as Json;
  const publicKey = {
    ...options,
    challenge: fromB64url(options.challenge as string),
    user: { ...user, id: fromB64url(user.id as string) },
    excludeCredentials: descriptors(options.excludeCredentials),
  } as unknown as PublicKeyCredentialCreationOptions;
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  const response = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64url(response.clientDataJSON),
      attestationObject: toB64url(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

export async function getPasskey(options: Json): Promise<Json> {
  const publicKey = {
    ...options,
    challenge: fromB64url(options.challenge as string),
    allowCredentials: descriptors(options.allowCredentials),
  } as unknown as PublicKeyCredentialRequestOptions;
  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  const response = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64url(response.clientDataJSON),
      authenticatorData: toB64url(response.authenticatorData),
      signature: toB64url(response.signature),
      userHandle: toB64url(response.userHandle),
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

/** A friendly default name for a new passkey, e.g. "iPhone" or "Windows". */
export function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Passkey";
}
