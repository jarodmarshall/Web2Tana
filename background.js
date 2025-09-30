/*
	background.js - Manifest V3 service worker
	- creates a context menu "Copy as Tana Paste"
	- on click or keyboard command 'copy-as-tana' it injects a page-scoped builder
		that collects page/selection data and returns a Tana-formatted string
	- copies the string in the page context using navigator.clipboard if available
		and falls back to a textarea+document.execCommand('copy') method
	- shows a notification (if permission) or logs to console
*/

const DEFAULT_OPTIONS = {
	includeMetadata: true,
	defaultTag: 'webclip',
	notificationEnabled: true,
	omitEmptyMetadata: true,
};

let options = { ...DEFAULT_OPTIONS };

// Load saved options (if any)
chrome.storage.sync.get(['tanaOptions'], (res) => {
	if (res && res.tanaOptions) options = res.tanaOptions;
});
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'sync' && changes.tanaOptions) options = changes.tanaOptions.newValue;
});

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: 'copyAsTanaPaste',
		title: 'Copy as Tana Paste',
		contexts: ['page', 'selection', 'image', 'link'],
	});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === 'copyAsTanaPaste' && tab && tab.id) runBuildOnTab(tab.id, info);
});

// Build Tana text in the page context and copy it there (so clipboard APIs work)
function runBuildOnTab(tabId, info = {}) {
	chrome.scripting.executeScript(
		{
			target: { tabId },
			func: (infoArg, opts) => {
				// Page-scoped helpers
				function collectPage(info) {
					const doc = document;
					const title = doc.title || '';
					const url = location.href || '';
					const meta = (name) => (doc.querySelector(`meta[name="${name}"]`) || {}).content || '';
					const metaProp = (prop) => (doc.querySelector(`meta[property="${prop}"]`) || {}).content || '';

					const author = meta('author') || metaProp('article:author') || '';
					const publication = metaProp('og:site_name') || meta('publication') || '';
					const date = metaProp('article:published_time') || meta('date') || '';
					const image = metaProp('og:image') || '';

					let selection = '';
					let selectionHtml = null;
					try {
						const sel = window.getSelection();
						if (sel && sel.rangeCount) {
							selection = sel.toString();
							const r = sel.getRangeAt(0);
							const container = document.createElement('div');
							container.appendChild(r.cloneContents());
							selectionHtml = container.innerHTML || null;
						}
					} catch (e) {
						// ignore
					}

					return {
						title,
						url,
						author,
						publication,
						date,
						image,
						selection,
						selectionHtml,
						info: info || {},
					};
				}

				function processHtmlForTana(html) {
					const tmp = document.createElement('div');
					tmp.innerHTML = html || '';
					const out = [];

					function walk(node) {
						if (!node) return;
						if (node.nodeType === Node.TEXT_NODE) {
							const t = node.textContent.trim();
							if (t) out.push(`- ${t}`);
							return;
						}
						if (node.nodeType !== Node.ELEMENT_NODE) return;
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
						// for containers, iterate children
						for (const c of node.childNodes) walk(c);
					}

					for (const c of tmp.childNodes) walk(c);
					return out;
				}

				function toTana(data, opts) {
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

					// Determine parent: if the selection contains a heading, use it as bold parent
					let processed = selectionHtml ? processHtmlForTana(selectionHtml) : [];
					let boldParent = null;
					if (processed.length && processed[0].startsWith('- **')) {
						// extract heading text
						boldParent = processed[0].replace(/^- \*\*(.*)\*\*/, '$1').trim();
						// remove the heading from processed children
						processed = processed.slice(1);
					}

					let addedSource = false;

					// Build parent line
					if (boldParent) {
						lines.push(`- **${boldParent}**${tag}`);
					} else {
						// link parent when possible
						if (url) lines.push(`- [${title || url}](${url})${tag}`);
						else lines.push(`- ${title || 'Untitled'}${tag}`);
					}

					// Extract simple metadata from processed selection (e.g. "Posted on" / "by")
					let extractedDate = null;
					let extractedAuthor = null;
					const childLines = [];
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

									// drop duplicate of bold parent
									if (boldParent && trimmed === `- **${boldParent}**`) continue;

									// filter out lines that are actually metadata already (to avoid duplicates)
									const lower = content.toLowerCase();
									if (/^(publication::|date::|author::|source::)/.test(lower)) continue;
									// filter out image lines like '![](url)'
									if (content.startsWith('![](') || raw.includes('![](')) continue;

									childLines.push('  ' + raw);
								}

					// Build metadata lines in requested order: Publication, Date, Author, Source, Image
					const metaLines = [];
					if (opts.includeMetadata) {
						const pushIf = (label, value, allowEmpty) => {
							if (allowEmpty) {
								metaLines.push(`  - ${label}:: ${value || ''}`);
							} else if (value && String(value).trim()) {
								metaLines.push(`  - ${label}:: ${value}`);
							}
						};

						// Publication
						if (opts.omitEmptyMetadata) pushIf('Publication', publication, false);
						else pushIf('Publication', publication, true);

									// Date: pick one clean date (prefer extracted from selection). Normalize whitespace
									const normalizeDate = (s) => (s ? String(s).replace(/\s+/g, ' ').trim() : '');
									const finalDateRaw = extractedDate ? extractedDate : date;
									const finalDate = normalizeDate(finalDateRaw);
									if (opts.omitEmptyMetadata) {
										if (finalDate) metaLines.push(`  - Date:: [[date:${finalDate}]]`);
									} else {
										// emit even if empty
										metaLines.push(`  - Date:: [[date:${finalDate || ''}]]`);
									}

						// Author
						if (extractedAuthor) pushIf('Author', extractedAuthor, !opts.omitEmptyMetadata);
						else pushIf('Author', author, !opts.omitEmptyMetadata);

						// Source (url/title)
						if (opts.omitEmptyMetadata) {
							if (url && String(url).trim()) { metaLines.push(`  - Source:: [${title || url}](${url})`); addedSource = true; }
						} else {
							metaLines.push(`  - Source:: [${title || url}](${url || ''})`); if (url) addedSource = true;
						}

						// Image (avoid when selection already includes the image)
						if (opts.omitEmptyMetadata) {
							if (image && String(image).trim() && !(selectionHtml && String(selectionHtml).includes(image))) metaLines.push(`  - ![](${image})`);
						} else {
							metaLines.push(`  - ![](${image || ''})`);
						}
					}

					// Emit metadata first
					lines.push(...metaLines);

					// If there was no processed selection but there is a plain selection string, emit it
					if (!processed.length && selection) {
						lines.push(`  - ${selection}`);
					} else {
						// Append child lines (processed selection)
						lines.push(...childLines);
					}

					// If metadata option is enabled, and we didn't already add some fields above, ensure
					// we still include author/publication/date/image below parent if present and not already emitted.
					// (This is a safety net for pages without extracted metadata)
					if (opts.includeMetadata && metaLines.length === 0) {
						if (author && (!opts.omitEmptyMetadata || String(author).trim())) lines.push(`  - Author:: ${author}`);
						if (publication && (!opts.omitEmptyMetadata || String(publication).trim())) lines.push(`  - Publication:: ${publication}`);
						if (date && (!opts.omitEmptyMetadata || String(date).trim())) lines.push(`  - Date:: [[date:${date}]]`);
						if (image && (!opts.omitEmptyMetadata || String(image).trim()) && !(selectionHtml && String(selectionHtml).includes(image))) lines.push(`  - ![](${image})`);
					}

					return lines.join('\n');
				}

				return toTana(collectPage(infoArg || {}), opts || {});
			},
			args: [info, options],
		},
		(injectionResults) => {
			try {
				if (!injectionResults || !injectionResults[0]) throw new Error('No result from page script');
				const tanaText = injectionResults[0].result;
				if (!tanaText) throw new Error('Empty Tana text');

				// Copy in page context: try navigator.clipboard, fallback to textarea
				chrome.scripting.executeScript(
					{
						target: { tabId },
						func: (text) => {
							if (navigator.clipboard && navigator.clipboard.writeText) {
								return navigator.clipboard.writeText(text).then(() => ({ ok: true })).catch((e) => ({ ok: false, err: String(e) }));
							}
							try {
								const ta = document.createElement('textarea');
								ta.style.position = 'fixed';
								ta.style.left = '-9999px';
								ta.value = text;
								document.body.appendChild(ta);
								ta.select();
								const ok = document.execCommand('copy');
								document.body.removeChild(ta);
								return { ok: !!ok };
							} catch (e) { return { ok: false, err: String(e) }; }
						},
						args: [tanaText],
					},
					(copyResults) => {
						if (chrome.runtime.lastError) {
							console.error('Copy failed (runtime.lastError):', chrome.runtime.lastError);
							if (options.notificationEnabled) showNotification('Failed to copy to clipboard');
							return;
						}
						const result = copyResults && copyResults[0] && copyResults[0].result;
						if (result && result.ok) {
							if (options.notificationEnabled) showNotification('Copied to Tana format');
						} else {
							console.error('Copy script reported failure', result && result.err);
							if (options.notificationEnabled) showNotification('Failed to copy to clipboard');
						}
					}
				);
			} catch (err) {
				console.error('Error building/copying Tana paste:', err);
				if (options.notificationEnabled) showNotification('Failed to build Tana paste');
			}
		}
	);
}

// keyboard command handler (defined in manifest.commands)
chrome.commands.onCommand.addListener((command) => {
	if (command !== 'copy-as-tana') return;
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (!tabs || !tabs[0] || !tabs[0].id) return;
		runBuildOnTab(tabs[0].id, {});
	});
});

function showNotification(message) {
	if (chrome.notifications && chrome.notifications.create) {
		try {
			chrome.notifications.create({ type: 'basic', iconUrl: 'icon48.png', title: 'Tana Paste', message });
		} catch (e) {
			console.log('Notification error:', e, message);
		}
	} else {
		console.log('Notification:', message);
	}
}
