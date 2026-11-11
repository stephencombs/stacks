// Preview only: a signed-in Clerk so the real app renders without a Clerk instance.
import type { ReactNode } from "react";
export const ClerkProvider = ({ children }: { children: ReactNode }) => children;
export const ClerkFailed = () => null;
export const SignInButton = ({ children }: { children: ReactNode }) => children;
export const SignUpButton = ({ children }: { children: ReactNode }) => children;
// ?signedOut=1 on the preview address shows the app signed out, to record a table as a device first.
const signedOut = () => sessionStorage.getItem("preview-signed-out") === "1";
export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: !signedOut(),
  userId: signedOut() ? null : "user_maya",
});
export const useUser = () => ({
  isLoaded: true,
  user: { firstName: "Maya", fullName: "Maya Okafor", imageUrl: "" },
});
export const useClerk = () => ({ openUserProfile: () => {}, signOut: async () => {} });
export const getToken = async () => "lab";
