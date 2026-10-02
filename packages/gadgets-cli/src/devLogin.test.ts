import { describe, expect, it, vi } from "vitest";
import { devLogin, devLoginLink, normalizeUsername, requireLoopback, signIn } from "./devLogin.ts";

type Api = Parameters<typeof signIn>[0];

function fakeApi(login: string | null, created: string | null) {
  return {
    login: vi.fn<Api["login"]>().mockResolvedValue(login),
    createAccount: vi.fn<Api["createAccount"]>().mockResolvedValue(created),
  };
}

describe("requireLoopback", () => {
  it.each(["http://localhost:8787", "http://127.0.0.1:3000", "http://[::1]:8787"])("accepts %s", url => {
    expect(requireLoopback(url, "--api").origin).toBe(new URL(url).origin);
  });

  it("refuses a remote Workshop", () => {
    expect(() => requireLoopback("https://workshop.example.com", "--api")).toThrow(/local Workshop/);
  });

  it("refuses something that isn't a URL", () => {
    expect(() => requireLoopback("localhost:8787x", "--app")).toThrow();
  });
});

describe("normalizeUsername", () => {
  it("lowercases", () => expect(normalizeUsername("Admin")).toBe("admin"));
  it("rejects names the backend would", () => expect(() => normalizeUsername("1admin")).toThrow(/Invalid username/));
});

describe("signIn", () => {
  it("logs in to an existing account", async () => {
    const api = fakeApi("admin:secret", null);
    await expect(signIn(api, "Admin", "pw")).resolves.toEqual({ token: "admin:secret", username: "admin", created: false });
    expect(api.createAccount).not.toHaveBeenCalled();
  });

  it("creates the account when login finds none", async () => {
    const api = fakeApi(null, "bob:secret");
    await expect(signIn(api, "bob", "pw")).resolves.toEqual({ token: "bob:secret", username: "bob", created: true });
    expect(api.createAccount).toHaveBeenCalledWith("bob", "bob", expect.any(Uint8Array));
  });

  it("reports a wrong password for an existing account", async () => {
    await expect(signIn(fakeApi(null, null), "bob", "wrong")).rejects.toThrow(/different password/);
  });
});

describe("devLoginLink", () => {
  it("puts the encoded token in the fragment", () => {
    expect(devLoginLink("http://localhost:3000", "admin:a+b/c="))
      .toBe("http://localhost:3000/#gadgets-dev-token=admin%3Aa%2Bb%2Fc%3D");
  });
});

describe("devLogin", () => {
  it("refuses a remote app before connecting", async () => {
    await expect(devLogin({ api: "http://localhost:8787", app: "https://evil.example", username: "a", password: "p" }))
      .rejects.toThrow(/--app must be a local Workshop/);
  });
});
