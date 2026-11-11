import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "PayMind — AI Financial Protection & Digital Delivery Assurance",
  description: "AI-powered international payment intelligence, PayPal Sandbox checkout, and digital deliverable assurance for global freelancers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} min-h-screen bg-slate-50 font-sans text-slate-900 antialiased`}>
        <div className="flex min-h-screen w-full">
          <Suspense fallback={<aside className="sticky top-0 h-screen w-64 shrink-0 border-r border-slate-200 bg-white" />}>
            <Sidebar />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">
            <Suspense fallback={<header className="h-16 border-b border-slate-200 bg-white" />}>
              <Header />
            </Suspense>
            <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
