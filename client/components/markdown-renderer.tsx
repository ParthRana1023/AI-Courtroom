"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import "highlight.js/styles/github.css";

interface MarkdownRendererProps {
  markdown: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  markdown,
  className = "",
}) => {
  // Custom components for legal document formatting
  const components = {
    // Handle headings with special styling for legal documents
    h1: ({ node, ...props }: any) => (
      <h1
        className="text-center my-6 text-xl font-bold uppercase tracking-wider"
        {...props}
      />
    ),
    h2: ({ node, ...props }: any) => (
      <h2 className="text-center my-5 text-lg font-bold" {...props} />
    ),
    h3: ({ node, ...props }: any) => (
      <h3
        className="my-4 text-base font-bold uppercase tracking-wide"
        {...props}
      />
    ),

    // Handle paragraphs with special styling for legal documents
    p: ({ node, ...props }: any) => {
      const text = props.children?.toString() || "";

      // Special styling for case numbers and other legal identifiers
      if (text.startsWith("CASE NO.:") || text.startsWith("CNR Number:")) {
        return <p className="text-center my-2 font-bold" {...props} />;
      }

      // Special styling for case titles
      if (text.startsWith("State vs.")) {
        return <p className="text-center my-3 font-bold" {...props} />;
      }

      // Special styling for legal headers
      if (
        text.startsWith("IN THE") ||
        text.startsWith("BETWEEN:") ||
        text.startsWith("AND") ||
        text.startsWith("AND:")
      ) {
        return <p className="text-center my-3 font-bold" {...props} />;
      }

      // Special styling for legal sections
      if (
        text.match(
          /^PETITION UNDER SECTION|^MOST RESPECTFULLY SHEWETH|^BACKGROUND AND CHRONOLOGY|^GROUNDS:|^EVIDENCE|^PRAYER|^VERIFICATION|^PETITIONER\/APPLICANT|^RESPONDENTS\/ACCUSED/
        )
      ) {
        return <p className="font-bold my-4 text-center" {...props} />;
      }

      // Default paragraph styling
      return (
        <p className="my-4 text-left text-base leading-relaxed" {...props} />
      );
    },

    // Handle lists with special styling for legal documents
    ol: ({ node, ...props }: any) => (
      <ol className="list-decimal pl-8 my-4 space-y-3" {...props} />
    ),
    ul: ({ node, ...props }: any) => (
      <ul className="list-disc pl-8 my-4 space-y-3" {...props} />
    ),
    li: ({ node, ...props }: any) => {
      const text = props.children?.toString() || "";

      // Special styling for respondent/accused items
      if (
        text.includes("**Respondent") ||
        text.includes("**Accused") ||
        text.includes("**RESPONDENT") ||
        text.includes("**ACCUSED")
      ) {
        return <li className="my-3 leading-relaxed font-semibold" {...props} />;
      }

      return <li className="my-2 leading-relaxed" {...props} />;
    },

    // Handle blockquotes with special styling for legal documents
    blockquote: ({ node, ...props }: any) => (
      <blockquote
        className="mx-8 my-5 py-2 px-4 border-t border-b border-gray-400"
        {...props}
      />
    ),

    // Handle code blocks with syntax highlighting
    code: ({ node, inline, className, children, ...props }: any) => {
      return !inline ? (
        <pre className="bg-gray-100 p-4 rounded overflow-x-auto my-4">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      ) : (
        <code className="bg-gray-100 px-1 rounded" {...props}>
          {children}
        </code>
      );
    },

    // Handle horizontal rules as section breaks
    hr: ({ node, ...props }: any) => (
      <hr
        className="w-3/4 mx-auto my-6 border-t border-dashed border-gray-500"
        {...props}
      />
    ),
  };

  // Directly use the markdown without preprocessing

  return (
    <div className="legal-document">
      <style jsx global>{`
        .legal-document {
          font-family: "Courier New", Courier, monospace;
          line-height: 1.5;
          color: #1a1a1a;
          padding: 2.5rem;
          letter-spacing: 0.05rem;
          background-color: #f9f8f2;
          position: relative;
          overflow-x: hidden;
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;
          hyphens: auto;
          border: 1px solid #e0e0d1;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          max-width: 100%;
        }

        /* Enhanced paper texture effect */
        .legal-document::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23000000' fill-opacity='0.03' fill-rule='evenodd'/%3E%3C/svg%3E"),
            linear-gradient(
              to bottom,
              rgba(255, 255, 255, 0.4),
              rgba(255, 255, 255, 0.1)
            ),
            repeating-linear-gradient(
              45deg,
              rgba(0, 0, 0, 0.01) 0px,
              rgba(0, 0, 0, 0.01) 1px,
              transparent 1px,
              transparent 3px
            );
          z-index: -2;
          pointer-events: none;
        }

        /* Enhanced typewriter effect with better line spacing */
        .legal-document::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            transparent,
            transparent 22px,
            rgba(0, 0, 0, 0.05) 23px
          );
          z-index: -1;
          pointer-events: none;
          width: 100%;
        }

        .legal-document strong {
          font-weight: bold;
          color: #000;
          letter-spacing: 0.03rem;
        }

        .legal-document em {
          font-style: italic;
        }

        .legal-document a {
          color: #000;
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-decoration-style: dotted;
        }

        .legal-document a:hover {
          color: #444;
        }

        /* Preserve line breaks while ensuring proper text wrapping */
        .legal-document p {
          white-space: pre-line;
          max-width: 100%;
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;
        }

        /* Improve horizontal rule styling for legal document section breaks */
        .legal-document hr {
          border: none;
          border-top: 1px dashed #999;
          width: 70%;
          margin: 2rem auto;
          height: 1px;
          background-color: transparent;
        }

        /* Enhance the paper-like background */
        .legal-document {
          background-color: #f9f8f2;
        }

        /* Special styling for signatures and verification sections */
        .legal-document p strong {
          font-weight: bold;
        }

        /* Add additional spacing for verification and signature sections */
        .legal-document p:last-of-type {
          margin-top: 2rem;
        }

        /* Improve spacing after verification heading */
        .legal-document p.font-bold + p {
          margin-top: 1.5rem;
        }
      `}</style>
      <div className={className}>
        <ReactMarkdown
          children={markdown}
          rehypePlugins={[
            rehypeRaw,
            rehypeSanitize, // Sanitize HTML for security
            rehypeHighlight, // Syntax highlighting for code blocks
          ]}
          remarkPlugins={[remarkGfm]} // Enable GitHub Flavored Markdown for better asterisk handling
          components={components}
        >
          {/* {markdown} */}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownRenderer;
