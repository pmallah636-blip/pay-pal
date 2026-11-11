"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  FileCheck2,
  FolderGit2,
  CreditCard,
  ClipboardCheck,
  FileDiff,
  Settings,
  Shield,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDemoWorkspace } from "@/lib/workspace/use-demo-workspace";

const navItems = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Contracts", href: "/contracts", icon: FileCheck2 },
  { name: "Projects", href: "/projects", icon: FolderGit2 },
  { name: "AI Delivery Check", href: "/deliverables", icon: ClipboardCheck },
  { name: "Scope Changes", href: "/scope-changes", icon: FileDiff },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const workspace = useDemoWorkspace();

  return (
    <aside
      className={cn(
        "paymind-sidebar sticky top-0 z-40 flex h-screen shrink-0 flex-col justify-between overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div>
        <div className={cn("flex h-[88px] items-center border-b border-slate-100", collapsed ? "justify-center px-2" : "justify-between px-5")}>
          <Link href="/" aria-label="PayMind overview" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700">
              <Shield className="h-5 w-5" />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-slate-950">PayMind</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Demo</span>
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {workspace.view === "client" ? "Client view" : "Merchant view"}
                </span>
              </span>
            )}
          </Link>
        </div>

        <div className={cn("flex", collapsed ? "justify-center px-2 pt-3" : "justify-end px-3 pt-3")}>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav aria-label="Main navigation" className={cn("space-y-1 pt-3", collapsed ? "px-2" : "px-3")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.name : undefined}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-xl text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-2" : "gap-3 px-3",
                  isActive
                    ? "border border-sky-100 bg-sky-50 text-sky-800"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-sky-700" : "text-slate-400")} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={cn("border-t border-slate-100", collapsed ? "flex justify-center p-3" : "p-4")}>
        {collapsed ? (
          <Link href="/settings" title="Settings" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
            {workspace.view === "client" ? "C" : "M"}
          </Link>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">
                {workspace.view === "client" ? "Client workspace view" : "Merchant workspace view"}
              </p>
              <p className="truncate text-[11px] text-slate-500">Demo view setting · change in Settings</p>
            </div>
            <Link href="/settings" title="Settings" className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-sky-700">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
