"use client";

import React, { useState, forwardRef } from "react";
import type { LucideIcon } from "lucide-react";

interface FloatingLabelInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: LucideIcon;
  error?: string;
  labelBg?: string;
}

const FloatingLabelInput = forwardRef<
  HTMLInputElement,
  FloatingLabelInputProps
>(
  (
    {
      label,
      icon: Icon,
      error,
      className,
      id,
      value,
      labelBg = "bg-white dark:bg-zinc-900",
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined && value !== "";
    const isFloating = isFocused || hasValue;

    return (
      <div className="relative">
        <div className="relative">
          {Icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
              <Icon
                className={`h-5 w-5 transition-colors duration-200 ${
                  isFocused
                    ? "text-blue-500 dark:text-blue-400"
                    : "text-zinc-400"
                }`}
              />
            </div>
          )}
          <input
            ref={ref}
            id={id}
            value={value}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            className={`
              peer w-full px-4 py-3
              ${Icon ? "pl-10" : "pl-4"}
              border-2 rounded-lg
              bg-transparent
              text-zinc-900 dark:text-white
              outline-none
              transition-colors duration-200
              ${
                error
                  ? "border-red-500 dark:border-red-500"
                  : isFocused
                  ? "border-blue-500 dark:border-blue-400"
                  : "border-zinc-300 dark:border-zinc-600"
              }
              ${
                props.disabled
                  ? "bg-zinc-100 dark:bg-zinc-800 cursor-not-allowed"
                  : ""
              }
              ${className || ""}
            `}
            placeholder=" "
            {...props}
          />
          <label
            htmlFor={id}
            className={`
              absolute pointer-events-none
              transition-all duration-200 ease-out
              px-1
              ${
                isFloating
                  ? `${Icon ? "left-8" : "left-3"} -top-2.5 text-xs ${labelBg}`
                  : `${
                      Icon ? "left-10" : "left-4"
                    } top-1/2 -translate-y-1/2 text-base`
              }
              ${
                error
                  ? "text-red-500 dark:text-red-400"
                  : isFocused
                  ? "text-blue-500 dark:text-blue-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }
            `}
          >
            {label}
          </label>
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

FloatingLabelInput.displayName = "FloatingLabelInput";

export default FloatingLabelInput;
