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

// --- Fallback AI Provider Engine (OpenAI, Ollama, Qwen, OpenRouter, Groq) ---
interface FallbackConfig {
  enabled: boolean;
  provider: 'openai' | 'ollama' | 'qwen' | 'openrouter' | 'groq' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  audioModel: string;
}

// In-memory runtime settings override
let runtimeFallbackConfig: Partial<FallbackConfig> = {};

function getFallbackConfig(): FallbackConfig {
  const envProvider = (process.env.FALLBACK_AI_PROVIDER || 'openai').toLowerCase().trim() as FallbackConfig['provider'];
  const provider = (runtimeFallbackConfig.provider || envProvider || 'openai') as FallbackConfig['provider'];

  let defaultBaseUrl = 'https://api.openai.com/v1';
  let defaultModel = 'gpt-4o-mini';
  let defaultAudioModel = 'whisper-1';

  if (provider === 'ollama') {
    defaultBaseUrl = 'http://localhost:11434/v1';
    defaultModel = 'llama3.2';
    defaultAudioModel = '';
  } else if (provider === 'qwen') {
    defaultBaseUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    defaultModel = 'qwen-plus';
    defaultAudioModel = '';
  } else if (provider === 'groq') {
    defaultBaseUrl = 'https://api.groq.com/openai/v1';
    defaultModel = 'llama-3.1-8b-instant';
    defaultAudioModel = 'whisper-large-v3-turbo';
  } else if (provider === 'openrouter') {
    defaultBaseUrl = 'https://openrouter.ai/api/v1';
    defaultModel = 'meta-llama/llama-3.1-8b-instruct';
    defaultAudioModel = '';
  }

  const enabledStr = runtimeFallbackConfig.enabled !== undefined
    ? String(runtimeFallbackConfig.enabled)
    : process.env.FALLBACK_AI_ENABLED;
  const enabled = enabledStr === 'false' ? false : true;

  const rawBaseUrl = runtimeFallbackConfig.baseUrl || process.env.FALLBACK_AI_BASE_URL || defaultBaseUrl;
  const apiKey = runtimeFallbackConfig.apiKey || process.env.FALLBACK_AI_API_KEY || '';
  const model = runtimeFallbackConfig.model || process.env.FALLBACK_AI_MODEL || defaultModel;
  const audioModel = runtimeFallbackConfig.audioModel || process.env.FALLBACK_AI_AUDIO_MODEL || defaultAudioModel;

  return {
    enabled,
    provider,
    baseUrl: rawBaseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
    audioModel,
  };
}

function isFallbackReady(): boolean {
  const cfg = getFallbackConfig();
  if (!cfg.enabled) return false;
  // Ollama running locally / self-hosted does not require an API key
  if (cfg.provider === 'ollama') return Boolean(cfg.baseUrl);
  // OpenAI, Qwen, Groq, OpenRouter require an API key
  return Boolean(cfg.apiKey && cfg.baseUrl);
}

function getProviderDisplayName(providerKey: string): string {
  switch (providerKey) {
    case 'qwen':
      return 'Qwen (DashScope)';
    case 'ollama':
      return 'Ollama (Local/Self-hosted)';
    case 'openai':
      return 'OpenAI';
    case 'groq':
      return 'Groq';
    case 'openrouter':
      return 'OpenRouter';
    case 'gemini':
      return 'Google Gemini';
    default:
      return 'Custom AI Engine';
  }
}

async function callFallbackChat({
  systemInstruction,
  prompt,
  jsonMode = false,
  timeoutMs = 15000,
}: {
  systemInstruction?: string;
  prompt: string;
  jsonMode?: boolean;
  timeoutMs?: number;
}): Promise<{ text: string; provider: string; providerName: string; model: string }> {
  const cfg = getFallbackConfig();
  if (!isFallbackReady()) {
    throw new Error(`Fallback AI provider (${getProviderDisplayName(cfg.provider)}) is not configured`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cfg.apiKey) {
    headers['Authorization'] = `Bearer ${cfg.apiKey}`;
  }

  const requestBody: any = {
    model: cfg.model,
    messages,
    temperature: 0.2,
  };

  if (jsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }

  try {
    let res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    // If json_object wasn't supported by this model (e.g. older Ollama), retry without response_format
    if (!res.ok && jsonMode && (res.status === 400 || res.status === 422)) {
      delete requestBody.response_format;
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Fallback provider (${getProviderDisplayName(cfg.provider)}) HTTP ${res.status}: ${errText.slice(0, 160)}`);
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new Error(`Empty response from fallback AI provider (${cfg.provider})`);
    }

    return {
      text: content.trim(),
      provider: cfg.provider,
      providerName: getProviderDisplayName(cfg.provider),
      model: cfg.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callFallbackAudioTranscription({
  audioBase64,
  mimeType,
  timeoutMs = 25000,
}: {
  audioBase64: string;
  mimeType: string;
  timeoutMs?: number;
}): Promise<string> {
  const cfg = getFallbackConfig();
  if (!isFallbackReady() || !cfg.audioModel) {
    return '';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const buffer = Buffer.from(audioBase64, 'base64');
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    const blob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', cfg.audioModel);
    formData.append('response_format', 'json');

    const headers: Record<string, string> = {};
    if (cfg.apiKey) {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }

    const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`Fallback audio transcription failed (${res.status}):`, errText);
      return '';
    }

    const data: any = await res.json();
    return data.text?.trim() || '';
  } catch (err: any) {
    console.warn(`Fallback audio transcription error:`, err?.message || err);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

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

// Providers Status & Health Endpoint
app.get('/api/ai/providers', (req, res) => {
  const cfg = getFallbackConfig();
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const fallbackReady = isFallbackReady();

  res.json({
    primary: {
      name: 'Google Gemini',
      provider: 'gemini',
      status: hasGeminiKey ? 'active' : 'missing_key',
      model: 'gemini-3.8-flash',
      audioModel: 'gemini-3.5-transcribe',
    },
    fallback: {
      name: getProviderDisplayName(cfg.provider),
      provider: cfg.provider,
      status: fallbackReady ? 'ready' : (cfg.enabled ? (cfg.provider === 'ollama' ? 'ready' : 'missing_key') : 'disabled'),
      model: cfg.model,
      audioModel: cfg.audioModel || undefined,
      baseUrl: cfg.baseUrl,
      isFallback: true,
    },
    autoFailover: cfg.enabled,
    activeProviderInUse: hasGeminiKey
      ? `Google Gemini (Auto-Failover: ${fallbackReady ? getProviderDisplayName(cfg.provider) : 'Standby'})`
      : (fallbackReady ? getProviderDisplayName(cfg.provider) : 'Offline Heuristics'),
  });
});

// Configure fallback settings (preset selection, Ollama URL, model name)
app.post('/api/ai/config-fallback', (req, res) => {
  try {
    const { provider, baseUrl, model, audioModel, enabled } = req.body;
    if (provider) runtimeFallbackConfig.provider = provider;
    if (baseUrl) runtimeFallbackConfig.baseUrl = baseUrl;
    if (model) runtimeFallbackConfig.model = model;
    if (audioModel !== undefined) runtimeFallbackConfig.audioModel = audioModel;
    if (enabled !== undefined) runtimeFallbackConfig.enabled = Boolean(enabled);

    const updated = getFallbackConfig();
    res.json({
      success: true,
      config: {
        provider: updated.provider,
        providerName: getProviderDisplayName(updated.provider),
        baseUrl: updated.baseUrl,
        model: updated.model,
        audioModel: updated.audioModel,
        enabled: updated.enabled,
        ready: isFallbackReady(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update config' });
  }
});

// Test Connection Endpoint for Primary or Fallback AI
app.post('/api/ai/test-provider', async (req, res) => {
  const target = req.body.target || 'fallback';
  const startTime = Date.now();

  if (target === 'primary') {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({
        success: false,
        error: 'GEMINI_API_KEY is not configured in the server environment.',
      });
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: 'Reply with the single word: "PONG"',
      });
      const latencyMs = Date.now() - startTime;
      return res.json({
        success: true,
        target: 'primary',
        providerName: 'Google Gemini',
        model: 'gemini-3.8-flash',
        latencyMs,
        reply: response.text?.trim() || 'PONG',
      });
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return res.status(500).json({
        success: false,
        target: 'primary',
        latencyMs,
        error: err.message || 'Gemini ping test failed',
      });
    }
  } else {
    // Fallback provider test
    const cfg = getFallbackConfig();
    if (!isFallbackReady()) {
      return res.status(400).json({
        success: false,
        target: 'fallback',
        error: `${getProviderDisplayName(cfg.provider)} is not ready. Configure FALLBACK_AI_API_KEY or verify the base URL.`,
      });
    }

    try {
      const result = await callFallbackChat({
        prompt: 'Respond with the single word: "PONG"',
        timeoutMs: 10000,
      });
      const latencyMs = Date.now() - startTime;
      return res.json({
        success: true,
        target: 'fallback',
        provider: result.provider,
        providerName: result.providerName,
        model: result.model,
        latencyMs,
        reply: result.text,
      });
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return res.status(500).json({
        success: false,
        target: 'fallback',
        latencyMs,
        error: err.message || 'Fallback ping test failed',
      });
    }
  }
});

// AI Audio Transcription Endpoint with Multi-Model & Fallback Support
app.post('/api/ai/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Valid audioBase64 string is required' });
    }

    const cleanMime = sanitizeAudioMime(mimeType);
    let transcribedText = '';
    let usedProvider = 'gemini';
    let usedProviderName = 'Google Gemini';

    // 1. Try Gemini primary transcription
    if (process.env.GEMINI_API_KEY) {
      const audioPart = {
        inlineData: {
          mimeType: cleanMime,
          data: audioBase64,
        },
      };

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
    }

    // 2. If Gemini was empty or failed, try Fallback Provider (e.g. OpenAI Whisper or Groq Whisper)
    if (!transcribedText && isFallbackReady()) {
      try {
        const fallbackText = await callFallbackAudioTranscription({
          audioBase64,
          mimeType: cleanMime,
        });
        if (fallbackText) {
          transcribedText = fallbackText;
          const cfg = getFallbackConfig();
          usedProvider = cfg.provider;
          usedProviderName = getProviderDisplayName(cfg.provider);
        }
      } catch (err: any) {
        console.warn('Fallback audio transcription error:', err?.message || err);
      }
    }

    res.json({
      success: true,
      transcript: transcribedText || '',
      provider: transcribedText ? usedProvider : undefined,
      providerName: transcribedText ? usedProviderName : undefined,
    });
  } catch (error: any) {
    console.error('Audio transcription error:', error);
    res.json({ success: true, transcript: '' });
  }
});

// AI Intent Transformation Endpoint with Multi-Model & Fallback Support
app.post('/api/ai/transform-note', async (req, res) => {
  try {
    let { transcript, audioBase64, mimeType, userOccupation, userFocus, audioDuration } = req.body;

    const occupation = (userOccupation || 'Professional').trim();
    const focus = (userFocus || '').trim();
    const durationSec = Math.round(audioDuration || 0);

    // If transcript is empty but audioBase64 is provided, attempt transcription first
    if ((!transcript || !transcript.trim()) && audioBase64) {
      if (process.env.GEMINI_API_KEY) {
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

      if ((!transcript || !transcript.trim()) && isFallbackReady()) {
        try {
          const fallbackText = await callFallbackAudioTranscription({
            audioBase64,
            mimeType: sanitizeAudioMime(mimeType),
          });
          if (fallbackText) transcript = fallbackText;
        } catch (err: any) {
          console.warn('Fallback audio transcribe in transform-note failed:', err);
        }
      }
    }

    const validTranscript = (transcript || '').trim();

    // If completely empty audio with no words, generate safe audio entry
    if (!validTranscript) {
      const defaultNote = {
        title: `Voice Recording (${durationSec}s)`,
        summary: `Audio recording (${durationSec}s) captured.`,
        intent: 'Voice Note',
        sections: [{ title: 'Audio Recording', content: `Recorded audio clip (${durationSec}s).` }],
        actionItems: [],
      };
      return res.json({
        success: true,
        result: defaultNote,
        provider: 'offline',
        providerName: 'Audio Capture',
      });
    }

    const systemInstruction = `You are Aurora AI, a clean and intelligent voice note structuring engine.
The user's occupation is: "${occupation}".
${focus ? `Their key focus or workflow preference: "${focus}".` : ''}

Analyze the user's spoken words, extract their core intent, correct any speech-to-text slips or omitted terms naturally, and format a clean, domain-appropriate structured note.

Return a JSON object matching this schema:
- title: clear title (3-6 words)
- summary: 1-2 sentence concise summary
- intent: concise category or intent label
- sections: array of { title: string, content: string } tailored to the occupation
- actionItems: array of { text: string, done: false }`;

    const prompt = `Audio Duration: ~${durationSec}s.
Transcript:
"""
${validTranscript}
"""`;

    let responseText = '';
    let usedProvider = 'gemini';
    let usedProviderName = 'Google Gemini';
    let usedModel = 'gemini-3.8-flash';

    // 1. Try Primary: Google Gemini
    if (process.env.GEMINI_API_KEY) {
      const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
      const timeoutPromise = (ms: number) =>
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Gemini timed out')), ms));

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
            usedModel = modelName;
            break;
          }
        } catch (err: any) {
          console.warn(`Primary Gemini model ${modelName} error:`, err?.message || err);
        }
      }
    }

    // 2. If Gemini is unavailable or failed, try Fallback AI Provider (Qwen, Ollama, OpenAI, etc.)
    if (!responseText && isFallbackReady()) {
      try {
        console.log('Failing over to fallback AI provider for note structuring...');
        const fallbackRes = await callFallbackChat({
          systemInstruction: `${systemInstruction}\nReturn ONLY valid JSON with keys: title, summary, intent, sections, actionItems.`,
          prompt,
          jsonMode: true,
          timeoutMs: 15000,
        });

        if (fallbackRes && fallbackRes.text) {
          responseText = fallbackRes.text;
          usedProvider = fallbackRes.provider;
          usedProviderName = fallbackRes.providerName;
          usedModel = fallbackRes.model;
        }
      } catch (fallbackErr: any) {
        console.warn('Fallback AI provider error in transform-note:', fallbackErr?.message || fallbackErr);
      }
    }

    let parsedResult: any = null;
    if (responseText) {
      try {
        parsedResult = JSON.parse(responseText);
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsedResult = JSON.parse(match[0]);
          } catch {
            // ignore
          }
        }
      }
    }

    // 3. Resilient heuristic format if both AI services were unreachable
    if (!parsedResult) {
      const words = validTranscript.split(/\s+/);
      const titleCandidate = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');

      parsedResult = {
        title: titleCandidate || `${occupation} Voice Note`,
        summary: validTranscript.slice(0, 160) + (validTranscript.length > 160 ? '...' : ''),
        intent: occupation,
        sections: [
          {
            title: 'Notes',
            content: validTranscript,
          },
        ],
        actionItems: [],
      };
      usedProvider = 'offline';
      usedProviderName = 'Heuristic Engine';
      usedModel = 'Local Format';
    }

    res.json({
      success: true,
      result: parsedResult,
      provider: usedProvider,
      providerName: usedProviderName,
      model: usedModel,
    });
  } catch (error: any) {
    console.error('Error generating AI note transformation:', error);
    res.status(500).json({
      error: error.message || 'Failed to transform note with AI',
    });
  }
});

// Live transcript polisher / text editor assistant with fallback
app.post('/api/ai/edit-correction', async (req, res) => {
  try {
    const { transcript, instruction } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript required' });
    }

    const editInstruction = instruction || 'Fix punctuation, grammar, and correct speech-to-text omissions while preserving authentic words.';
    let correctedText = '';
    let usedProvider = 'gemini';

    // 1. Try Gemini primary
    if (process.env.GEMINI_API_KEY) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `You are an audio transcript editor. The user provides a raw transcript and an edit instruction:
Original Transcript:
"""${transcript}"""

User Instruction: "${editInstruction}"

Output only the corrected transcript text without commentary.`,
        });
        if (response && response.text) {
          correctedText = response.text.trim();
        }
      } catch (err: any) {
        console.warn('Gemini edit-correction error:', err?.message || err);
      }
    }

    // 2. Try Fallback if primary failed
    if (!correctedText && isFallbackReady()) {
      try {
        const fallbackRes = await callFallbackChat({
          systemInstruction: 'You are an audio transcript editor. Return only the corrected transcript text without commentary.',
          prompt: `Original Transcript:\n"""${transcript}"""\n\nUser Instruction: "${editInstruction}"`,
          jsonMode: false,
        });
        if (fallbackRes && fallbackRes.text) {
          correctedText = fallbackRes.text.trim();
          usedProvider = fallbackRes.provider;
        }
      } catch (fallbackErr: any) {
        console.warn('Fallback edit-correction error:', fallbackErr?.message || fallbackErr);
      }
    }

    res.json({
      correctedText: correctedText || transcript,
      provider: usedProvider,
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
