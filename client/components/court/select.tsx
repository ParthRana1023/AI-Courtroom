"use client";

import { Select as RadixSelect } from "radix-ui";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Accessible name when no <label htmlFor> points at `id`. */
  "aria-label"?: string;
  /** Styles for the closed control; it should match the form's inputs. */
  className?: string;
}

/**
 * The paper dropdown (ac-ui.js): every <select> in the app uses this.
 * Paper popover, 46px rows, ✓ and a shaded row for the current option, full keyboard support.
 */
export default function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  invalid,
  className,
  ...aria
}: SelectProps) {
  return (
    <RadixSelect.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        aria-label={aria["aria-label"]}
        aria-invalid={invalid || undefined}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 text-left outline-none disabled:cursor-not-allowed data-placeholder:text-[#857661]",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon aria-hidden="true" className="flex-none text-[9px] text-ink-muted">
          ▾
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-200 max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[max(var(--radix-select-trigger-width),230px)] overflow-hidden bg-paper py-1.5 text-ink shadow-[0_20px_50px_rgba(0,0,0,.45)]"
        >
          <RadixSelect.Viewport data-scroller="">
            {options.map((o, i) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className={cn(
                  "flex min-h-11.5 cursor-pointer items-center gap-3 px-4 font-type text-body leading-[1.3] outline-none data-disabled:cursor-default data-disabled:text-ink-disabled data-highlighted:bg-paper-hi data-highlighted:shadow-[inset_3px_0_0_#e0453a] data-[state=checked]:bg-paper-alt data-[state=checked]:text-seal",
                  i > 0 && "border-t border-ink/12",
                )}
              >
                <span aria-hidden="true" className="w-3.5 flex-none font-data text-meta font-bold text-seal">
                  <RadixSelect.ItemIndicator>✓</RadixSelect.ItemIndicator>
                </span>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
