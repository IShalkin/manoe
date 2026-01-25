/**
 * Markdown content renderer with custom styling
 * Used for displaying agent output in a readable format
 */

import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  return (
    <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-300 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
          em: ({ children }) => <em className="text-slate-400">{children}</em>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-slate-300">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-600 pl-3 my-2 text-slate-400 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs text-cyan-400">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="bg-slate-800/50 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-words">{children}</pre>
          ),
          h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-white mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-200 mb-1">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
