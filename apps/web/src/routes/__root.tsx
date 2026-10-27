import { RegistryProvider } from "@effect/atom-react";
import { Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <RegistryProvider>
      <Outlet />
    </RegistryProvider>
  ),
});
