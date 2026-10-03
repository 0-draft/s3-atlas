import { createLowlight } from 'lowlight';
import { toText } from 'hast-util-to-text';
import { visit } from 'unist-util-visit';
import type { Element, Root } from 'hast';
import bash from 'highlight.js/lib/languages/bash';
import go from 'highlight.js/lib/languages/go';
import http from 'highlight.js/lib/languages/http';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

// Only the grammars the docs use. rehype-highlight bundles ~37 by default, which doubled the doc chunk.
const lowlight = createLowlight({
  bash,
  go,
  http,
  ini,
  java,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
  yaml,
});
lowlight.registerAlias({ ini: ['properties', 'hcl'], bash: ['sh', 'shell', 'zsh'] });

function language(node: Element): string | null {
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls : [];
  for (const c of list) {
    const m = /^language-(.+)$/.exec(String(c));
    if (m) return m[1];
  }
  return null;
}

// rehype plugin: highlight <pre><code class="language-x"> when x is registered; leave everything else alone.
export function rehypeHighlightLite() {
  return (tree: Root) => {
    visit(tree, 'element', (node, _i, parent) => {
      if (node.tagName !== 'code' || !parent || (parent as Element).tagName !== 'pre') return;
      const lang = language(node);
      if (!lang || !lowlight.registered(lang)) return;
      const result = lowlight.highlight(lang, toText(node, { whitespace: 'pre' }));
      node.children = result.children as Element['children'];
      const cls = Array.isArray(node.properties.className) ? node.properties.className : [];
      node.properties.className = [...cls, 'hljs'];
    });
  };
}
