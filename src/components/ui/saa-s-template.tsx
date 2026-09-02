"use client";

import * as React from "react";
import Link from "next/link";
import { Poppins } from "next/font/google";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Where every call-to-action on this page sends the visitor. */
const APP_HREF = "/dashboard";

const NAV_LINKS = [
  { label: "Getting started", href: "#getting-started" },
  { label: "Components", href: "#components" },
  { label: "Documentation", href: "#documentation" },
];

const baseButton =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

const buttonVariants = {
  ghost: "text-white hover:bg-gray-800/50",
  solid: "bg-white text-black hover:bg-gray-100",
  gradient:
    "bg-gradient-to-b from-white via-white/95 to-white/60 text-black hover:scale-105 active:scale-95",
};

const buttonSizes = {
  sm: "h-10 px-5 text-sm",
  lg: "h-12 px-8 text-base",
};

// Navigation Component
const Navigation = React.memo(function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const close = React.useCallback(() => setMobileMenuOpen(false), []);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-gray-800/50 bg-black/80 backdrop-blur-md">
      <nav className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold text-white">
            Logo
          </Link>

          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-8 md:flex">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="text-sm text-white/60 transition-colors hover:text-white"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <Link href={APP_HREF} className={cn(baseButton, buttonVariants.ghost, buttonSizes.sm)}>
              Sign in
            </Link>
            <Link href={APP_HREF} className={cn(baseButton, buttonVariants.solid, buttonSizes.sm)}>
              Sign Up
            </Link>
          </div>

          <button
            type="button"
            className="text-white md:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="animate-[slideDown_0.3s_ease-out] border-t border-gray-800/50 bg-black/95 backdrop-blur-md md:hidden">
          <div className="flex flex-col gap-4 px-6 py-4">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="py-2 text-sm text-white/60 transition-colors hover:text-white"
                onClick={close}
              >
                {label}
              </a>
            ))}

            <div className="flex flex-col gap-2 border-t border-gray-800/50 pt-4">
              <Link
                href={APP_HREF}
                onClick={close}
                className={cn(baseButton, buttonVariants.ghost, buttonSizes.sm)}
              >
                Sign in
              </Link>
              <Link
                href={APP_HREF}
                onClick={close}
                className={cn(baseButton, buttonVariants.solid, buttonSizes.sm)}
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
});

// Hero Component
const Hero = React.memo(function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-32">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* The fade animates this wrapper, not the full-height section: translating
          a 100vh element would briefly push the page into a scrollbar. */}
      <div className="relative z-10 flex flex-col items-center [animation:fadeIn_0.6s_ease-out]">
        <aside className="mb-8 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-gray-700 bg-gray-800/50 px-4 py-2 backdrop-blur-sm">
          <span className="whitespace-nowrap text-center text-xs text-gray-400">
            New version of template is out!
          </span>
          <a
            href="#new-version"
            className="flex items-center gap-1 whitespace-nowrap text-xs text-gray-400 transition-all hover:text-white active:scale-95"
            aria-label="Read more about the new version"
          >
            Read more
            <ArrowRight size={12} />
          </a>
        </aside>

        <h1
          className="mb-6 max-w-3xl px-6 text-center text-4xl font-medium leading-tight md:text-5xl lg:text-6xl"
          style={{
            background: "linear-gradient(to bottom, #ffffff, #ffffff, rgba(255, 255, 255, 0.6))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.05em",
          }}
        >
          Give your big idea <br />
          the website it deserves
        </h1>

        <p className="mb-10 max-w-2xl px-6 text-center text-sm text-gray-400 md:text-base">
          Landing page kit template with React, Shadcn/ui and Tailwind <br />
          that you can copy/paste into your project.
        </p>

        <Link
          href={APP_HREF}
          className={cn(baseButton, buttonVariants.gradient, buttonSizes.lg, "rounded-lg")}
        >
          Get started
        </Link>
      </div>

      {/* Anchored to the bottom edge and pushed past it, so only the top of the
          glow bleeds into the hero. */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 z-0 w-[140%] max-w-4xl -translate-x-1/2 translate-y-1/2"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://i.postimg.cc/Ss6yShGy/glows.png" alt="" className="h-auto w-full" loading="eager" />
      </div>
    </section>
  );
});

// Main Component
export default function SaasTemplate() {
  return (
    <main className={cn("min-h-screen bg-black text-white", poppins.className)}>
      <Navigation />
      <Hero />
    </main>
  );
}
