import { Providers } from "@/app/Providers";
import "@/app/mylist/mylist.css";

export default function MyListLayout({ children }: LayoutProps<"/mylist">) {
  return (
    <Providers>
      <div data-mylist-page="">{children}</div>
    </Providers>
  );
}
