import { describe, expect, it } from "vitest";
import { SERVICE_SALT as SHARED_SERVICE_SALT } from "@gadgets/workshop-shared/api";
import { hashPassword as browserHashPassword } from "../../workshop-frontend/src/passwordHash.ts";
import { hashPassword, SERVICE_SALT } from "./passwordHash.ts";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("hashPassword", () => {
  it("uses the shared service salt", () => {
    expect([...SERVICE_SALT]).toEqual([...SHARED_SERVICE_SALT]);
  });

  it("matches a known vector", async () => {
    expect(hex(await hashPassword("admin", "devpassword")))
      .toBe("7a355eac36130255acb1c568a070e2a91ca2f91afc0fede3c1592c775d7c8b0c");
  });

  it("matches the browser's hash, so the login page accepts the same password", async () => {
    expect(hex(await hashPassword("alice", "s3cret"))).toBe(hex(await browserHashPassword("alice", "s3cret")));
  });
});
