// Preview only: a signed-in Clerk so the real app renders without a Clerk instance.
import type { ReactNode } from "react";
export const ClerkProvider = ({ children }: { children: ReactNode }) => children;
export const ClerkFailed = () => null;
export const SignInButton = ({ children }: { children: ReactNode }) => children;
export const SignUpButton = ({ children }: { children: ReactNode }) => children;
export const UserButton = () => <span className="block size-7 rounded-full bg-chip-1" />;
export const useAuth = () => ({ isLoaded: true, isSignedIn: true, userId: "user_maya" });
export const useUser = () => ({ isLoaded: true, user: { firstName: "Maya", fullName: "Maya" } });
export const getToken = async () => "lab";
