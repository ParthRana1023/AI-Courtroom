"use client";

import Link from "next/link";
import Navigation from "@/components/navigation";
import { HexagonBackground } from "@/components/animate-ui/components/backgrounds/hexagon";
import {
  FileText,
  Scale,
  AlertTriangle,
  User,
  ShieldAlert,
  BookOpen,
  Pencil,
  Mail,
  Gavel,
} from "lucide-react";

export default function TermsOfService() {
  const lastUpdated = "January 15, 2026";

  return (
    <HexagonBackground className="min-h-screen flex flex-col p-0 pt-16">
      <Navigation />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 lg:py-28">
        <div className="container px-4 mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm font-medium mb-8">
            <FileText className="h-4 w-4" />
            Legal Agreement
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-6xl mb-6 bg-linear-to-r from-amber-500 via-orange-500 to-red-500 bg-clip-text text-transparent">
            Terms of Service
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Please read these terms carefully before using AI Courtroom. By
            using our platform, you agree to these terms.
          </p>
          <p className="text-sm text-muted-foreground/60 mt-4">
            Last Updated: {lastUpdated}
          </p>
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-amber-500/10 blur-[100px] -z-10 rounded-full" />
      </section>

      {/* Terms Content */}
      <section className="py-16">
        <div className="container px-4 mx-auto max-w-4xl space-y-8">
          <TermsCard
            icon={<Scale className="h-5 w-5" />}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
            number={1}
            title="Agreement to Terms"
          >
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using AI Courtroom (&quot;the Platform&quot;), you
              agree to be bound by these Terms of Service and our Privacy
              Policy. If you disagree with any part of these terms, you may not
              access the Service.
            </p>
          </TermsCard>

          <TermsCard
            icon={<Gavel className="h-5 w-5" />}
            iconColor="text-indigo-500"
            iconBg="bg-indigo-500/10"
            number={2}
            title="Description of Service"
          >
            <p className="text-muted-foreground leading-relaxed">
              AI Courtroom is an educational platform designed to simulate legal
              proceedings using Artificial Intelligence. It provides users with
              simulated courtroom scenarios, case management tools, and
              AI-generated legal interactions for training and educational
              purposes.
            </p>
          </TermsCard>

          <TermsCard
            icon={<AlertTriangle className="h-5 w-5" />}
            iconColor="text-amber-500"
            iconBg="bg-amber-500/10"
            number={3}
            title="Important Legal Disclaimer"
          >
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-5 rounded-xl">
              <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                ⚠️ AI COURTROOM IS NOT A LAW FIRM AND DOES NOT PROVIDE LEGAL
                ADVICE.
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                The content, simulations, and AI responses provided on this
                platform are for educational and entertainment purposes only. Do
                not rely on this information as a substitute for professional
                legal advice, diagnosis, or treatment. Always consult with a
                qualified attorney for your specific legal needs.
              </p>
            </div>
          </TermsCard>

          <TermsCard
            icon={<User className="h-5 w-5" />}
            iconColor="text-green-500"
            iconBg="bg-green-500/10"
            number={4}
            title="User Accounts"
          >
            <p className="text-muted-foreground leading-relaxed">
              To access certain features of the Platform, you may be required to
              create an account. You are responsible for maintaining the
              confidentiality of your account credentials and for all activities
              that occur under your account. You agree to provide accurate and
              complete information during the registration process.
            </p>
          </TermsCard>

          <TermsCard
            icon={<ShieldAlert className="h-5 w-5" />}
            iconColor="text-red-500"
            iconBg="bg-red-500/10"
            number={5}
            title="User Conduct"
          >
            <p className="text-muted-foreground mb-4">
              You agree not to use the Platform to:
            </p>
            <div className="grid gap-3">
              <ConductItem text="Violate any applicable laws or regulations" />
              <ConductItem text="Infringe upon the rights of others" />
              <ConductItem text="Harass, abuse, or harm another person or group, including AI agents" />
              <ConductItem text="Interfere with or disrupt the security or performance of the Platform" />
              <ConductItem text="Attempt to reverse engineer or scrape data from the Service" />
            </div>
          </TermsCard>

          <TermsCard
            icon={<BookOpen className="h-5 w-5" />}
            iconColor="text-purple-500"
            iconBg="bg-purple-500/10"
            number={6}
            title="Intellectual Property"
          >
            <p className="text-muted-foreground leading-relaxed">
              The Service and its original content (excluding user-generated
              content), features, and functionality are and will remain the
              exclusive property of AI Courtroom and its licensors. The Service
              is protected by copyright, trademark, and other laws.
            </p>
          </TermsCard>

          <TermsCard
            icon={<FileText className="h-5 w-5" />}
            iconColor="text-orange-500"
            iconBg="bg-orange-500/10"
            number={7}
            title="Limitation of Liability"
          >
            <p className="text-muted-foreground leading-relaxed">
              In no event shall AI Courtroom, its directors, employees,
              partners, agents, suppliers, or affiliates, be liable for any
              indirect, incidental, special, consequential, or punitive damages,
              including without limitation, loss of profits, data, use,
              goodwill, or other intangible losses, resulting from your access
              to or use of or inability to access or use the Service.
            </p>
          </TermsCard>

          <TermsCard
            icon={<Pencil className="h-5 w-5" />}
            iconColor="text-teal-500"
            iconBg="bg-teal-500/10"
            number={8}
            title="Changes to Terms"
          >
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify or replace these Terms at any time.
              We will provide notice of any significant changes by posting the
              new Terms on this page. Your continued use of the Service after
              any such changes constitutes your acceptance of the new Terms.
            </p>
          </TermsCard>

          <TermsCard
            icon={<Mail className="h-5 w-5" />}
            iconColor="text-rose-500"
            iconBg="bg-rose-500/10"
            number={9}
            title="Contact Us"
          >
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms, please reach out
              through our{" "}
              <Link
                href="/contact"
                className="text-blue-500 hover:text-blue-600 underline underline-offset-4 transition-colors"
              >
                feedback page
              </Link>
              .
            </p>
          </TermsCard>
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
    </HexagonBackground>
  );
}

function TermsCard({
  icon,
  iconColor,
  iconBg,
  number,
  title,
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card/80 backdrop-blur-sm p-8 rounded-2xl border border-border hover:border-amber-500/20 transition-all duration-300 hover:shadow-lg">
      <div className="flex items-center gap-3 mb-5">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <div className={iconColor}>{icon}</div>
        </div>
        <h2 className="text-xl font-bold">
          <span className="text-muted-foreground font-medium mr-1">
            {number}.
          </span>{" "}
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function ConductItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}
