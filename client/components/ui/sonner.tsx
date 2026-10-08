"use client";

import { Toaster as Sonner } from "sonner";

// Paper toast, bottom-centre. Pass `action: { label: "Undo", onClick }` for undoable actions.
const Toaster = () => (
  <Sonner
    position="bottom-center"
    duration={2600}
    offset={16}
    mobileOffset={12}
    toastOptions={{
      unstyled: true,
      classNames: {
        toast:
          "flex w-full max-w-140 items-center gap-4 bg-paper px-4 py-2.5 font-type text-sm leading-[1.4] text-ink shadow-toast",
        title: "flex-1",
        description: "text-ink-muted",
        actionButton:
          "ml-auto h-10 flex-none cursor-pointer border-0 bg-ink px-3.5 font-type text-xs font-bold uppercase tracking-[0.14em] text-paper hover:bg-ink-label",
        error: "border-l-4 border-error",
        icon: "hidden",
      },
    }}
  />
);

export { Toaster };
