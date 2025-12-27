import Link from "next/link";
import Navigation from "@/components/navigation";

export default function Home() {
  return (
    <main className="h-screen flex flex-col overflow-hidden relative">
      {/* Background Image - pushed down with top offset */}
      <div
        className="absolute -z-20"
        style={{
          top: "0",
          left: 0,
          right: 0,
          bottom: "0",
          backgroundImage: "url('/background.png')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Dark Gradient Overlay */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to right, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.25) 100%)",
        }}
      />

      {/* <Navigation translucent /> */}

      {/* Content positioned on the left (darker side) */}
      <div className="grow flex flex-col items-start justify-center pl-12 md:pl-24 pt-10">
        {/* Hero Text */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 max-w-xl">
          AI-Powered Legal Simulation
        </h1>
        <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-lg">
          Argue your case. Challenge the AI. Step into the courtroom where
          justice is decided.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/register"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg shadow-lg text-center"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="bg-white/90 hover:bg-white text-gray-800 font-bold py-3 px-8 rounded-lg transition-colors text-lg shadow-lg backdrop-blur-sm text-center"
          >
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}
