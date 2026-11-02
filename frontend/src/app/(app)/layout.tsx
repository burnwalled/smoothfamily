// Every signed-in page shares one Shell, so the menu, badges and profile stay mounted between
// pages instead of being rebuilt and refetched on each navigation. Login lives outside the group.
import Shell from "@/components/Shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
