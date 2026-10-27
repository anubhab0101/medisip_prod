import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUser: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ db: () => ({ user: { findUnique: mocks.findUser } }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { assertPlatformAdmin, platformAdminEmails } from "@/lib/platform-admin";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", "Platform@MediShop.test, second@example.test");
  mocks.auth.mockResolvedValue({ user: { id: "staff-1", email: "platform@medishop.test", sessionVersion: 3 } });
  mocks.findUser.mockResolvedValue({ id: "staff-1", email: "platform@medishop.test", active: true, sessionVersion: 3, mustChangePassword: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("platform administrator boundary", () => {
  it("normalizes and matches only configured allowlist emails", () => {
    expect(platformAdminEmails().has("platform@medishop.test")).toBe(true);
    expect(platformAdminEmails().has("staff@medishop.test")).toBe(false);
  });
  it("allows an active, current allowlisted account without a shop role", async () => {
    await expect(assertPlatformAdmin()).resolves.toEqual({ id: "staff-1", email: "platform@medishop.test" });
  });
  it("denies a signed-in user who is not in the allowlist", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "staff-1", email: "staff@medishop.test", sessionVersion: 3 } });
    mocks.findUser.mockResolvedValue({ id: "staff-1", email: "staff@medishop.test", active: true, sessionVersion: 3, mustChangePassword: false });
    await expect(assertPlatformAdmin()).rejects.toThrow("Platform administrator access required");
  });
  it("rejects inactive or revoked sessions", async () => {
    mocks.findUser.mockResolvedValue({ id: "staff-1", email: "platform@medishop.test", active: false, sessionVersion: 3, mustChangePassword: false });
    await expect(assertPlatformAdmin()).rejects.toThrow("redirect:/login");
  });
});
