// "./03-security.md#foo" → "/docs/03-security#foo"; null when not a chapter link.
export function rewriteDocHref(href: string): string | null {
  const m = /^(?:\.\/|\.\.\/(?:ja|en)\/)?(\d{2}-[a-z0-9-]+)\.md(#.*)?$/.exec(href);
  if (!m) return null;
  return `/docs/${m[1]}${m[2] ?? ''}`;
}
