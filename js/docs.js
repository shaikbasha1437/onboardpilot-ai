/* OnboardPilot handbook import: Markdown, plain text, PDF (vendored pdf.js, loaded on demand) and DOCX
   (a small ZIP reader plus the browser's built-in deflate decoder). Everything is parsed in the page;
   files are never uploaded anywhere. Output is a doc { id, title, owner, updated, text, source }. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kb.js'));
  else (root.OP = root.OP || {}).docs = factory(root.OP.kb);
})(typeof self !== 'undefined' ? self : this, function (KB) {
  'use strict';
  const MAX_BYTES = 5 * 1024 * 1024;
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unxml = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] != null ? ENT[e] : m));
  /* Plain text -> Markdown sections: short title-like lines followed by a paragraph become "## " headings. */
  function txtToMd(text, title) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').split('\n');
    if (lines.some((l) => /^#{1,3}\s+\S/.test(l))) return (/^#\s/.test(lines.find((l) => l.trim()) || '') ? '' : '# ' + title + '\n\n') + lines.join('\n');
    const out = ['# ' + title, '']; let headings = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim(); const next = (lines.slice(i + 1).find((x) => x.trim()) || '').trim();
      const looksHeading = l && l.length <= 70 && !/[.,;:!?]$/.test(l) && /^[A-Z0-9]/.test(l) && l.split(/\s+/).length <= 9 && next && (next.length > l.length || /[.!?]$/.test(next)) && (i === 0 || !lines[i - 1].trim() || /^\d+(\.\d+)*\s/.test(l) || l === l.toUpperCase());
      if (looksHeading) { out.push('', '## ' + l.replace(/^\d+(\.\d+)*\s+/, ''), ''); headings++; } else out.push(lines[i]);
    }
    if (!headings) { // no structure found: group paragraphs into numbered parts so citations still point somewhere useful
      const paras = String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean); const md = ['# ' + title, ''];
      for (let i = 0; i < paras.length; i += 3) md.push('## Part ' + (i / 3 + 1) + ': ' + paras[i].split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:]+$/, ''), '', paras.slice(i, i + 3).join('\n\n'), '');
      return md.join('\n');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  /* ---------- ZIP (DOCX) ---------- */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function zipEntries(bytes) {
    let eocd = -1; for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This file is not a valid DOCX (no ZIP directory found).');
    const n = u16(bytes, eocd + 10); let p = u32(bytes, eocd + 16); const out = {};
    for (let i = 0; i < n; i++) {
      if (u32(bytes, p) !== 0x02014b50) throw new Error('Damaged DOCX directory.');
      const method = u16(bytes, p + 10); const csize = u32(bytes, p + 20); const nameLen = u16(bytes, p + 28); const extra = u16(bytes, p + 30); const comment = u16(bytes, p + 32); const local = u32(bytes, p + 42);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
      const lp = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
      out[name] = { method, data: bytes.subarray(lp, lp + csize) };
      p += 46 + nameLen + extra + comment;
    }
    return out;
  }
  async function inflateRaw(data, deps) {
    if (deps && deps.inflateRaw) return deps.inflateRaw(data);
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack DOCX files. Save the handbook as PDF, Markdown or text instead.');
    const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(data); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  function docxXmlToMd(xml, title) {
    const out = ['# ' + title, '']; let headings = 0;
    const paras = String(xml).match(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g) || [];
    for (const p of paras) {
      const style = (/<w:pStyle w:val="([^"]+)"/.exec(p) || [])[1] || '';
      const txt = unxml((p.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|\t|\n/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join('')).trim();
      if (!txt) { out.push(''); continue; }
      if (/^(Title)$/i.test(style)) { out[0] = '# ' + txt; continue; }
      if (/^Heading\s?\d|^heading/i.test(style)) { out.push('', '## ' + txt, ''); headings++; continue; }
      if (/List/i.test(style)) { out.push('- ' + txt); continue; }
      out.push(txt, '');
    }
    const md = out.join('\n').replace(/\n{3,}/g, '\n\n');
    return headings ? md : txtToMd(md.replace(/^# .*\n/, ''), out[0].slice(2));
  }
  async function docxToMd(bytes, title, deps) {
    const z = zipEntries(bytes); const e = z['word/document.xml'];
    if (!e) throw new Error('No word/document.xml inside; is this really a DOCX?');
    const raw = e.method === 0 ? e.data : e.method === 8 ? await inflateRaw(e.data, deps) : null;
    if (!raw) throw new Error('Unsupported DOCX compression.');
    return docxXmlToMd(new TextDecoder().decode(raw), title);
  }
  async function pdfToMd(bytes, title, deps) {
    let lib = deps && deps.pdfjs;
    if (!lib) { const base = (typeof document !== 'undefined' && document.baseURI) || ''; lib = await import(new URL('vendor/pdfjs/pdf.min.mjs', base).href); lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', base).href; }
    const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise; const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
      const pg = await doc.getPage(i); const c = await pg.getTextContent(); let line = ''; const lines = []; let lastY = null;
      for (const it of c.items) { const y = it.transform ? Math.round(it.transform[5]) : null; if (lastY != null && y != null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; } line += it.str; if (it.hasEOL) { lines.push(line); line = ''; } lastY = y; }
      if (line) lines.push(line); pages.push(lines.join('\n'));
    }
    const text = pages.join('\n\n').replace(/[ \u00a0]{2,}/g, ' ');
    if (!text.trim()) throw new Error('No text found in this PDF. Scanned PDFs need OCR first.');
    return txtToMd(text, title);
  }
  function titleFrom(name) { return String(name || 'Handbook').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()) || 'Handbook'; }
  /* file: { name, size, bytes(Uint8Array) } */
  async function parseFile(file, deps) {
    const name = file.name || 'handbook.txt'; const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1] || 'txt';
    if (file.size > MAX_BYTES) throw new Error(name + ' is over 5 MB.');
    const title = titleFrom(name); let md;
    if (/^(md|markdown|txt|text)$/i.test(ext)) { const t = new TextDecoder().decode(file.bytes); const h1 = /^#\s+(.+)$/m.exec(t); md = txtToMd(t, h1 ? h1[1].trim() : title); }
    else if (/^docx$/i.test(ext)) md = await docxToMd(file.bytes, title, deps);
    else if (/^pdf$/i.test(ext)) md = await pdfToMd(file.bytes, title, deps);
    else throw new Error(name + ': use .md, .txt, .pdf or .docx.');
    const h1 = /^#\s+(.+)$/m.exec(md);
    return { id: KB.slug(h1 ? h1[1] : title), title: h1 ? h1[1].trim() : title, owner: 'HR', updated: new Date().toISOString().slice(0, 10), text: md, source: name, uploaded: true };
  }
  /* Give every doc a unique id against the existing set. */
  function uniqueIds(docs, existing) { const used = new Set((existing || []).map((d) => d.id)); return docs.map((d) => { let id = d.id; let n = 2; while (used.has(id)) id = d.id + '-' + n++; used.add(id); return Object.assign({}, d, { id }); }); }
  return { MAX_BYTES, txtToMd, zipEntries, docxXmlToMd, docxToMd, pdfToMd, parseFile, uniqueIds, titleFrom, unxml };
});
