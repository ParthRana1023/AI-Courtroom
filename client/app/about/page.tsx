import type { Metadata } from "next";
import Link from "next/link";
import { Gavel, Scale, MessageSquare, Brain } from "lucide-react";
import Navigation from "@/components/navigation";

export const metadata: Metadata = {
  title: "About Us | AI Courtroom",
  description:
    "Learn about AI Courtroom, the AI-powered legal simulation platform designed to help you practice argumentation and understand legal procedures.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background pt-16">
      <Navigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 lg:py-32">
        <div className="container px-4 mx-auto text-center relative z-10">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-6 bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
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
      <section className="py-20 bg-card/30">
        <div className="container px-4 mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-6 text-blue-600 font-bold text-xl">
                1
              </div>
              <h3 className="text-xl font-semibold mb-3">Choose Your Case</h3>
              <p className="text-muted-foreground">
                Select from a variety of generated civil or criminal cases, or
                generate a completely new scenario tailored to specific legal
                topics.
              </p>
            </div>
            {/* Step 2 */}
            <div className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-6 text-indigo-600 font-bold text-xl">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3">Argue Your Case</h3>
              <p className="text-muted-foreground">
                Step into the role of the lawyer. Present your opening
                statement, cross-examine AI-generated parties, and draft
                compelling arguments.
              </p>
            </div>
            {/* Step 3 */}
            <div className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mb-6 text-purple-600 font-bold text-xl">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3">Get the Verdict</h3>
              <p className="text-muted-foreground">
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
          <h2 className="text-3xl font-bold text-center mb-16">
            Platform Features
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<Brain className="h-6 w-6 text-pink-500" />}
              title="AI-Powered Parties"
              description="Interact with realistic AI characters (applicants, respondents) who have unique backstories and personalities."
            />
            <FeatureCard
              icon={<Gavel className="h-6 w-6 text-amber-500" />}
              title="Instant Verdicts"
              description="No waiting for weeks. The AI Judge analyzes your arguments against legal principles instantly."
            />
            <FeatureCard
              icon={<MessageSquare className="h-6 w-6 text-green-500" />}
              title="Real-time Chat"
              description="Conduct investigations by chatting naturally with involved parties to uncover evidence."
            />
            <FeatureCard
              icon={<Scale className="h-6 w-6 text-blue-500" />}
              title="Legal Skill Building"
              description="Designed specifically to help law students and enthusiasts practice argumentation and logic."
            />
          </div>
        </div>
      </section>

      {/* Footer / CTA Section */}
      <footer className="bg-card border-t border-border py-12 mt-12">
        <div className="container px-4 mx-auto text-center">
          <h2 className="text-2xl font-bold mb-6">
            Ready to enter the courtroom?
          </h2>
          <div className="flex justify-center gap-4 mb-12">
            <Link
              href="/register"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-full transition-colors"
            >
              Start for Free
            </Link>
            <Link
              href="/login"
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold py-2 px-6 rounded-full transition-colors"
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
                href="/contact"
                className="hover:text-foreground transition-colors underline underline-offset-4"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors group">
      <div className="mb-4 p-3 bg-secondary rounded-lg w-fit group-hover:bg-primary/10 transition-colors">
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
