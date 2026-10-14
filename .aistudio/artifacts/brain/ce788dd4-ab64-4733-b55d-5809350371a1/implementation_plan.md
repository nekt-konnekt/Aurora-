# AuraNote AI - Ambient Floating Voice Note Workspace

A lightweight, persona-adaptive voice note application with a persistent floating recorder pill, real-time offline transcription, offline-first local queue persistence, and server-side Gemini AI for specialized intent extraction tailored to artists, lawyers, doctors, architects, consultants, and custom user profiles.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions were aligned based on your responses:
> - **Persona Architecture**: Includes built-in professional modes (Artist, Lawyer, Doctor, Architect, Consultant) **plus** a custom persona builder where you can define bespoke prompts, extraction guidelines, and custom fields.
> - **Floating Widget Interface**: A draggable floating pill (Dynamic Island style) that hovers over any screen content, features live micro-waveform feedback, quick mic toggles, and expands seamlessly into either a quick-capture drawer or full workspace dashboard.
> - **Storage & Sync Strategy**: Offline-first storage using client-side IndexedDB/localStorage with offline Web Speech transcription, raw audio blob recording, automatic sync status tracking, and instant one-click Markdown (.md), audio (.webm/.wav), and JSON export.

---

### 1. Overview & Core Concept

**AuraNote AI** transforms spoken thoughts into structured, domain-native notes. Rather than producing generic transcript dumps, it dynamically adapts its cognitive filter based on the active persona:
- **Artist / Songwriter**: Extracts poetic imagery, rhyme candidates, chord progressions, tempo/mood suggestions, song section markers (verse, chorus, bridge), and visual sketches.
- **Lawyer / Counsel**: Formats formal legal memoranda, facts chronology, potential liability exposure, precedent citations, and privileged attorney-client work product.
- **Doctor / Clinician**: Generates standardized SOAP notes (Subjective, Objective, Assessment, Plan), symptoms timeline, medication mentions, and follow-up orders.
- **Architect / Spatial Designer**: Extracts site conditions, spatial dimensions, material specifications, zoning considerations, and contractor punch-list tasks.
- **Management Consultant**: Synthesizes executive summaries, MECE problem breakdowns, key risks, next steps, and RACI stakeholder actions.
- **Custom Profiles**: Create and save custom roles (e.g., Academic Researcher, Podcaster, Software Architect) with custom prompt directives and structured outputs.

---

### 2. User Experience & Visual Design

#### A. Key User Flows
1. **Onboarding & Persona Selection**:
   - First-time modal introducing the concept and inviting the user to pick an initial persona with preview cards showing how note formatting differs.
   - Persona switchable anytime via a top-bar dropdown or floating pill chip.
2. **Ambient Floating Pill Interaction**:
   - Draggable across the screen with collision bounds.
   - States:
     - *Idle Pill*: Sleek capsule showing persona icon, mic trigger, and quick status.
     - *Recording Pill*: Expands smoothly with live animated audio equalizer bars, elapsed timer, and live offline speech transcript preview.
     - *Expanded Quick-Capture*: Slide-down drawer to view recent transcript, toggle auto-sync, or apply AI intent processing.
     - *Full Dashboard Toggle*: Expands or minimizes to full-screen note management studio.
3. **Recording & Offline Transcription**:
   - Web Speech API provides instant zero-latency speech-to-text without network connection.
   - MediaRecorder captures audio stream for local audio playback and download.
4. **Intent Transformation & Note Generation**:
   - Gemini 3.8 Flash processes the transcript with the persona's specialized system prompt.
   - Generates: concise title, executive summary, domain-tailored structured sections, detected intent tags, and checklist action items.
5. **Dashboard Management & Multi-Format Export**:
   - Searchable, filterable note grid by persona, tag, date, and sync status.
   - Audio playback scrubber with waveform visualization.
   - One-click export to Markdown (`.md`), Audio download (`.webm`), or Clipboard copy.

#### B. Visual Identity & Theme
- **Aesthetic Direction**: Utilitarian Swiss minimalism meets ambient modern interface. Clean, focused, high contrast, zero-clutter.
- **Color Palette**:
  - Dominant Canvas: Deep slate-zinc dark mode (`#090D16` / `#0F172A`) with warm light-mode support (`#F8FAFC`).
  - Structural Surfaces: Hairline bordered cards (`border-slate-800/80` or `border-slate-200`) with subtle backdrop blurs.
  - Accent Palette: Focused electric violet (`#6366F1`) and energetic cyan (`#06B6D4`) for recording states; domain-specific tint badges (Amber for Legal, Emerald for Clinical, Rose for Artist, Sky for Architect, Indigo for Consultant).
- **Typography**:
  - Display & Headings: `Plus Jakarta Sans` / `Outfit` (clean geometric clarity).
  - Body Prose: `Public Sans` / `DM Sans`.
  - Timers & Audio Scrubbers: `tabular-nums font-mono` for stable alignment.
- **Anti-Slop Discipline**: No arbitrary AI scoreboards, no pulsing green dots on static cards, no thick left accent stripes, no code comment prefixes.

---

### 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale & Trade-offs |
| :--- | :--- | :--- |
| **Transcription Engine** | Hybrid: Web Speech API (offline) + Server Gemini (intent structure & refinement) | Guarantees instant local recording even with no internet connection, while server-side Gemini provides deep domain-specific restructuring. |
| **Floating UI Architecture** | Draggable React Portal with pointer physics & state sync | Lets the user minimize into a tiny pill while testing web pages or working in other tabs, or expand into the full note-taking studio. |
| **Data Storage** | Local-First IndexedDB with Sync Status Queue & Export | Ensures all notes and audio recordings persist locally without mandatory login, while simulating real-time cloud sync and enabling instant Markdown/audio exports. |
| **Custom Persona Engine** | User-defined schemas with template presets | Gives complete flexibility to customize prompt instructions, extraction schema keys, and sample outputs. |

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AuraNote AI Architecture                        │
└────────────────────────────────────────────────────────────────────────┘

  +--------------------------------------------------------------------+
  |                        Browser / Client Layer                      |
  |                                                                    |
  |  +---------------------------+       +--------------------------+  |
  |  | Draggable Floating Pill   | <===> | Full Studio Dashboard    |  |
  |  | • Micro-Visualizer        |       | • Note Library & Search  |  |
  |  | • Instant Mic Controls    |       | • Persona Manager & Edit |  |
  |  | • Quick Transcript Drawer |       | • Markdown / Audio Export|  |
  |  +---------------------------+       +--------------------------+  |
  |                │                                   │               |
  |                ▼                                   ▼               |
  |  +──────────────────────────────────────────────────────────────+  |
  |  | Audio Engine & Web Speech API                                 |  |
  |  | • MediaRecorder (Local Audio Blobs)                          |  |
  |  | • SpeechRecognition (Zero-latency offline transcription)     |  |
  |  +──────────────────────────────────────────────────────────────+  |
  |                                │                                   |
  |                                ▼                                   |
  |  +──────────────────────────────────────────────────────────────+  |
  |  | Offline-First Persistence Store (IndexedDB / LocalStorage)   |  |
  |  | • Notes Collection & Audio Cache                             |  |
  |  | • Sync Queue (Pending vs Synced)                             |  |
  |  | • Custom Persona Profiles Storage                            |  |
  |  +──────────────────────────────────────────────────────────────+  |
  +────────────────────────────────┬───────────────────────────────────+
                                   │ HTTP POST (SSE/JSON)
                                   ▼
  +────────────────────────────────────────────────────────────────────+
  |                   Server Layer (Express + TypeScript)              |
  |                                                                    |
  |  +--------------------------------------------------------------+  |
  |  | POST /api/ai/transform-note                                  |  |
  |  | • Persona Prompt Builder (Artist, Lawyer, Doctor, etc.)      |  |
  |  | • Calls @google/genai SDK with gemini-3.8-flash              |  |
  |  | • Structured Intent Extraction (JSON Schema)                 |  |
  |  +--------------------------------------------------------------+  |
  |  +--------------------------------------------------------------+  |
  |  | POST /api/sync/backup & GET /api/sync/status                 |  |
  |  | • Cloud sync endpoint simulation                             |  |
  |  +--------------------------------------------------------------+  |
  +────────────────────────────────────────────────────────────────────+
```

#### Data Entities:
- **`VoiceNote`**: `id`, `title`, `rawTranscript`, `structuredNote`, `personaId`, `audioBlobUrl`, `audioDuration`, `createdAt`, `syncStatus ('synced' | 'pending' | 'offline')`, `tags`, `actionItems`.
- **`PersonaProfile`**: `id`, `name`, `icon`, `roleDescription`, `outputFormat`, `systemPromptTemplate`, `defaultTags`, `isCustom`.
