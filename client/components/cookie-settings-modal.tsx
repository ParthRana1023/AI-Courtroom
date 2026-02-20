"use client";

import { useCookieConsent } from "@/contexts/cookie-consent-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import type { CookieCategory } from "@/lib/cookies";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CookieCategoryInfo {
  id: CookieCategory;
  name: string;
  description: string;
  required: boolean;
}

const cookieCategories: CookieCategoryInfo[] = [
  {
    id: "essential",
    name: "Essential Cookies",
    description:
      "These cookies are necessary for the website to function properly. They enable core functionality such as authentication, security, and accessibility. These cookies cannot be disabled.",
    required: true,
  },
  {
    id: "functional",
    name: "Functional Cookies",
    description:
      "These cookies enable personalized features like remembering your preferences (theme, text size, etc.) and providing enhanced functionality. Without these, some features may not work properly.",
    required: false,
  },
  {
    id: "analytics",
    name: "Analytics Cookies",
    description:
      "These cookies help us understand how visitors interact with our website by collecting anonymous data. This information helps us improve our services and user experience.",
    required: false,
  },
  {
    id: "marketing",
    name: "Marketing Cookies",
    description:
      "These cookies are used to track visitors across websites and display relevant advertisements. They help us measure the effectiveness of our marketing campaigns.",
    required: false,
  },
];

interface CookieSettingsModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CookieSettingsModal({
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: CookieSettingsModalProps = {}) {
  const {
    consent,
    showSettings,
    closeSettings,
    updateConsent,
    acceptAll,
    rejectAll,
  } = useCookieConsent();

  // Use external control if provided, otherwise use context
  const isOpen = externalOpen !== undefined ? externalOpen : showSettings;
  const handleOpenChange = (open: boolean) => {
    if (externalOnOpenChange) {
      externalOnOpenChange(open);
    }
    if (!open) {
      closeSettings();
    }
  };

  // Local state for pending changes
  const [pendingConsent, setPendingConsent] = useState({
    functional: consent.functional,
    analytics: consent.analytics,
    marketing: consent.marketing,
  });

  // Sync with actual consent when modal opens
  useEffect(() => {
    if (isOpen) {
      setPendingConsent({
        functional: consent.functional,
        analytics: consent.analytics,
        marketing: consent.marketing,
      });
    }
  }, [isOpen, consent]);

  const handleToggle = (category: CookieCategory) => {
    if (category === "essential") return; // Cannot toggle essential

    setPendingConsent((prev) => ({
      ...prev,
      [category]: !prev[category as keyof typeof prev],
    }));
  };

  const handleSave = () => {
    updateConsent(pendingConsent);
    handleOpenChange(false);
  };

  const handleAcceptAll = () => {
    acceptAll();
    handleOpenChange(false);
  };

  const handleRejectAll = () => {
    rejectAll();
    handleOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-lg">
        <ScrollArea className="max-h-[calc(85vh-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">🍪</span>
              Cookie Preferences
            </DialogTitle>
            <DialogDescription>
              Manage your cookie preferences below. You can enable or disable
              different categories of cookies. Essential cookies are always
              enabled as they are required for the website to function.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {cookieCategories.map((category) => {
              const isEnabled =
                category.id === "essential"
                  ? true
                  : pendingConsent[category.id as keyof typeof pendingConsent];

              return (
                <div
                  key={category.id}
                  className="flex items-start gap-4 rounded-lg border border-border p-4"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {category.name}
                      </span>
                      {category.required && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {category.description}
                    </p>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={`Toggle ${category.name}`}
                    disabled={category.required}
                    onClick={() => handleToggle(category.id)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                      isEnabled ? "bg-primary" : "bg-input"
                    }`}
                  >
                    <span
                      className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                        isEnabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleRejectAll}
              className="sm:mr-auto"
            >
              Reject All
            </Button>
            <Button variant="outline" onClick={handleAcceptAll}>
              Accept All
            </Button>
            <Button onClick={handleSave}>Save Preferences</Button>
          </DialogFooter>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
