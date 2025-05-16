"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
// Remove direct import of highlight.js CSS to fix build error
// We'll use a custom style instead

interface MarkdownRendererProps {
  markdown: string;
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  markdown,
  className = "",
}) => {
  const components = {
    h1: ({ ...props }: any) => (
      <h1
        className="text-center my-6 text-xl font-bold uppercase tracking-wider"
        {...props}
      />
    ),
    h2: ({ ...props }: any) => (
      <h2 className="text-center my-5 text-lg font-bold" {...props} />
    ),
    h3: ({ ...props }: any) => (
      <h3
        className="my-4 text-base font-bold uppercase tracking-wide"
        {...props}
      />
    ),

    p: ({ node, children, ...props }: any) => {
      const text = String(children);
      // center & bold certain lines
      if (
        /^(CASE NO\.|CNR Number:|IN THE|BETWEEN:|AND\b)/.test(text) ||
        /^(PETITION UNDER SECTION|MOST RESPECTFULLY SHEWETH|BACKGROUND AND CHRONOLOGY|GROUNDS:|EVIDENCE|PRAYER|VERIFICATION)/.test(
          text
        )
      ) {
        return (
          <p
            className="text-center my-3 font-bold uppercase break-words whitespace-normal break-normal"
            {...props}
          >
            {children}
          </p>
        );
      }
      return (
        <p
          className="my-4 text-left text-base leading-relaxed break-words whitespace-normal break-normal"
          {...props}
        >
          {children}
        </p>
      );
    },

    ol: ({ ...props }: any) => (
      <ol className="list-decimal pl-8 my-4 space-y-2" {...props} />
    ),
    ul: ({ ...props }: any) => (
      <ul className="list-disc pl-8 my-4 space-y-2" {...props} />
    ),
    li: ({ node, children, ...props }: any) => {
      // if this list item starts with a bolded RESPONDENT/ACCUSED
      const firstChild = node.children[0];
      const isHeaderItem =
        firstChild?.type === "strong" &&
        /(RESPONDENT|ACCUSED)/i.test(firstChild.children[0].value);
      return (
        <li
          className={`my-2 leading-relaxed ${
            isHeaderItem ? "font-semibold" : ""
          }`}
          {...props}
        >
          {children}
        </li>
      );
    },

    blockquote: ({ ...props }: any) => (
      <blockquote
        className="mx-8 my-5 py-2 px-4 border-t border-b border-gray-400 italic"
        {...props}
      />
    ),

    code: ({ inline, className, children, ...props }: any) => {
      if (inline) {
        return (
          <code className="bg-gray-100 px-1 rounded break-words" {...props}>
            {children}
          </code>
        );
      }
      return (
        <pre className="bg-gray-100 p-4 rounded my-4 whitespace-pre-wrap break-words overflow-x-hidden">
          <code
            className={`${className} break-words whitespace-pre-wrap`}
            {...props}
          >
            {children}
          </code>
        </pre>
      );
    },

    hr: ({ ...props }: any) => (
      <hr
        className="w-3/4 mx-auto my-6 border-t border-dashed border-gray-500"
        {...props}
      />
    ),
  };

  return (
    <div className="legal-document bg-amber-50 p-6 rounded-md shadow-md overflow-hidden">
      <div
        className={`${className} max-w-full break-words whitespace-pre-wrap overflow-x-hidden`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            // Process raw HTML first - this allows HTML in the markdown to be parsed
            rehypeRaw,
            [
              rehypeSanitize,
              {
                ...defaultSchema,
                attributes: {
                  ...defaultSchema.attributes,
                  // Allow all elements to have className, style, etc.
                  "*": [
                    ...(defaultSchema.attributes?.["*"] || []),
                    "className",
                    "style",
                  ],
                },
                // Make sure all HTML elements are allowed
                tagNames: [
                  ...(defaultSchema.tagNames || []),
                  "strong",
                  "hr",
                  "br",
                  "div",
                  "span",
                ],
              },
            ],
            // Using rehypeHighlight with custom CSS instead of highlight.js import
            rehypeHighlight,
          ]}
          components={components}
          skipHtml={false}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownRenderer;
