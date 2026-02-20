"use client";

import Link from "next/link";
import Navigation from "@/components/navigation";
import { Shield, Cookie, Eye, Lock, Mail, Users, Sparkles } from "lucide-react";
import { HexagonBackground } from "@/components/animate-ui/components/backgrounds/hexagon";

export default function PrivacyPage() {
  return (
    <HexagonBackground className="min-h-screen flex flex-col p-0 pt-16">
      <Navigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 lg:py-28">
        <div className="container px-4 mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-sm font-medium mb-8">
            <Shield className="h-4 w-4" />
            Your Data, Your Rights
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl mb-6 bg-linear-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Privacy Policy
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            We are committed to protecting your privacy and keeping your data
            safe. Here's everything you need to know.
          </p>
          <p className="text-sm text-muted-foreground/60 mt-4">
            Last updated: January 13, 2026
          </p>
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-purple-500/10 blur-[100px] -z-10 rounded-full" />
      </section>

      {/* Policy Content */}
      <section className="py-16">
        <div className="container px-4 mx-auto max-w-4xl space-y-8">
          <PolicyCard
            icon={<Shield className="h-5 w-5" />}
            iconColor="text-purple-500"
            iconBg="bg-purple-500/10"
            title="Our Commitment to Privacy"
          >
            <p className="text-muted-foreground leading-relaxed">
              At AI Courtroom, we are committed to protecting your privacy. This
              policy explains how we collect, use, and safeguard your personal
              information when you use our AI-powered legal simulation platform.
            </p>
          </PolicyCard>

          <PolicyCard
            icon={<Eye className="h-5 w-5" />}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
            title="Information We Collect"
          >
            <p className="text-muted-foreground mb-4">
              We collect information that you provide directly to us:
            </p>
            <div className="grid gap-3">
              <InfoItem
                label="Account Information"
                desc="Name, email address, and profile details"
              />
              <InfoItem
                label="Case Data"
                desc="Legal cases and arguments you create on our platform"
              />
              <InfoItem
                label="Usage Data"
                desc="How you interact with our services"
              />
              <InfoItem
                label="Device Information"
                desc="Browser type, operating system, and IP address"
              />
            </div>
          </PolicyCard>

          <PolicyCard
            icon={<Cookie className="h-5 w-5" />}
            iconColor="text-amber-500"
            iconBg="bg-amber-500/10"
            title="Cookies & Tracking"
          >
            <p className="text-muted-foreground mb-4">
              We use cookies and similar technologies for:
            </p>
            <div className="grid gap-3">
              <InfoItem
                label="Essential Cookies"
                desc="Required for the platform to function"
              />
              <InfoItem
                label="Analytics Cookies"
                desc="Help us understand how you use our service"
              />
              <InfoItem
                label="Preference Cookies"
                desc="Remember your settings and preferences"
              />
            </div>
            <p className="text-muted-foreground mt-4 text-sm">
              You can manage your cookie preferences at any time through your
              browser settings or our cookie consent banner.
            </p>
          </PolicyCard>

          <PolicyCard
            icon={<Users className="h-5 w-5" />}
            iconColor="text-green-500"
            iconBg="bg-green-500/10"
            title="How We Use Your Information"
          >
            <p className="text-muted-foreground mb-4">
              We use the information we collect to:
            </p>
            <div className="grid gap-3">
              <InfoItem
                label="Service Improvement"
                desc="Provide and improve our AI legal simulation services"
              />
              <InfoItem
                label="Personalization"
                desc="Personalize your experience on the platform"
              />
              <InfoItem
                label="Communication"
                desc="Send important updates and notifications"
              />
              <InfoItem
                label="Analytics"
                desc="Analyze usage patterns to enhance our features"
              />
              <InfoItem
                label="Security"
                desc="Ensure platform security and prevent fraud"
              />
            </div>
          </PolicyCard>

          <PolicyCard
            icon={<Lock className="h-5 w-5" />}
            iconColor="text-indigo-500"
            iconBg="bg-indigo-500/10"
            title="Data Security"
          >
            <p className="text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your
              data, including encryption, secure servers, and regular security
              audits. Your case data and personal information are stored
              securely and accessed only by authorized personnel.
            </p>
          </PolicyCard>

          <PolicyCard
            icon={<Mail className="h-5 w-5" />}
            iconColor="text-rose-500"
            iconBg="bg-rose-500/10"
            title="Contact Us"
          >
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this privacy policy or how we handle
              your data, please contact us through our{" "}
              <Link
                href="/contact"
                className="text-blue-500 hover:text-blue-600 underline underline-offset-4 transition-colors"
              >
                feedback page
              </Link>
              .
            </p>
          </PolicyCard>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card/80 backdrop-blur-sm border-t border-border py-12 mt-auto">
        <div className="container px-4 mx-auto text-center">
          <div className="flex flex-col md:flex-row justify-center items-center gap-6 text-sm text-muted-foreground max-w-2xl mx-auto">
            <p>
              © {new Date().getFullYear()} AI Courtroom. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link
                href="/about"
                className="hover:text-foreground transition-colors underline underline-offset-4"
              >
                About
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

function PolicyCard({
  icon,
  iconColor,
  iconBg,
  title,
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card/80 backdrop-blur-sm p-8 rounded-2xl border border-border hover:border-blue-500/20 transition-all duration-300 hover:shadow-lg">
      <div className="flex items-center gap-3 mb-5">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <div className={iconColor}>{icon}</div>
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoItem({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
      <div>
        <span className="font-medium text-foreground">{label}:</span>{" "}
        <span className="text-muted-foreground">{desc}</span>
      </div>
    </div>
  );
}
