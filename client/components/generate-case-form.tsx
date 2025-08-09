"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import generateCase from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

// Update the form schema to match backend requirements

const formSchema = z.object({
  sections_involved: z
    .string()
    .transform((val) => Number.parseInt(val, 10))
    .refine((val) => val > 0 && val <= 10, {
      message: "Number of sections must be between 1 and 10",
    }),
  section_numbers: z.string().refine(
    (val) => {
      if (!val.trim()) return true;
      const sections = val.split(",").map((s) => s.trim());
      return sections.every((s) => !isNaN(Number.parseInt(s, 10)));
    },
    {
      message: "Section numbers must be comma-separated numbers",
    }
  ),
});

export function GenerateCaseForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Update the form field names and submission logic
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sections_involved: "3",
      section_numbers: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError(null);

    try {
      const sectionNumbers = values.section_numbers
        ? values.section_numbers
            .split(",")
            .map((s) => Number.parseInt(s.trim(), 10))
        : [];

      const caseData = {
        sections_involved: Number.parseInt(values.sections_involved, 10),
        section_numbers: sectionNumbers,
      };

      const newCase = await generateCase(caseData);
      router.push(`/dashboard/cases/${newCase.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to generate case. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Update the form field names in the JSX */}
          <FormField
            control={form.control}
            name="sections_involved"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Sections</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="10" {...field} />
                </FormControl>
                <FormDescription>
                  Enter the number of sections for the case (1-10)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="section_numbers"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Section Numbers (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="1, 2, 3" {...field} />
                </FormControl>
                <FormDescription>
                  Enter specific section numbers separated by commas
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="caseDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Case Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter a description for the case..."
                    className="resize-none"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Provide additional context for the case
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Case...
              </>
            ) : (
              "Generate Case"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
