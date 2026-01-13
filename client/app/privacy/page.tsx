import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  Cookie,
  Eye,
  Lock,
  Mail,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how AI Courtroom protects your privacy and handles your data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="space-y-2 mb-12">
          <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-muted-foreground">
            Last updated: January 13, 2026
          </p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-12">
          {/* Introduction */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold m-0">
                Our Commitment to Privacy
              </h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              At AI Courtroom, we are committed to protecting your privacy. This
              policy explains how we collect, use, and safeguard your personal
              information when you use our AI-powered legal simulation platform.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Eye className="h-5 w-5 text-blue-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">
                Information We Collect
              </h2>
            </div>
            <div className="space-y-4 text-muted-foreground">
              <p>We collect information that you provide directly to us:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong>Account Information:</strong> Name, email address, and
                  profile details
                </li>
                <li>
                  <strong>Case Data:</strong> Legal cases and arguments you
                  create on our platform
                </li>
                <li>
                  <strong>Usage Data:</strong> How you interact with our
                  services
                </li>
                <li>
                  <strong>Device Information:</strong> Browser type, operating
                  system, and IP address
                </li>
              </ul>
            </div>
          </section>

          {/* Cookies */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Cookie className="h-5 w-5 text-amber-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">Cookies & Tracking</h2>
            </div>
            <div className="space-y-4 text-muted-foreground">
              <p>We use cookies and similar technologies for:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong>Essential Cookies:</strong> Required for the platform
                  to function
                </li>
                <li>
                  <strong>Analytics Cookies:</strong> Help us understand how you
                  use our service
                </li>
                <li>
                  <strong>Preference Cookies:</strong> Remember your settings
                  and preferences
                </li>
              </ul>
              <p>
                You can manage your cookie preferences at any time through your
                browser settings or our cookie consent banner.
              </p>
            </div>
          </section>

          {/* How We Use Your Information */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Users className="h-5 w-5 text-green-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">
                How We Use Your Information
              </h2>
            </div>
            <div className="space-y-4 text-muted-foreground">
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Provide and improve our AI legal simulation services</li>
                <li>Personalize your experience on the platform</li>
                <li>Send important updates and notifications</li>
                <li>Analyze usage patterns to enhance our features</li>
                <li>Ensure platform security and prevent fraud</li>
              </ul>
            </div>
          </section>

          {/* Data Security */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Lock className="h-5 w-5 text-purple-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">Data Security</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your
              data, including encryption, secure servers, and regular security
              audits. Your case data and personal information are stored
              securely and accessed only by authorized personnel.
            </p>
          </section>

          {/* Contact */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <Mail className="h-5 w-5 text-rose-500" />
              </div>
              <h2 className="text-2xl font-semibold m-0">Contact Us</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this privacy policy or how we handle
              your data, please contact us through our{" "}
              <Link href="/contact" className="text-primary hover:underline">
                feedback page
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
