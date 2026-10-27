import { createClerkClient } from "@clerk/backend";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

const clerkApi = () => createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

/**
 * Throwaway Clerk users. Development instances never message `+clerk_test` addresses or the
 * reserved 555-01XX numbers, and this instance requires both.
 */
export async function createUsers(names: ReadonlyArray<string>) {
  const run = Date.now().toString(36);
  const firstNumber = 100 + Math.floor(Math.random() * (100 - names.length));
  return Promise.all(
    names.map(async (firstName, index) => {
      const emailAddress = `${firstName.toLowerCase()}-${run}+clerk_test@example.com`;
      const user = await clerkApi().users.createUser({
        emailAddress: [emailAddress],
        phoneNumber: [`+1201555${String(firstNumber + index).padStart(4, "0")}`],
        firstName,
        skipPasswordRequirement: true,
      });
      return { id: user.id, firstName, emailAddress };
    }),
  );
}

export async function deleteUsers(users: ReadonlyArray<{ id: string }>) {
  await Promise.all(users.map((user) => clerkApi().users.deleteUser(user.id)));
}

export async function signIn(page: Page, emailAddress: string) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/");
}
