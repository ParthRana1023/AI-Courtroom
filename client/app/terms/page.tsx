import Navigation from "@/components/navigation";

export const metadata = {
  title: "Terms of Service | AI Courtroom",
  description:
    "Terms of Service for AI Courtroom. Read our rules and regulations regarding the use of our AI-powered legal simulation platform.",
};

export default function TermsOfService() {
  const lastUpdated = "January 15, 2026";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 transition-colors duration-300">
      <Navigation />
      <div className="h-16" /> {/* Spacer for fixed navigation */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-800 p-8 md:p-12">
          {/* Header */}
          <div className="border-b border-gray-200 dark:border-zinc-800 pb-8 mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Terms of Service
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Last Updated: {lastUpdated}
            </p>
          </div>

          {/* Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-blue-600 dark:prose-a:text-blue-400">
            <section className="mb-8">
              <h2>1. Agreement to Terms</h2>
              <p>
                By accessing or using AI Courtroom ("the Platform"), you agree
                to be bound by these Terms of Service and our Privacy Policy. If
                you disagree with any part of these terms, you may not access
                the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2>2. Description of Service</h2>
              <p>
                AI Courtroom is an educational platform designed to simulate
                legal proceedings using Artificial Intelligence. It provides
                users with simulated courtroom scenarios, case management tools,
                and AI-generated legal interactions for training and educational
                purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2>3. Important Legal Disclaimer</h2>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 my-4 rounded-r-lg">
                <p className="font-medium text-yellow-800 dark:text-yellow-200 m-0">
                  AI COURTROOM IS NOT A LAW FIRM AND DOES NOT PROVIDE LEGAL
                  ADVICE.
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 m-0">
                  The content, simulations, and AI responses provided on this
                  platform are for educational and entertainment purposes only.
                  Do not rely on this information as a substitute for
                  professional legal advice, diagnosis, or treatment. Always
                  consult with a qualified attorney for your specific legal
                  needs.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2>4. User Accounts</h2>
              <p>
                To access certain features of the Platform, you may be required
                to create an account. You are responsible for maintaining the
                confidentiality of your account credentials and for all
                activities that occur under your account. You agree to provide
                accurate and complete information during the registration
                process.
              </p>
            </section>

            <section className="mb-8">
              <h2>5. User Conduct</h2>
              <p>You agree not to use the Platform to:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li> Violate any applicable laws or regulations. </li>
                <li> Infringe upon the rights of others. </li>
                <li>
                  Harass, abuse, or harm another person or group, including AI
                  agents.
                </li>
                <li>
                  Interfere with or disrupt the security or performance of the
                  Platform.
                </li>
                <li>
                  {" "}
                  Attempt to reverse engineer or scrape data from the Service.{" "}
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2>6. Intellectual Property</h2>
              <p>
                The Service and its original content (excluding user-generated
                content), features, and functionality are and will remain the
                exclusive property of AI Courtroom and its licensors. The
                Service is protected by copyright, trademark, and other laws.
              </p>
            </section>

            <section className="mb-8">
              <h2>7. Limitation of Liability</h2>
              <p>
                In no event shall AI Courtroom, its directors, employees,
                partners, agents, suppliers, or affiliates, be liable for any
                indirect, incidental, special, consequential, or punitive
                damages, including without limitation, loss of profits, data,
                use, goodwill, or other intangible losses, resulting from your
                access to or use of or inability to access or use the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2>8. Changes to Terms</h2>
              <p>
                We reserve the right to modify or replace these Terms at any
                time. We will provide notice of any significant changes by
                posting the new Terms on this page. Your continued use of the
                Service after any such changes constitutes your acceptance of
                the new Terms.
              </p>
            </section>

            <section>
              <h2>9. Contact Us</h2>
              <p>
                If you have any questions about these Terms, please contact us
                at:
              </p>
              <p>
                <a href="mailto:support@aicourtroom.com">
                  support@aicourtroom.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      {/* Footer */}
      <footer className="bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} AI Courtroom. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
