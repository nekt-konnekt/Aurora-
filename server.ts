import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));

// Initialize Google GenAI SDK (Server-Side Only)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// In-memory simulated cloud sync store
interface SyncedNote {
  id: string;
  title: string;
  rawTranscript: string;
  structuredNote: {
    title: string;
    summary: string;
    detectedIntent: string;
    structuredSections: Array<{
      title: string;
      content: string;
      type: string;
    }>;
    actionItems: Array<{
      text: string;
      status: 'pending' | 'completed';
      priority: 'high' | 'medium' | 'low';
    }>;
    tags: string[];
    suggestedFollowUps: string[];
  };
  personaId: string;
  personaName: string;
  audioDuration: number;
  createdAt: number;
  updatedAt: number;
}

let cloudNotesStore: SyncedNote[] = [];
let lastCloudSyncTimestamp = Date.now();

// Health check / Sync status
app.get('/api/sync/status', (req, res) => {
  res.json({
    status: 'online',
    serverTime: Date.now(),
    lastCloudSync: lastCloudSyncTimestamp,
    cloudNotesCount: cloudNotesStore.length,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Cloud Sync Backup Endpoint
app.post('/api/sync/backup', (req, res) => {
  try {
    const { notes } = req.body;
    if (Array.isArray(notes)) {
      // Merge unique by ID
      const map = new Map<string, SyncedNote>();
      cloudNotesStore.forEach((n) => map.set(n.id, n));
      notes.forEach((n: SyncedNote) => map.set(n.id, n));
      cloudNotesStore = Array.from(map.values());
      lastCloudSyncTimestamp = Date.now();
    }
    res.json({
      success: true,
      timestamp: lastCloudSyncTimestamp,
      syncedCount: cloudNotesStore.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// Fetch all cloud synced notes
app.get('/api/sync/notes', (req, res) => {
  res.json({
    notes: cloudNotesStore,
    timestamp: lastCloudSyncTimestamp,
  });
});

function sanitizeAudioMime(raw: string | undefined): string {
  if (!raw) return 'audio/webm';
  const clean = raw.split(';')[0].trim().toLowerCase();
  if (clean.includes('webm')) return 'audio/webm';
  if (clean.includes('mp4') || clean.includes('m4a') || clean.includes('aac')) return 'audio/mp4';
  if (clean.includes('wav')) return 'audio/wav';
  if (clean.includes('ogg')) return 'audio/ogg';
  if (clean.includes('mp3') || clean.includes('mpeg')) return 'audio/mp3';
  return 'audio/webm';
}

// AI Audio Transcription Endpoint
app.post('/api/ai/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Valid audioBase64 string is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not configured, returning empty transcript for client fallback');
      return res.json({ success: true, transcript: '' });
    }

    const cleanMime = sanitizeAudioMime(mimeType);
    const audioPart = {
      inlineData: {
        mimeType: cleanMime,
        data: audioBase64,
      },
    };

    let transcribedText = '';
    const modelsToTry = ['gemini-3.5-transcribe', 'gemini-3.8-flash'];

    for (const modelName of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                audioPart,
                { text: 'Transcribe this spoken audio verbatim into clean text. Return ONLY the transcribed words.' },
              ],
            },
          });
          if (response && response.text) {
            transcribedText = response.text.trim();
            if (transcribedText) break;
          }
        } catch (err: any) {
          if (attempt === 0 && (err?.status === 503 || err?.status === 429)) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          console.warn(`Audio transcribe with ${modelName} error:`, err?.message || err);
        }
      }
      if (transcribedText) break;
    }

    res.json({
      success: true,
      transcript: transcribedText || '',
    });
  } catch (error: any) {
    console.error('Audio transcription error:', error);
    res.json({ success: true, transcript: '' });
  }
});

// AI Intent Transformation Endpoint
app.post('/api/ai/transform-note', async (req, res) => {
  try {
    let { transcript, audioBase64, mimeType, userOccupation, userFocus, audioDuration } = req.body;

    // If transcript is empty but audioBase64 is provided, transcribe first
    if ((!transcript || !transcript.trim()) && audioBase64 && process.env.GEMINI_API_KEY) {
      try {
        const cleanMime = sanitizeAudioMime(mimeType);
        const audioPart = {
          inlineData: {
            mimeType: cleanMime,
            data: audioBase64,
          },
        };
        const transcribeRes = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              audioPart,
              { text: 'Transcribe this spoken audio verbatim into plain text.' },
            ],
          },
        });
        if (transcribeRes && transcribeRes.text) {
          transcript = transcribeRes.text.trim();
        }
      } catch (err: any) {
        console.warn('Direct audio transcribe error in transform-note:', err?.message || err);
      }
    }

    const occupation = (userOccupation || 'Professional').trim();
    const focus = (userFocus || '').trim();
    const validTranscript = (transcript || '').trim();
    const durationSec = Math.round(audioDuration || 0);

    if (!validTranscript) {
      // Safe structured note representing raw audio recording without fake text
      const defaultNote = {
        title: `Voice Recording (${durationSec}s)`,
        summary: `Audio recording (${durationSec}s) captured.`,
        intent: 'Voice Note',
        sections: [{ title: 'Audio Recording', content: `Recorded audio clip (${durationSec}s).` }],
        actionItems: [],
      };
      return res.json({ success: true, result: defaultNote });
    }

    if (!process.env.GEMINI_API_KEY) {
      const words = validTranscript.split(/\s+/);
      const titleCandidate = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');
      const fallbackNote = {
        title: titleCandidate || `${occupation} Voice Note`,
        summary: validTranscript.slice(0, 160) + (validTranscript.length > 160 ? '...' : ''),
        intent: occupation,
        sections: [{ title: 'Voice Note', content: validTranscript }],
        actionItems: [],
      };
      return res.json({ success: true, result: fallbackNote });
    }

    const systemInstruction = `You are Aurora AI, a clean and intelligent voice note structuring engine.
The user's occupation is: "${occupation}".
${focus ? `Their key focus or workflow preference: "${focus}".` : ''}

Analyze the user's spoken words, extract their core intent, correct any speech-to-text slips or omitted terms naturally, and format a clean, domain-appropriate structured note.

Return a JSON object matching this schema:
- title: clear title (3-6 words)
- summary: 1-2 sentence concise summary
- intent: concise category or intent label
- sections: array of { title: string, content: string } tailored to the occupation (e.g. for an artist: Lyrics, Chords, Visuals; for a lawyer: Facts, Issues, Deadlines; for a doctor: Symptoms, Assessment, Plan; for an architect: Specs, Materials, Punchlist; etc.)
- actionItems: array of { text: string, done: false }`;

    const prompt = `Audio Duration: ~${Math.round(audioDuration || 0)}s.
Transcript:
"""
${validTranscript}
"""`;

    let responseText = '';
    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

    const timeoutPromise = (ms: number) =>
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));

    for (const modelName of modelsToTry) {
      try {
        const genCall = ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                intent: { type: Type.STRING },
                sections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      content: { type: Type.STRING },
                    },
                    required: ['title', 'content'],
                  },
                },
                actionItems: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      done: { type: Type.BOOLEAN },
                    },
                    required: ['text', 'done'],
                  },
                },
              },
              required: ['title', 'summary', 'intent', 'sections', 'actionItems'],
            },
          },
        });

        const response: any = await Promise.race([genCall, timeoutPromise(12000)]);
        if (response && response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        console.warn(`Model ${modelName} attempt error:`, err.message);
      }
    }

    let parsedResult;
    if (responseText) {
      try {
        parsedResult = JSON.parse(responseText);
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) parsedResult = JSON.parse(match[0]);
      }
    }

    // Heuristic fallback if models are busy
    if (!parsedResult) {
      const words = transcript.split(/\s+/);
      const titleCandidate = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');

      parsedResult = {
        title: titleCandidate,
        summary: transcript.slice(0, 160) + (transcript.length > 160 ? '...' : ''),
        intent: occupation,
        sections: [
          {
            title: 'Notes',
            content: transcript,
          },
        ],
        actionItems: [],
      };
    }

    res.json({
      success: true,
      result: parsedResult,
    });
  } catch (error: any) {
    console.error('Error generating AI note transformation:', error);
    res.status(500).json({
      error: error.message || 'Failed to transform note with AI',
    });
  }
});

// Live transcript polisher / text editor assistant
app.post('/api/ai/edit-correction', async (req, res) => {
  try {
    const { transcript, instruction } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript required' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are an audio transcript editor. The user provides a raw transcript and an edit instruction:
Original Transcript:
"""${transcript}"""

User Instruction: "${instruction || 'Fix punctuation, grammar, and correct speech-to-text omissions while preserving authentic words.'}"

Output only the corrected transcript text without commentary.`,
    });

    res.json({
      correctedText: response.text?.trim() || transcript,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Correction failed' });
  }
});

// Setup Vite or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Aurora AI server running on port ${PORT}`);
  });
}

startServer();
