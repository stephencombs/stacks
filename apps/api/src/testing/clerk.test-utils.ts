import { createSign, generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

/** The PEM public key Clerk verification reads from `CLERK_JWT_KEY`. */
export const clerkJwtKey = publicKey.export({ type: "spki", format: "pem" }).toString();

const part = (json: string) => Buffer.from(json).toString("base64url");

/** A native session token for `sub`, signed with the test key; a negative `expiresIn` is expired. */
export const sessionToken = (sub: string, expiresIn: number) => {
  const now = Math.floor(Date.now() / 1000);
  const head = part(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = part(JSON.stringify({ iat: now - 600, nbf: now - 600, sub, exp: now + expiresIn }));
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);

  return `${head}.${body}.${signature.toString("base64url")}`;
};
