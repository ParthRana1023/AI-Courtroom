"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { useCookieConsent } from "@/contexts/cookie-consent-context";
import type { CookieCategory } from "@/lib/cookies";
import { buttonClass } from "@/components/court/button";
import { cn } from "@/lib/utils";

type Optional = Exclude<CookieCategory, "essential">;

const CATEGORIES: { id: CookieCategory; name: string; desc: string }[] = [
  {
    id: "essential",
    name: "Essential Cookies",
    desc: "These cookies are necessary for the website to function properly. They enable core functionality such as authentication, security, and accessibility. These cookies cannot be disabled.",
  },
  {
    id: "functional",
    name: "Functional Cookies",
    desc: "These cookies enable personalized features like remembering your preferences (theme, text size, etc.) and providing enhanced functionality. Without these, some features may not work properly.",
  },
  {
    id: "analytics",
    name: "Analytics Cookies",
    desc: "These cookies help us understand how visitors interact with our website by collecting anonymous data. This information helps us improve our services and user experience.",
  },
  {
    id: "marketing",
    name: "Marketing Cookies",
    desc: "These cookies are used to measure the effectiveness of our marketing campaigns. They are only set if you allow them.",
  },
];

const strip =
  "flex justify-between gap-3 px-[22px] font-type text-label font-bold uppercase tracking-[0.2em] text-ink-label";

export default function CookieConsent() {
  const {
    showBanner,
    showSettings,
    acceptAll,
    rejectAll,
    openSettings,
    closeSettings,
  } = useCookieConsent();

  return (
    <>
      {showBanner && (
        <div
          role="region"
          aria-label="Cookie consent"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] min-[560px]:px-4 min-[560px]:pb-4"
        >
          <div className="pointer-events-auto mx-auto flex max-w-[920px] flex-wrap items-center gap-x-7 gap-y-4 border-t-[3px] border-double border-ink bg-paper px-[22px] py-[18px] text-ink shadow-[0_-10px_60px_rgba(0,0,0,.7)] [animation:ac-slide-up_.3s_ease_both]">
            <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-1.5">
              <span className="font-type text-label font-bold uppercase tracking-[0.2em] text-seal">
                Notice · Cookies
              </span>
              <p role="heading" aria-level={2} className="m-0 font-display text-[1.375rem] leading-[1.15]">
                We value your privacy
              </p>
              <p className="m-0 text-pretty font-type text-sm leading-[1.55] text-ink-label">
                We use cookies to enhance your experience, analyze site traffic, and personalize
                content. You can customize your preferences or accept all cookies.{" "}
                <Link href="/cookies" className="border-b border-seal text-seal hover:text-ink">
                  Learn more in our Cookie Policy
                </Link>
              </p>
            </div>
            <div className="flex flex-[1_1_100%] flex-wrap gap-2 min-[560px]:flex-[0_0_auto]">
              <button type="button" onClick={openSettings} className={buttonClass("paper", "md", "flex-auto px-4")}>
                Customize
              </button>
              <button type="button" onClick={rejectAll} className={buttonClass("ink", "md", "flex-auto px-4")}>
                Reject All
              </button>
              <button type="button" onClick={acceptAll} className={buttonClass("seal", "md", "flex-auto px-4")}>
                Accept All
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog.Root open={showSettings} onOpenChange={(o) => !o && closeSettings()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-[rgba(7,5,4,.78)] [animation:ac-fade_.2s_ease_both]" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[81] flex max-h-[calc(100dvh-28px)] w-[calc(100%-28px)] max-w-[540px] -translate-x-1/2 -translate-y-1/2 flex-col bg-paper text-ink shadow-[0_40px_90px_rgba(0,0,0,.8)] outline-none"
          >
            <PreferencesForm />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

// Mounted only while the dialog is open, so the switches always start from the saved consent.
function PreferencesForm() {
  const { consent, acceptAll, rejectAll, updateConsent } = useCookieConsent();
  const [pending, setPending] = useState<Record<Optional, boolean>>({
    functional: consent.functional,
    analytics: consent.analytics,
    marketing: consent.marketing,
  });

  return (
    <>
              <div className={cn(strip, "border-b-[3px] border-double border-ink pb-2.5 pt-3.5")}>
                <span>Form K-2</span>
                <span>Cookie preferences</span>
              </div>
              <div data-scroller="" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[22px] pb-2 pt-[18px]">
                <Dialog.Title className="m-0 font-display text-h2 font-normal leading-[1.15]">
                  Cookie Preferences
                </Dialog.Title>
                <p className="m-0 text-pretty font-type text-sm leading-[1.55] text-ink-label">
                  Manage your cookie preferences below. You can enable or disable different
                  categories of cookies. Essential cookies are always enabled as they are required for
                  the website to function.
                </p>
                <div className="flex flex-col">
                  {CATEGORIES.map((c) => {
                    const required = c.id === "essential";
                    const on = required || pending[c.id as Optional];
                    return (
                      <div key={c.id} className="flex items-start justify-between gap-4 border-t border-ink/15 py-3.5">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2.5">
                            <span className="font-type text-body font-bold">{c.name}</span>
                            {required && (
                              <span className="border-[1.5px] border-ink-label px-[7px] pb-px pt-0.5 font-type text-[0.625rem] font-bold uppercase tracking-[0.14em] text-ink-label">
                                Required
                              </span>
                            )}
                          </span>
                          <span className="text-pretty font-type text-[0.84375rem] leading-[1.5] text-ink-muted">
                            {c.desc}
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`Toggle ${c.name}`}
                          disabled={required}
                          onClick={() =>
                            setPending((p) => ({ ...p, [c.id]: !p[c.id as Optional] }))
                          }
                          className={cn(
                            "relative mt-0.5 h-7 w-[50px] flex-none cursor-pointer border-2 p-0 disabled:cursor-not-allowed",
                            required ? "border-ink-hint" : "border-ink",
                            on ? (required ? "bg-ink-hint" : "bg-ink") : "bg-transparent",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute top-[3px] h-[18px] w-[18px] transition-[left] duration-200",
                              on ? "left-[25px] bg-paper" : "left-[3px] bg-ink",
                            )}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t-[3px] border-double border-ink px-[22px] pb-[18px] pt-3.5">
                <button type="button" onClick={rejectAll} className={buttonClass("paper", "md", "flex-auto px-3.5")}>
                  Reject All
                </button>
                <button type="button" onClick={acceptAll} className={buttonClass("paper", "md", "flex-auto px-3.5")}>
                  Accept All
                </button>
                <button
                  type="button"
                  onClick={() => updateConsent(pending)}
                  className={buttonClass("seal", "md", "flex-auto px-4")}
                >
                  Save Preferences
                </button>
              </div>
    </>
  );
}
