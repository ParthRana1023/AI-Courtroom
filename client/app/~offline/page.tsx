"use client";

import { Wifi, WifiOff, RefreshCw, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function OfflinePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Animated icon */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
          <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-linear-to-br from-red-500/30 to-orange-500/30 border border-red-500/40">
            <WifiOff className="w-10 h-10 text-red-400" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            You&apos;re Offline
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            It looks like you&apos;ve lost your internet connection. Check your
            network and try again.
          </p>
        </div>

        {/* Connection status indicator */}
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-slate-800/60 border border-slate-700/50 mx-auto w-fit">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-sm text-slate-400 font-medium">
            No connection
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-blue-500/20"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition-colors border border-slate-600/50"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        {/* Subtle tip */}
        <div className="pt-4">
          <p className="text-xs text-slate-600 flex items-center justify-center gap-1.5">
            <Wifi className="w-3.5 h-3.5" />
            Previously visited pages may still be available
          </p>
        </div>
      </div>
    </main>
  );
}
