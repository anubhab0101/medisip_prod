import type { Metadata } from "next";
export const metadata: Metadata = { title: "Platform administration · MediShop", robots: { index: false, follow: false, nocache: true } };
export default function PlatformLayout({ children }: { children: React.ReactNode }) { return <div className="platform-shell">{children}</div>; }
