import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import { Link } from 'react-router-dom';
import { Mermaid } from './Mermaid';
import { CopyButton } from './CopyButton';
import { rewriteDocHref } from '../lib/links';

function toText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return toText(node.props.children);
  return '';
}

const components: Components = {
  a({ href = '', children }) {
    const doc = rewriteDocHref(href);
    if (doc) return <Link to={doc}>{children}</Link>;
    if (href.startsWith('#')) {
      // Plain "#id" would be read by HashRouter as a route; keep the current route and add the fragment.
      return (
        <Link to={{ hash: href.slice(1) }} replace>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const cls = isValidElement<{ className?: string }>(child) ? (child.props.className ?? '') : '';
    const lang = /language-([\w-]+)/.exec(cls)?.[1] ?? '';
    const raw = toText(children).replace(/\n$/, '');
    if (lang === 'mermaid') return <Mermaid key={raw} code={raw} />;
    return (
      <div className="code-block">
        <div className="code-bar">
          <span>{lang || 'text'}</span>
          <CopyButton text={raw} />
        </div>
        <pre className="md-pre">{children}</pre>
      </div>
    );
  },
  table({ children }) {
    return (
      <div className="table-scroll md-table">
        <table>{children}</table>
      </div>
    );
  },
};

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { plainText: ['mermaid', 'text'], detect: false }]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
