import Link from "next/link";
import Navigation from "@/components/navigation";
import { getCurrentYear } from "@/lib/datetime";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col pt-16">
      <Navigation />

      <div className="flex-grow flex flex-col items-center justify-center p-6 md:p-24 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">AI Courtroom</h1>
        <p className="text-lg md:text-xl mb-8 max-w-3xl">
          Experience the future of legal proceedings with our AI-powered
          courtroom simulation. Submit arguments, receive counter-arguments, and
          get verdicts based on advanced AI analysis.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/register"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Login
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl">
          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-zinc-900">
            <h2 className="text-xl font-semibold mb-3 dark:text-white underline">
              Dynamic AI Opposition
            </h2>
            <p className="dark:text-white">
              Experience real-time legal challenges as our advanced AI generates
              incisive counter-arguments tailored to your submissions.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-zinc-900">
            <h2 className="text-xl font-semibold mb-3 dark:text-white underline">
              Hone Your Legal Arguments
            </h2>
            <p className="dark:text-white">
              Law students can refine their advocacy skills by crafting and
              submitting arguments as either plaintiff or defendant lawyers,
              preparing for real-world courtroom challenges.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-zinc-900">
            <h2 className="text-xl font-semibold mb-3 dark:text-white underline">
              Impartial Verdicts
            </h2>
            <p className="dark:text-white">
              Receive unbiased judgments based on the comprehensive evaluation
              of all presented arguments, ensuring a fair and just outcome.
            </p>
          </div>
        </div>
      </div>

      <footer className="bg-gray-800 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>
            © {getCurrentYear()} AI Courtroom Simulation. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
