// Preview only: a signed-in Clerk so the real app renders without a Clerk instance.
import type { ReactNode } from "react";
export const ClerkProvider = ({ children }: { children: ReactNode }) => children;
export const ClerkFailed = () => null;
export const SignInButton = ({ children }: { children: ReactNode }) => children;
export const SignUpButton = ({ children }: { children: ReactNode }) => children;
export const useAuth = () => ({ isLoaded: true, isSignedIn: true, userId: "user_maya" });
export const useUser = () => ({
  isLoaded: true,
  user: { firstName: "Maya", fullName: "Maya Okafor", imageUrl: "" },
});
export const useClerk = () => ({ openUserProfile: () => {}, signOut: async () => {} });
export const getToken = async () => "lab";
