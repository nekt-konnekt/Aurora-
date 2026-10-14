import { VoiceNote } from '../types';

export function exportToMarkdown(note: VoiceNote): void {
  const frontmatter = `---
title: "${note.title.replace(/"/g, '\\"')}"
date: "${new Date(note.createdAt).toISOString()}"
duration: ${Math.round(note.duration)}s
---

# ${note.title}

> ${note.summary}

`;

  const sectionsContent = note.sections
    .map((s) => `## ${s.title}\n\n${s.content}\n`)
    .join('\n');

  const actionItemsContent =
    note.actionItems && note.actionItems.length > 0
      ? `## Tasks\n\n` +
        note.actionItems.map((item) => `- [${item.done ? 'x' : ' '}] ${item.text}`).join('\n') +
        '\n\n'
      : '';

  const transcriptSection = `---
### Transcript
${note.transcript}
`;

  const fullMarkdown = frontmatter + sectionsContent + '\n' + actionItemsContent + transcriptSection;
  downloadBlob(fullMarkdown, `${slugify(note.title || 'note')}.md`, 'text/markdown;charset=utf-8');
}

export function exportToWordDoc(note: VoiceNote): void {
  const sectionsHtml = note.sections
    .map(
      (s) => `
    <h3 style="color: #0f172a; font-size: 14pt; margin-top: 14pt; margin-bottom: 4pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 2pt;">${escapeHtml(
      s.title
    )}</h3>
    <div style="font-size: 11pt; line-height: 1.5; color: #334155; white-space: pre-wrap; margin-bottom: 10pt;">${escapeHtml(
      s.content
    )}</div>
  `
    )
    .join('');

  const actionsHtml =
    note.actionItems && note.actionItems.length > 0
      ? `
    <h3 style="color: #0f172a; font-size: 14pt; margin-top: 14pt; margin-bottom: 6pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 2pt;">Tasks</h3>
    <ul style="padding-left: 18pt; font-size: 11pt; color: #334155;">
      ${note.actionItems
        .map(
          (item) => `
        <li style="margin-bottom: 4pt; ${item.done ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${escapeHtml(
            item.text
          )}</li>
      `
        )
        .join('')}
    </ul>
  `
      : '';

  const docHtml = `
  <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(note.title)}</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; color: #0f172a; margin: 36pt; }
    </style>
  </head>
  <body>
    <div style="border-bottom: 1px solid #cbd5e1; padding-bottom: 10pt; margin-bottom: 14pt;">
      <h1 style="color: #0f172a; font-size: 20pt; margin: 0 0 4pt 0;">${escapeHtml(note.title)}</h1>
      <div style="font-size: 10pt; color: #64748b;">
        ${new Date(note.createdAt).toLocaleDateString()} · ${Math.round(note.duration)}s
      </div>
    </div>

    <div style="background-color: #f8fafc; border-left: 3px solid #6366f1; padding: 8pt 12pt; margin-bottom: 14pt;">
      <p style="font-size: 11pt; color: #334155; margin: 0; line-height: 1.5;">${escapeHtml(note.summary)}</p>
    </div>

    ${sectionsHtml}
    ${actionsHtml}

    <div style="margin-top: 20pt; padding-top: 10pt; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #64748b;">
      <h4 style="font-size: 10pt; color: #475569; margin-bottom: 4pt;">Transcript</h4>
      <p style="white-space: pre-wrap; font-family: monospace; background-color: #f8fafc; padding: 6pt; border-radius: 4pt;">${escapeHtml(
        note.transcript
      )}</p>
    </div>
  </body>
  </html>
  `;

  downloadBlob(docHtml, `${slugify(note.title || 'note')}.doc`, 'application/msword;charset=utf-8');
}

export function exportAudioFile(note: VoiceNote): void {
  if (!note.audioBlob && !note.audioUrl) return;
  const url = note.audioUrl || (note.audioBlob ? URL.createObjectURL(note.audioBlob) : '');
  if (!url) return;

  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(note.title || 'recording')}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function escapeHtml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
