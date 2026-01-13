"use client";

import { useCookieConsent } from "@/contexts/cookie-consent-context";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export default function CookieConsentBanner() {
  const { showBanner, acceptAll, rejectAll, openSettings } = useCookieConsent();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (showBanner) {
      // Small delay for mount animation
      const timer = setTimeout(() => {
        setIsAnimating(true);
        setIsVisible(true);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setIsAnimating(true);
      setIsVisible(false);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

  if (!showBanner && !isAnimating) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 p-4 transition-transform duration-300 ease-in-out ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-4xl rounded-lg border border-border bg-background/95 p-6 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Content */}
          <div className="flex-1 space-y-2">
            <p
              className="text-lg font-semibold text-foreground"
              role="heading"
              aria-level={2}
            >
              🍪 We value your privacy
            </p>
            <p className="text-sm text-muted-foreground">
              We use cookies to enhance your experience, analyze site traffic,
              and personalize content. You can customize your preferences or
              accept all cookies.{" "}
              <a
                href="/privacy"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Learn more about our privacy policy
              </a>
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={openSettings}
              className="whitespace-nowrap"
            >
              Customize
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={rejectAll}
              className="whitespace-nowrap"
            >
              Reject All
            </Button>
            <Button
              size="sm"
              onClick={acceptAll}
              className="whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Accept All
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
