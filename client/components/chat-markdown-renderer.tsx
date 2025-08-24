import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import "highlight.js/styles/github.css";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ChatMarkdownRendererProps {
  markdown: string;
  className?: string;
}

const ChatMarkdownRenderer: React.FC<ChatMarkdownRendererProps> = ({
  markdown,
  className,
}) => {
  return (
    <div className={`max-w-none ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
        components={{
          // Custom component for paragraphs to ensure no extra wrapping divs
          p: ({ node, ...props }) => (
            <p className="mb-2 last:mb-0" {...props} />
          ),
          // Custom component for code blocks
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match;

            return isInline ? (
              <code className={className} {...props}>
                {children}
              </code>
            ) : (
              <SyntaxHighlighter
                style={vscDarkPlus as any}
                language={match[1]}
                PreTag="div"
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            );
          },
          // Custom component for lists to ensure proper spacing
          ul: ({ node, ...props }) => (
            <ul
              className="mb-2 last:mb-0 pl-0"
              style={{
                listStyleType: "disc",
                listStylePosition: "inside",
                paddingLeft: "0",
                marginLeft: "0",
              }}
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="mb-2 last:mb-0 pl-0"
              style={{
                listStyleType: "decimal",
                listStylePosition: "inside",
                paddingLeft: "0",
                marginLeft: "0",
              }}
              {...props}
            />
          ),
          li: ({ node, ...props }) => (
            <li
              className="mb-1 last:mb-0"
              style={{
                listStylePosition: "inside",
                paddingLeft: "0",
                marginLeft: "0",
                display: "list-item",
              }}
              {...props}
            />
          ),
          // Custom component for blockquotes
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-gray-300 pl-4 italic text-gray-600 mb-2 last:mb-0"
              {...props}
            />
          ),
          // Custom component for headings (optional, depending on desired styling)
          h1: ({ node, ...props }) => (
            <h1 className="text-2xl font-bold mb-2 mt-4" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xl font-bold mb-2 mt-3" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-lg font-bold mb-2 mt-2" {...props} />
          ),
          // Add more custom components as needed for other HTML elements
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

export default ChatMarkdownRenderer;
