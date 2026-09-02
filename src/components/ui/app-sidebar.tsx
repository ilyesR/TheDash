"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ReceiptText,
  HandCoins,
  FolderKanban,
  Users,
  Building2,
  Handshake,
  CheckSquare,
  FileBarChart,
  Settings,
  ChevronRight,
  LineChart,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** `href: null` marks a section that has no page behind it yet. */
const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Transactions", icon: ReceiptText, href: "/transactions" },
  { label: "Pay back", icon: HandCoins, href: "/payback" },
  { label: "Projects", icon: FolderKanban, href: "/projects" },
  { label: "Contacts", icon: Users, href: null },
  { label: "Companies", icon: Building2, href: null },
  { label: "Deals", icon: Handshake, href: null },
  { label: "Tasks", icon: CheckSquare, href: null },
  { label: "Reports", icon: FileBarChart, href: null },
] as const;

export default function AppSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 transition-transform duration-200",
          "md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <LineChart size={17} className="text-white/70" />
            CRM Studio
          </span>
          <button
            type="button"
            className="text-white/70 md:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
            const active = href !== null && pathname === href;

            const className = cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors",
              active
                ? "border border-neutral-700 bg-neutral-800 text-white"
                : "text-white/55 hover:bg-neutral-800/50 hover:text-white"
            );

            return href ? (
              <Link
                key={label}
                href={href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                <Icon size={16} />
                {label}
              </Link>
            ) : (
              <span key={label} className={cn(className, "cursor-default opacity-60")}>
                <Icon size={16} />
                {label}
              </span>
            );
          })}

          <div className="my-3 border-t border-neutral-800" />

          <span className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-white/55 opacity-60">
            <Settings size={16} />
            Settings
          </span>
        </nav>

        <div className="border-t border-neutral-800 px-4 py-4">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-neutral-800/50"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-500/25 text-[11px] font-semibold text-violet-200">
              JD
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] text-white">John Doe</span>
              <span className="truncate text-[11px] text-white/45">Sales Manager</span>
            </span>
            <ChevronRight size={15} className="ml-auto text-white/35" />
          </button>
        </div>
      </aside>
    </>
  );
}
