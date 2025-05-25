"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { login } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters",
  }),
  remember: z.boolean().default(false),
  otp: z.string().optional(), // Add OTP field, optional initially
});

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"initial" | "otp">("initial"); // Add state for login step
  const [emailForOtp, setEmailForOtp] = useState<string | null>(null); // Add state to store email for OTP step

  // Check if user was redirected from registration
  const registered = searchParams.get("registered") === "true";

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
      otp: "", // Add default value for OTP
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError(null);

    try {
      if (step === "initial") {
        // Step 1: Initiate login with email and password
        const response = await login(
          values.email,
          values.password,
          values.remember
        );
        // Assuming the login function in api.ts now returns a success indicator for OTP sent
        if (response && response.message === "OTP sent to your email") {
          // Adjust based on actual API response
          setEmailForOtp(values.email);
          setStep("otp");
          setError(null); // Clear previous errors
        } else {
          // Handle unexpected response from initiate step
          setError(
            response?.message || "Login initiation failed. Please try again."
          );
        }
      } else if (step === "otp" && emailForOtp) {
        // Step 2: Verify login with email, OTP, and remember state
        if (!values.otp) {
          setError("Please enter the OTP.");
          setIsLoading(false);
          return;
        }
        // Call the verifyLogin function directly from api.ts
        const response = await authAPI.verifyLogin({
          // Assuming authAPI is exported from api.ts
          email: emailForOtp,
          otp: values.otp,
          remember_me: values.remember,
        });

        // Make sure we have a token before redirecting
        if (response && localStorage.getItem("token")) {
          // Check for 'token' as setAuthToken uses 'token'
          router.replace("/dashboard/cases");
        } else {
          setError("Authentication failed. Please try again.");
        }
      }
    } catch (err: any) {
      console.error("Login error in form:", err);
      setError(err.message || "Failed to login. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {registered && (
        <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle>Registration Successful</AlertTitle>
          <AlertDescription>
            Your account has been created. Please log in with your credentials.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Login Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {step === "initial" && (
            <>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="email@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="******" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="remember"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Remember me</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </>
          )}

          {step === "otp" && (
            <>
              <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900">
                <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle>OTP Required</AlertTitle>
                <AlertDescription>
                  An OTP has been sent to {emailForOtp}. Please enter it below.
                </AlertDescription>
              </Alert>
              <FormField
                control={form.control}
                name="otp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OTP</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter OTP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {step === "initial" ? "Logging in..." : "Verifying OTP..."}
              </>
            ) : step === "initial" ? (
              "Login"
            ) : (
              "Verify OTP"
            )}
          </Button>
        </form>
      </Form>
      <div className="text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="underline">
          Register
        </Link>
      </div>
    </div>
  );
}
