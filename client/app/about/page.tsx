"use client";

import Link from "next/link";
import {
  Gavel,
  Scale,
  MessageSquare,
  Brain,
  ArrowRight,
  Sparkles,
  Users,
  BookOpen,
} from "lucide-react";
import Navigation from "@/components/navigation";
import { HexagonBackground } from "@/components/animate-ui/components/backgrounds/hexagon";

export default function AboutPage() {
  return (
    <HexagonBackground className="min-h-screen flex flex-col p-0 pt-16">
      <Navigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 lg:py-32">
        <div className="container px-4 mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-medium mb-8">
            <Sparkles className="h-4 w-4" />
            AI-Powered Legal Simulation
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl mb-6 bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            About AI Courtroom
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Bridging the gap between legal theory and practice through advanced
            Artificial Intelligence simulation.
          </p>
        </div>
        {/* Background Decorative Element */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-500/10 blur-[100px] -z-10 rounded-full" />
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="container px-4 mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Three simple steps to sharpen your legal argumentation skills
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-linear-to-r from-blue-500/30 via-indigo-500/30 to-purple-500/30" />

            {/* Step 1 */}
            <div className="relative bg-card/80 backdrop-blur-sm p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg hover:border-blue-500/30 transition-all duration-300 group">
              <div className="w-14 h-14 bg-linear-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 text-white font-bold text-xl shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
                1
              </div>
              <h3 className="text-xl font-semibold mb-3">Choose Your Case</h3>
              <p className="text-muted-foreground leading-relaxed">
                Select from a variety of generated civil or criminal cases, or
                generate a completely new scenario tailored to specific legal
                topics.
              </p>
            </div>
            {/* Step 2 */}
            <div className="relative bg-card/80 backdrop-blur-sm p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg hover:border-indigo-500/30 transition-all duration-300 group">
              <div className="w-14 h-14 bg-linear-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 text-white font-bold text-xl shadow-lg shadow-indigo-500/25 group-hover:scale-110 transition-transform">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3">Argue Your Case</h3>
              <p className="text-muted-foreground leading-relaxed">
                Step into the role of the lawyer. Present your opening
                statement, cross-examine AI-generated parties, and draft
                compelling arguments.
              </p>
            </div>
            {/* Step 3 */}
            <div className="relative bg-card/80 backdrop-blur-sm p-8 rounded-2xl border border-border shadow-sm hover:shadow-lg hover:border-purple-500/30 transition-all duration-300 group">
              <div className="w-14 h-14 bg-linear-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 text-white font-bold text-xl shadow-lg shadow-purple-500/25 group-hover:scale-110 transition-transform">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3">Get the Verdict</h3>
              <p className="text-muted-foreground leading-relaxed">
                Receive a detailed verdict from the AI Judge, complete with
                legal reasoning and constructive feedback on your performance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container px-4 mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Platform Features</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Everything you need for an immersive legal simulation experience
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Brain className="h-6 w-6" />}
              color="pink"
              title="AI-Powered Parties"
              description="Interact with realistic AI characters who have unique backstories and personalities."
            />
            <FeatureCard
              icon={<Gavel className="h-6 w-6" />}
              color="amber"
              title="Instant Verdicts"
              description="No waiting for weeks. The AI Judge analyzes your arguments against legal principles instantly."
            />
            <FeatureCard
              icon={<MessageSquare className="h-6 w-6" />}
              color="green"
              title="Real-time Chat"
              description="Conduct investigations by chatting naturally with involved parties to uncover evidence."
            />
            <FeatureCard
              icon={<Scale className="h-6 w-6" />}
              color="blue"
              title="Legal Skill Building"
              description="Designed specifically to help law students and enthusiasts practice argumentation."
            />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16">
        <div className="container px-4 mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              value="AI-Driven"
              label="Parties & Judge"
            />
            <StatCard
              icon={<Gavel className="h-5 w-5" />}
              value="Instant"
              label="Verdicts"
            />
            <StatCard
              icon={<BookOpen className="h-5 w-5" />}
              value="Unlimited"
              label="Case Scenarios"
            />
            <StatCard
              icon={<MessageSquare className="h-5 w-5" />}
              value="Real-time"
              label="Interactions"
            />
          </div>
        </div>
      </section>

      {/* Footer / CTA Section */}
      <footer className="bg-card/80 backdrop-blur-sm border-t border-border py-12 mt-auto">
        <div className="container px-4 mx-auto text-center">
          <h2 className="text-2xl font-bold mb-3">
            Ready to enter the courtroom?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Start building your legal argumentation skills with AI-powered
            simulations today.
          </p>
          <div className="flex justify-center gap-4 mb-12">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/25"
            >
              Start for Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold py-3 px-8 rounded-full transition-colors"
            >
              Login
            </Link>
          </div>

          <div className="flex flex-col md:flex-row justify-center items-center gap-6 text-sm text-muted-foreground border-t border-border/50 pt-8 max-w-2xl mx-auto">
            <p>
              © {new Date().getFullYear()} AI Courtroom. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="hover:text-foreground transition-colors underline underline-offset-4"
              >
                Terms of Service
              </Link>
              <Link
                href="/contact"
                className="hover:text-foreground transition-colors underline underline-offset-4"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </HexagonBackground>
  );
}

const colorMap: Record<string, { icon: string; bg: string; border: string }> = {
  pink: {
    icon: "text-pink-500",
    bg: "bg-pink-500/10",
    border: "hover:border-pink-500/30",
  },
  amber: {
    icon: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "hover:border-amber-500/30",
  },
  green: {
    icon: "text-green-500",
    bg: "bg-green-500/10",
    border: "hover:border-green-500/30",
  },
  blue: {
    icon: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "hover:border-blue-500/30",
  },
};

function FeatureCard({
  icon,
  color,
  title,
  description,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
}) {
  const colors = colorMap[color] || colorMap.blue;
  return (
    <div
      className={`p-6 rounded-2xl bg-card/80 backdrop-blur-sm border border-border ${colors.border} transition-all duration-300 group hover:shadow-lg`}
    >
      <div
        className={`mb-4 p-3 ${colors.bg} rounded-xl w-fit group-hover:scale-110 transition-transform`}
      >
        <div className={colors.icon}>{icon}</div>
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="text-center p-6 rounded-2xl bg-card/80 backdrop-blur-sm border border-border">
      <div className="inline-flex items-center justify-center p-2 rounded-lg bg-blue-500/10 text-blue-500 mb-3">
        {icon}
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
