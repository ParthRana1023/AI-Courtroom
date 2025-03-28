import type React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "AI Courtroom Simulation",
  description: "A simulation of an AI-powered courtroom for legal arguments",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="ai-courtroom-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}

