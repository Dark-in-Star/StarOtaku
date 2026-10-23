import { Providers } from "@/app/Providers";

// The browse grid keeps its filter state in Redux; see Providers for why the store is
// mounted per-route instead of in the root layout.
export default function BrowseLayout({ children }: LayoutProps<"/browse">) {
  return <Providers>{children}</Providers>;
}
