"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  LayoutDashboard,
  Truck,
  Upload,
  TriangleAlert,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
const links = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/shipments", "All shipments", Truck],
  ["/imports", "Import shipments", Upload],
  ["/action-required", "Action required", TriangleAlert],
  ["/notifications", "Notifications", Bell],
  ["/usage", "API & activity", BarChart3],
  ["/settings", "Settings", Settings],
] as const;
export function Shell({
  children,
  user,
  demo,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
  demo: boolean;
}) {
  const path = usePathname();
  return (
    <>
      <aside className="desktop-sidebar fixed inset-y-0 left-0 w-[216px] bg-[#101e36] text-white p-5 flex flex-col">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-xl font-bold tracking-tight py-3"
        >
          <span className="bg-blue-600 p-2 rounded-lg">
            <Package size={19} />
          </span>
          ParcelOps<span className="text-blue-400">.</span>
        </Link>
        <div className="mt-7 mb-7 border border-slate-700 rounded-lg p-3 flex justify-between items-center">
          <div>
            <div className="text-[11px] text-slate-400">Workspace</div>
            <div className="text-xs mt-1 font-medium">Shipment operations</div>
          </div>
          <ChevronDown size={13} />
        </div>
        <p className="text-[9px] text-slate-500 tracking-[.16em] px-3">
          MANAGE
        </p>
        <nav>
          {links.map(([href, title, Icon], i) => (
            <Link
              key={href}
              href={href}
              className={`sidebar-link ${path.startsWith(href) ? "active" : ""} ${i === 6 ? "mt-8" : ""}`}
            >
              <Icon size={16} />
              {title}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <div className="p-3 bg-[#182a45] rounded-lg mb-5">
            <ShieldCheck className="text-blue-400 mb-2" size={18} />
            <p className="text-xs mb-1">Private & secure</p>
            <p className="text-[10px] text-slate-400 mb-0 leading-5">
              Your data. Your operations.
              <br />
              Always under your control.
            </p>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.href = "/login";
            }}
            className="flex gap-3 items-center text-xs text-slate-400"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <div className="main-offset ml-[216px]">
        <header className="h-[72px] border-b border-slate-200 bg-white flex items-center justify-between px-5 md:px-9">
          <div className="text-xs text-slate-400">
            Workspace <span className="mx-3">/</span>
            <span className="text-slate-700">
              {links.find(([h]) => path.startsWith(h))?.[1] ??
                "Shipment detail"}
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/notifications" aria-label="Notifications">
              <Bell size={17} className="text-slate-500" />
            </Link>
            <span className="h-7 w-px bg-slate-200" />
            <span className="bg-blue-50 text-blue-600 rounded-full h-8 w-8 flex items-center justify-center text-xs font-bold">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="hidden sm:block">
              <div className="text-xs font-semibold">{user.name}</div>
              <div className="text-[10px] text-slate-400">Administrator</div>
            </div>
          </div>
        </header>
        <nav className="mobile-nav hidden overflow-x-auto bg-[#101e36] p-2">
          {links.map(([href, title, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-label={title}
              className="text-white p-3"
            >
              <Icon size={19} />
            </Link>
          ))}
        </nav>
        {demo && (
          <div className="bg-amber-50 border-b border-amber-100 text-amber-800 px-5 md:px-9 py-2 text-[11px]">
            DEMO WORKSPACE · All tracking data is fictitious. Live API calls and
            email delivery are disabled.
          </div>
        )}
        <main className="p-5 md:p-9 max-w-[1600px] mx-auto">{children}</main>
        <footer className="px-9 py-6 text-[10px] text-slate-400 flex justify-between">
          <span>
            © {new Date().getFullYear()} ParcelOps · Shipment Control Center
          </span>
          <span>Amazon US & Canada</span>
        </footer>
      </div>
    </>
  );
}
