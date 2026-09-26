"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconLayers } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Leads" },
  { href: "/pipeline", label: "Pipeline" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/leads");
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-accent-foreground"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <IconLayers className="h-3.5 w-3.5" />
            </span>
            <span className="text-[13px] font-semibold tracking-tight text-foreground">Lead Intelligence</span>
          </Link>
          <nav className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-surface-selected text-foreground" : "text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
