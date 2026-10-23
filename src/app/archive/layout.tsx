import { Providers } from "@/app/Providers";

// The archive grid keeps its filter state in Redux; see Providers for why the store is
// mounted per-route instead of in the root layout.
export default function ArchiveLayout({ children }: LayoutProps<"/archive">) {
  return <Providers>{children}</Providers>;
}
