import { beforeEach, expect, it, vi } from "vite-plus/test";

const clerk = vi.hoisted(() => {
  class ClerkAPIError extends Error {
    constructor(readonly status: number) {
      super("Clerk");
    }
  }

  const state = { refusals: new Array<Error>(), signOuts: 0 };

  return { ClerkAPIError, state };
});

vi.mock("@clerk/expo", () => ({
  getClerkInstance: () => ({
    session: {
      getToken: async () => {
        const [refusal] = clerk.state.refusals;

        if (refusal) throw refusal;

        return "token";
      },
    },
    signOut: async () => {
      clerk.state.signOuts += 1;
    },
  }),
  isClerkAPIResponseError: (error: Error) => error instanceof clerk.ClerkAPIError,
}));

vi.mock("./config", () => ({ clerkPublishableKey: "pk_test" }));

const { sessionToken } = await import("./sessionToken");

beforeEach(() => {
  clerk.state.refusals.length = 0;
  clerk.state.signOuts = 0;
});

it("returns the session's token", async () => {
  await expect(sessionToken()).resolves.toBe("token");
  expect(clerk.state.signOuts).toBe(0);
});

it.each([401, 404])("signs out when Clerk answers %i for a gone session", async (status) => {
  clerk.state.refusals.push(new clerk.ClerkAPIError(status));

  await expect(sessionToken()).resolves.toBeNull();
  expect(clerk.state.signOuts).toBe(1);
});

it("keeps the session when the network fails", async () => {
  clerk.state.refusals.push(new TypeError("Network request failed"));

  await expect(sessionToken()).rejects.toThrow("Network request failed");
  expect(clerk.state.signOuts).toBe(0);
});

it("keeps the session when Clerk itself fails", async () => {
  clerk.state.refusals.push(new clerk.ClerkAPIError(503));

  await expect(sessionToken()).rejects.toThrow("Clerk");
  expect(clerk.state.signOuts).toBe(0);
});
