const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const url = 'https://grantsgovprod.wordpress.com/2025/07/22/the-simpler-grants-gov-search-experience-is-now-available-on-grants-gov/';

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

function extractFirstDate(s) {
  if (!s) return '';
  const str = String(s);
  const longForm = str.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/);
  if (longForm && longForm[0]) return longForm[0].trim();
  const iso = str.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso && iso[0]) return iso[0];
  const cleaned = str.replace(/\s+/g, ' ').trim().replace(/^date:\s*/i, '');
  return cleaned.split(/\s{2,}|;|\||,/)[0].trim().slice(0, 80);
}

function toTanaFromData(window, data, opts) {
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

  // parse child lines and extract Posted on / by patterns
  const childLines = [];
  let extractedDate = null;
  let extractedAuthor = null;
  for (let i = 0; i < processed.length; i++) {
    const raw = processed[i] || '';
    const trimmed = raw.trim();
    const content = trimmed.startsWith('- ') ? trimmed.slice(2).trim() : trimmed;

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
    const lower = content.toLowerCase();
    if (/^(publication::|date::|author::|source::)/.test(lower)) continue;
    if (content.startsWith('![](') || raw.includes('![](')) continue;
    childLines.push('  ' + raw);
  }

  // Build metadata
  const metaLines = [];
  const includeMetadata = (typeof opts.includeMetadata === 'boolean') ? opts.includeMetadata : true;
  if (includeMetadata) {
    if (!opts.omitEmptyMetadata || (publication && String(publication).trim())) metaLines.push(`  - Publication:: ${publication}`);
    let finalDate = extractFirstDate(extractedDate || date || '');
    finalDate = finalDate.replace(/^[\s\[\(]+|[\]\)\s]+$/g, '').replace(/[\[\]]/g, '').trim();
    if (!/\d{4}/.test(finalDate) && url) {
      const ym = String(url).match(/\/(20\d{2})(?:\/|$)/);
      if (ym && ym[1]) finalDate = `${finalDate}${finalDate ? ', ' : ''}${ym[1]}`.trim();
    }
    if (!opts.omitEmptyMetadata || (finalDate && String(finalDate).trim())) metaLines.push(`  - Date:: [[date:${finalDate}]]`);
    if (!opts.omitEmptyMetadata || (extractedAuthor || author)) metaLines.push(`  - Author:: ${extractedAuthor || author}`);
    if (!opts.omitEmptyMetadata || (url && String(url).trim())) metaLines.push(`  - Source:: [${title || url}](${url || ''})`);
    if (!opts.omitEmptyMetadata || (image && String(image).trim()) && !(selectionHtml && String(selectionHtml).includes(image))) metaLines.push(`  - ![](${image})`);
  }

  lines.push(...metaLines);
  if (!processed.length && selection) lines.push(`  - ${selection}`);
  else lines.push(...childLines);

  return lines.join('\n');
}

(async function main(){
  try {
    const dom = await JSDOM.fromURL(url, { resources: 'usable', runScripts: 'dangerously' });
    const window = dom.window;
    const doc = window.document;
    const article = doc.querySelector('article') || doc.querySelector('.entry-content') || doc.querySelector('#content');
    const titleEl = doc.querySelector('h1') || doc.querySelector('.entry-title');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const selectionHtml = article ? article.innerHTML : '';

    const data = {
      title,
      url,
      author: '',
      publication: '',
      date: '',
      image: '',
      selection: '',
      selectionHtml,
    };

    // Try to collect meta tags too
    const metaAuthor = doc.querySelector('meta[name="author"]') || doc.querySelector('meta[property="article:author"]');
    if (metaAuthor) data.author = metaAuthor.content || '';
    const metaPub = doc.querySelector('meta[property="og:site_name"]') || doc.querySelector('meta[name="publication"]');
    if (metaPub) data.publication = metaPub.content || '';
    const metaDate = doc.querySelector('meta[property="article:published_time"]') || doc.querySelector('meta[name="date"]');
    if (metaDate) data.date = metaDate.content || '';
    const metaImage = doc.querySelector('meta[property="og:image"]');
    if (metaImage) data.image = metaImage.content || '';

    const out = toTanaFromData(window, data, { includeMetadata: true, omitEmptyMetadata: true, defaultTag: 'webclip' });
    console.log('\n=== Tana output for live page ===\n');
    console.log(out);
    console.log('\n=== end ===\n');
    process.exit(0);
  } catch (e) {
    console.error('Error fetching/parsing page:', e);
    process.exit(2);
  }
})();
