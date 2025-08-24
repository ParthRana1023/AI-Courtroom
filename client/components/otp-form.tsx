import React from "react";
import { AlertCircle } from "lucide-react";

interface OtpFormProps {
  otp: string[];
  setOtp: (otp: string[]) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  error?: string;
  successMessage?: string;
  title: string;
  description: string;
  onRequestAgain: () => void;
}

export default function OtpForm({
  otp,
  setOtp,
  handleSubmit,
  isLoading,
  error,
  onRequestAgain,
  successMessage,
  title,
  description,
}: OtpFormProps) {
  const [resendTimer, setResendTimer] = React.useState(30); // Initialize with 30 to display timer on load

  React.useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => {
        setResendTimer(resendTimer - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleRequestAgainClick = async () => {
    await onRequestAgain();
    setResendTimer(30); // Start a 30-second timer
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center dark:bg-red-900 dark:border-red-700 dark:text-red-200">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 flex items-center dark:bg-green-900 dark:border-green-700 dark:text-green-200">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="flex justify-center space-x-2">
          {otp.map((digit, index) => (
            <input
              key={index}
              type="tel"
              value={digit}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, ""); // Filter out non-digits

                // If the value is not a single digit, it might be a paste event or invalid input.
                // In a controlled component, this should ideally not happen for single character input.
                // If it's a paste, onPaste should handle it.
                if (value.length !== 1 && value.length !== 0) {
                  // Allow empty string for backspace/delete
                  return; // Ignore multi-character input in onChange
                }

                const newOtp = [...otp];
                // Handle single digit input
                newOtp[index] = value;
                setOtp(newOtp);
                // Move to next input if a digit is entered
                if (value && index < otp.length - 1) {
                  const nextInput = document.getElementById(`otp-${index + 1}`);
                  nextInput?.focus();
                }
              }}
              onPaste={(e) => {
                e.preventDefault(); // Prevent default paste behavior
                const pastedData = e.clipboardData.getData("text");
                const filteredPastedData = pastedData.replace(/[^0-9]/g, ""); // Keep only digits

                const newOtp = [...otp];
                for (let i = 0; i < filteredPastedData.length; i++) {
                  if (index + i < otp.length) {
                    newOtp[index + i] = filteredPastedData[i];
                  }
                }
                setOtp(newOtp);

                // Move focus to the next input field after pasting
                const targetIndex = Math.min(
                  index + filteredPastedData.length,
                  otp.length - 1
                );
                const targetInput = document.getElementById(
                  `otp-${targetIndex}`
                );
                targetInput?.focus();
              }}
              onKeyDown={(e) => {
                // Allow only digits, backspace, delete, tab, escape, enter, and arrow keys
                // Allow Ctrl+C (copy) and Ctrl+V (paste) combinations
                if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v')) {
                  return; // Allow the default behavior for copy/paste
                }

                // Allow only digits, backspace, delete, tab, escape, enter, and arrow keys
                if (
                  !/[0-9]/.test(e.key) &&
                  e.key !== "Backspace" &&
                  e.key !== "Delete" &&
                  e.key !== "Tab" &&
                  e.key !== "Escape" &&
                  e.key !== "Enter" &&
                  e.key !== "ArrowLeft" &&
                  e.key !== "ArrowRight"
                ) {
                  e.preventDefault();
                }

                if (e.key === "Backspace" && !otp[index] && index > 0) {
                  // If backspace is pressed and current field is empty, move to previous
                  e.preventDefault(); // Prevent default backspace behavior
                  const newOtp = [...otp];
                  newOtp[index - 1] = ""; // Clear previous digit
                  setOtp(newOtp);
                  const prevInput = document.getElementById(`otp-${index - 1}`);
                  prevInput?.focus();
                } else if (e.key === "Backspace" && otp[index]) {
                  // If backspace is pressed and current field has a digit, clear current digit
                  e.preventDefault(); // Prevent default backspace behavior
                  const newOtp = [...otp];
                  newOtp[index] = "";
                  setOtp(newOtp);
                }
              }}
              id={`otp-${index}`}
              className="w-10 h-12 text-center text-2xl border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400 transition-colors duration-200 ease-in-out"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-auto mx-auto flex justify-center py-3 px-20 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200 ease-in-out"
        >
          {isLoading ? "Verifying..." : "Verify OTP"}
        </button>

        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          Didn't receive code?{" "}
          <button
            type="button"
            onClick={handleRequestAgainClick}
            disabled={resendTimer > 0 || isLoading}
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-500 focus:outline-none focus:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Request again"}
          </button>
        </div>
      </form>
    </div>
  );
}
