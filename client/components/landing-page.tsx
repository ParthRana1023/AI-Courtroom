import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentYear } from "@/lib/datetime";

export function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-4 lg:px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center justify-center">
          <h1 className="text-2xl font-bold">AI Courtroom</h1>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
          <ThemeToggle />
          <Link href="/login" className="text-sm font-medium hover:underline">
            Login
          </Link>
          <Link
            href="/register"
            className="text-sm font-medium hover:underline"
          >
            Register
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Experience AI-Powered Legal Arguments
                </h1>
                <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
                  Simulate courtroom debates with advanced AI. Practice legal
                  arguments, receive counter-arguments, and get verdicts from
                  our AI judge.
                </p>
              </div>
              <div className="space-x-4">
                <Link href="/register">
                  <Button>Get Started</Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline">Login</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
        <section className="w-full py-12 md:py-24 lg:py-32 bg-muted">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-3 items-center">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Practice Legal Arguments</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  Submit arguments as either a defendant or plaintiff lawyer and
                  receive AI-generated counter-arguments.
                </p>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Realistic Simulation</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  Experience a realistic courtroom environment with AI-powered
                  responses based on legal principles.
                </p>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Get AI Verdicts</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  After both sides present their arguments, receive a verdict
                  from our AI judge.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          © {getCurrentYear()} AI Courtroom Simulation. All rights reserved.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link href="#" className="text-xs hover:underline underline-offset-4">
            Terms of Service
          </Link>
          <Link href="#" className="text-xs hover:underline underline-offset-4">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
