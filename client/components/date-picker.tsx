"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

type ViewMode = "year" | "month" | "day";

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  minYear?: number;
  maxYear?: number;
  label?: string;
  error?: string;
  labelBg?: string;
  id?: string;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function DatePicker({
  value,
  onChange,
  minYear = 1900,
  maxYear = new Date().getFullYear(),
  label = "Date of Birth",
  error,
  labelBg = "bg-white dark:bg-zinc-900",
  id = "date-picker",
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [selectedYear, setSelectedYear] = useState<number | null>(
    value?.getFullYear() ?? null
  );
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    value?.getMonth() ?? null
  );
  const [selectedDay, setSelectedDay] = useState<number | null>(
    value?.getDate() ?? null
  );
  const [yearRangeStart, setYearRangeStart] = useState(
    Math.floor((value?.getFullYear() ?? maxYear - 11) / 12) * 12
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const hasValue = value instanceof Date && !isNaN(value.getTime());
  const isFloating = isOpen || hasValue;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync with external value
  useEffect(() => {
    if (value && !isNaN(value.getTime())) {
      setSelectedYear(value.getFullYear());
      setSelectedMonth(value.getMonth());
      setSelectedDay(value.getDate());
    }
  }, [value]);

  const handleYearSelect = (year: number) => {
    setSelectedYear(year);
    setViewMode("month");
  };

  const handleMonthSelect = (month: number) => {
    setSelectedMonth(month);
    setViewMode("day");
  };

  const handleDaySelect = (day: number) => {
    setSelectedDay(day);
    if (selectedYear !== null && selectedMonth !== null) {
      const newDate = new Date(selectedYear, selectedMonth, day);
      onChange(newDate);
      setIsOpen(false);
    }
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const formatDisplayValue = () => {
    if (hasValue) {
      return value.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return "";
  };

  // Generate years for the current range (12 years at a time)
  const years = Array.from({ length: 12 }, (_, i) => yearRangeStart + i).filter(
    (y) => y >= minYear && y <= maxYear
  );

  // Generate days for the selected month
  const renderDays = () => {
    if (selectedYear === null || selectedMonth === null) return null;

    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
    const firstDay = getFirstDayOfMonth(selectedYear, selectedMonth);
    const days = [];

    // Add empty cells for days before the first day
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-9 h-9" />);
    }

    // Add day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected =
        hasValue &&
        day === value.getDate() &&
        selectedMonth === value.getMonth() &&
        selectedYear === value.getFullYear();

      const isToday =
        day === new Date().getDate() &&
        selectedMonth === new Date().getMonth() &&
        selectedYear === new Date().getFullYear();

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => handleDaySelect(day)}
          className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-200
            ${
              isSelected
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                : isToday
                ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
            }`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Input Field */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
          <Calendar
            className={`h-5 w-5 transition-colors duration-200 ${
              isOpen ? "text-blue-500 dark:text-blue-400" : "text-zinc-400"
            }`}
          />
        </div>
        <button
          id={id}
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setViewMode("year");
            }
          }}
          className={`
            peer w-full px-4 py-3 pl-10
            border-2 rounded-lg
            bg-transparent
            text-zinc-900 dark:text-white
            text-left
            outline-none
            transition-colors duration-200
            ${
              error
                ? "border-red-500 dark:border-red-500"
                : isOpen
                ? "border-blue-500 dark:border-blue-400"
                : "border-zinc-300 dark:border-zinc-600"
            }
          `}
        >
          {formatDisplayValue() || " "}
        </button>
        <label
          htmlFor={id}
          className={`
            absolute pointer-events-none
            transition-all duration-200 ease-out
            px-1 left-8
            ${
              isFloating
                ? `-top-2.5 text-xs ${labelBg}`
                : "top-1/2 -translate-y-1/2 text-base"
            }
            ${
              error
                ? "text-red-500 dark:text-red-400"
                : isOpen
                ? "text-blue-500 dark:text-blue-400"
                : "text-zinc-500 dark:text-zinc-400"
            }
          `}
        >
          {label}
        </label>
      </div>

      {/* Error Message */}
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full min-w-[280px] bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                if (viewMode === "year") {
                  setYearRangeStart((prev) => Math.max(minYear, prev - 12));
                } else if (viewMode === "month") {
                  setViewMode("year");
                } else if (viewMode === "day") {
                  setViewMode("month");
                }
              }}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (viewMode === "day") setViewMode("month");
                else if (viewMode === "month") setViewMode("year");
              }}
              className="font-semibold text-zinc-800 dark:text-white hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              {viewMode === "year" &&
                `${yearRangeStart}-${Math.min(yearRangeStart + 11, maxYear)}`}
              {viewMode === "month" && selectedYear}
              {viewMode === "day" &&
                selectedYear !== null &&
                selectedMonth !== null &&
                `${FULL_MONTHS[selectedMonth]} ${selectedYear}`}
            </button>

            <button
              type="button"
              onClick={() => {
                if (viewMode === "year") {
                  setYearRangeStart((prev) =>
                    Math.min(maxYear - 11, prev + 12)
                  );
                } else if (viewMode === "month" && selectedYear !== null) {
                  setSelectedYear(Math.min(maxYear, selectedYear + 1));
                } else if (
                  viewMode === "day" &&
                  selectedYear !== null &&
                  selectedMonth !== null
                ) {
                  if (selectedMonth === 11) {
                    if (selectedYear < maxYear) {
                      setSelectedYear(selectedYear + 1);
                      setSelectedMonth(0);
                    }
                  } else {
                    setSelectedMonth(selectedMonth + 1);
                  }
                }
              }}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-3">
            {/* Year Selection */}
            {viewMode === "year" && (
              <div className="grid grid-cols-3 gap-2">
                {years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => handleYearSelect(year)}
                    className={`py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${
                        year === selectedYear
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                      }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}

            {/* Month Selection */}
            {viewMode === "month" && (
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((month, index) => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => handleMonthSelect(index)}
                    className={`py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${
                        index === selectedMonth &&
                        selectedYear === value?.getFullYear()
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                      }`}
                  >
                    {month}
                  </button>
                ))}
              </div>
            )}

            {/* Day Selection */}
            {viewMode === "day" && (
              <div>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                    <div
                      key={day}
                      className="w-9 h-9 flex items-center justify-center text-xs font-medium text-zinc-500 dark:text-zinc-400"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1">{renderDays()}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
