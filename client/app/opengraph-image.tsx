import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "AI Courtroom - AI-Powered Legal Simulation Platform";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 60,
          background: "linear-gradient(to bottom right, #0f172a, #1e3a8a)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Background Grid Pattern */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            zIndex: 0,
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
            padding: "40px",
            textAlign: "center",
          }}
        >
          {/* Gavel Icon Representation (SVG) */}
          <svg
            width="120"
            height="120"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: 30 }}
          >
            <path d="M14 13l-7.5 7.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L11 10" />
            <path d="m16 16 6-6" />
            <path d="m8 8 6-6" />
            <path d="m9 7 8 8" />
            <path d="m21 11-8-8" />
          </svg>

          <h1
            style={{
              fontSize: 80,
              fontWeight: 900,
              margin: 0,
              marginBottom: 20,
              textShadow: "0 4px 8px rgba(0,0,0,0.3)",
              background: "linear-gradient(to right, #60a5fa, #a78bfa)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            AI Courtroom
          </h1>
          <p
            style={{
              fontSize: 32,
              opacity: 0.8,
              margin: 0,
              maxWidth: 800,
            }}
          >
            AI-Powered Legal Simulation Platform
          </p>
          <div
            style={{
              marginTop: 40,
              padding: "12px 30px",
              background: "rgba(255,255,255,0.1)",
              borderRadius: 30,
              fontSize: 24,
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            ai-courtroom.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
