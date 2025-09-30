// Small harness to exercise the processHtmlForTana + toTana logic from background.js
// This file duplicates minimal logic from background.js so it can be run in Node for testing.

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

function processHtmlForTanaDOM(window, html) {
  const document = window.document;
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  const out = [];

  function walk(node) {
    if (!node) return;
    if (node.nodeType === window.Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) out.push(`- ${t}`);
      return;
    }
    if (node.nodeType !== window.Node.ELEMENT_NODE) return;
    const tag = node.tagName.toUpperCase();
    if (/H[1-6]/.test(tag)) {
      const t = node.textContent.trim();
      if (t) out.push(`- **${t}**`);
      return;
    }
    if (tag === 'IMG') {
      const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
      if (src) out.push(`- ![](${src})`);
      return;
    }
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      const t = node.textContent.trim() || href;
      out.push(`- [${t}](${href})`);
      return;
    }
    if (tag === 'LI') {
      const t = node.textContent.trim();
      out.push(`- ${t}`);
      return;
    }
    for (const c of node.childNodes) walk(c);
  }

  for (const c of tmp.childNodes) walk(c);
  return out;
}

function toTanaFromData(data, opts) {
  opts = opts || {};
  const lines = [];
  const tag = opts.defaultTag ? ` #${opts.defaultTag}` : '';
  const title = data.title || '';
  const url = data.url || '';
  const selection = (data.selection || '').trim();
  const selectionHtml = data.selectionHtml || '';
  const author = data.author || '';
  const publication = data.publication || '';
  const date = data.date || '';
  const image = data.image || '';

  // Use a DOM in JSDOM for processing
  const dom = new JSDOM(`<!doctype html><body></body>`);
  const window = dom.window;
  const processed = selectionHtml ? processHtmlForTanaDOM(window, selectionHtml) : [];
  let boldParent = null;
  if (processed.length && processed[0].startsWith('- **')) {
    boldParent = processed[0].replace(/^- \*\*(.*)\*\*/, '$1').trim();
  }

  if (boldParent) {
    lines.push(`- **${boldParent}**${tag}`);
  } else {
    if (url) lines.push(`- [${title || url}](${url})${tag}`);
    else lines.push(`- ${title || 'Untitled'}${tag}`);
  }

  // build child lines
  const childLines = [];
  let extractedDate = null;
  let extractedAuthor = null;
  for (let i = 0; i < processed.length; i++) {
    const raw = processed[i] || '';
    const trimmed = raw.trim();
    const content = trimmed.startsWith('- ') ? trimmed.slice(2).trim() : trimmed;
  // ...existing code...
    if (/^Posted on$/i.test(content)) {
      const next = (processed[i + 1] || '').trim();
      if (next) {
        const nextContent = next.startsWith('- ') ? next.slice(2).trim() : next;
        extractedDate = nextContent || extractedDate;
        i++;
      }
      continue;
    }
    if (/^by$/i.test(content)) {
      const next = (processed[i + 1] || '').trim();
      if (next) {
        const nextContent = next.startsWith('- ') ? next.slice(2).trim() : next;
        extractedAuthor = nextContent || extractedAuthor;
        i++;
      }
      continue;
    }
  if (boldParent && trimmed === `- **${boldParent}**`) continue;
  // filter out lines that are actually metadata already (to avoid duplicates)
  const lower = content.toLowerCase();
  if (/^(publication::|date::|author::|source::)/.test(lower)) continue;
  // filter out image lines like '![](url)'
  if (content.startsWith('![](') || raw.includes('![](')) continue;
  childLines.push('  ' + raw);
  }
  // ...existing code...

  const metaLines = [];
  if (opts.includeMetadata) {
    const pushIf = (label, value, allowEmpty) => {
      if (allowEmpty) metaLines.push(`  - ${label}:: ${value || ''}`);
      else if (value && String(value).trim()) metaLines.push(`  - ${label}:: ${value}`);
    };
    if (opts.omitEmptyMetadata) pushIf('Publication', publication, false);
    else pushIf('Publication', publication, true);

    const normalizeDate = (s) => (s ? String(s).replace(/\s+/g, ' ').trim() : '');
    const finalDateRaw = extractedDate ? extractedDate : date;
    const finalDate = normalizeDate(finalDateRaw);
    if (opts.omitEmptyMetadata) {
      if (finalDate) metaLines.push(`  - Date:: [[date:${finalDate}]]`);
    } else {
      metaLines.push(`  - Date:: [[date:${finalDate || ''}]]`);
    }

    if (extractedAuthor) pushIf('Author', extractedAuthor, !opts.omitEmptyMetadata);
    else pushIf('Author', author, !opts.omitEmptyMetadata);

    if (opts.omitEmptyMetadata) {
      if (data.url && String(data.url).trim()) { metaLines.push(`  - Source:: [${data.title || data.url}](${data.url})`); }
    } else {
      metaLines.push(`  - Source:: [${data.title || data.url}](${data.url || ''})`);
    }

    if (opts.omitEmptyMetadata) {
      if (data.image && String(data.image).trim() && !(selectionHtml && String(selectionHtml).includes(data.image))) metaLines.push(`  - ![](${data.image})`);
    } else {
      metaLines.push(`  - ![](${data.image || ''})`);
    }
  }

  lines.push(...metaLines);
  if (!processed.length && selection) lines.push(`  - ${selection}`);
  else lines.push(...childLines);

  if (opts.includeMetadata && metaLines.length === 0) {
    if (author && (!opts.omitEmptyMetadata || String(author).trim())) lines.push(`  - Author:: ${author}`);
    if (publication && (!opts.omitEmptyMetadata || String(publication).trim())) lines.push(`  - Publication:: ${publication}`);
    if (date && (!opts.omitEmptyMetadata || String(date).trim())) lines.push(`  - Date:: [[date:${date}]]`);
    if (image && (!opts.omitEmptyMetadata || String(image).trim()) && !(selectionHtml && String(selectionHtml).includes(image))) lines.push(`  - ![](${image})`);
  }

  return lines.join('\n');
}

// Representative Grants.gov HTML (simplified) — extracted from the attached screenshot
const grantsHtml = `
<h1>The Simpler.Grants.gov Search Experience Is Now Available on Grants.gov</h1>
<ul>
<li>Publication:: Grants.gov Community Blog</li>
<li>Posted on</li>
<li>July 22, 2025</li>
<li>by</li>
<li>Grants.gov</li>
</ul>
<p>An improved search feature is now available on Grants.gov. This "Simpler Search" makes it easier for users to discover federal funding opportunities that align with their unique specifications. It returns relevant results with enhanced search algorithms, a cleaner interface, better filters, and more sorting options.</p>
`;

const data = {
  title: 'The Simpler.Grants.gov Search Experience Is Now Available on Grants.gov',
  url: 'https://www.grants.gov/simpler-search',
  author: 'Grants.gov',
  publication: 'Grants.gov Community Blog',
  date: 'August 26, 2025',
  image: '',
  selection: '',
  selectionHtml: grantsHtml,
};

const out = toTanaFromData(data, { includeMetadata: true, omitEmptyMetadata: true, defaultTag: 'webclip' });
console.log('=== Tana output ===\n');
console.log(out);
console.log('\n=== end ===');
