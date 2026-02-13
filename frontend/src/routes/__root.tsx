import { createRootRoute, Outlet } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "../components/layout/Header";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <div className="dark min-h-screen bg-[#0a0a0a] text-[#fafafa]">
        <Header />
        <main>
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  ),
});
