// The Workshop's client-side password hash, computed in Node.
//
// Mirrors `packages/workshop-frontend/src/passwordHash.ts` exactly (see `PublicApi.login()`), so an
// account `gadgets dev-login` creates also signs in through the browser's login page.

import { argon2id } from "hash-wasm";

/**
 * `SERVICE_SALT` from `@gadgets/workshop-shared/api`, copied because that module can't be loaded at
 * runtime under plain Node (it imports siblings by `.js`). The test pins the two together.
 */
export const SERVICE_SALT = new Uint8Array([
  0xd9, 0x4e, 0x54, 0x1d, 0x29, 0xc1, 0x03, 0x74, 0x73, 0x7e, 0xb3, 0xe3, 0x34, 0x6d, 0x8f, 0x21,
]);

/** Argon2id of `password`, salted with `SERVICE_SALT` + utf8(`username`). */
export async function hashPassword(username: string, password: string): Promise<Uint8Array> {
  const usernameBuf = new TextEncoder().encode(username);
  const salt = new Uint8Array(SERVICE_SALT.length + usernameBuf.length);
  salt.set(SERVICE_SALT);
  salt.set(usernameBuf, SERVICE_SALT.length);

  return await argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64 MiB in KiB
    hashLength: 32,
    outputType: "binary",
  });
}
