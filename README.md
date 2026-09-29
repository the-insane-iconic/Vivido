# Vivido — Context-Aware AI Reading Environment

Vivido turns key concepts, diagrams, and scenes from real books and PDF documents into visual memory anchors in real time while you continue reading.

## Features Ready for Real PDFs

- **Real PDF Document Processing**: Open any PDF file via file picker, drag-and-drop directly onto the reader, or test with the built-in multi-page demonstration book.
- **Robust Rendering**: Smooth canvas rendering powered by PDF.js with cancellation-safe render task scheduling and Retina display high-DPI scaling.
- **Full Document Navigation**: Scrollable thumbnail strip, direct page jump input (`Go to page X`), and keyboard shortcuts (`←` / `→` or `PageUp` / `PageDown`).
- **Automatic Background Analysis**: Automatically detects the active page and queues background AI synthesis without interrupting reading.
- **Intelligent Visual Extraction**: Classifies genre (Technical, Narrative, Scientific, Philosophical, Historical), detects visual candidates (diagrams, dramatic scenes, conceptual metaphors, environments, character studies), and constructs source-grounded image prompts.
- **Real AI Image Generation**: Generates real AI artwork matching the page text (via Pollinations FLUX.1 diffusion engine zero-config, OpenAI DALL-E 3, or custom endpoints). No static placeholder photos.
- **Visual Memory Map**: View all visual anchors generated across the entire book in a visual timeline/gallery (`G` or toolbar icon).
- **"Where Did I Read That?" Book Search**: Fast semantic keyword search across extracted passages and visual memories (`Cmd+K` or `/`).
- **Interactive Visual Rail**: Click visual hooks to highlight source text on the page, inspect the generation prompt, download high-res assets, or retry individual hooks.

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Providers (Optional)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Vivido runs **out of the box with zero configuration** using its built-in semantic analysis engine and free FLUX AI diffusion image generation.

To connect external LLMs or image generators:
- **OpenAI**: Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL=gpt-4o-mini`, `IMAGE_PROVIDER=openai`)
- **Google Gemini**: Set `GEMINI_API_KEY` (and `GEMINI_MODEL=gemini-1.5-flash`)
- **Anthropic Claude**: Set `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL=claude-3-5-haiku-20241022`)
- **Ollama / OpenRouter / Local**: Set `OPENAI_BASE_URL` and `OPENAI_API_KEY`

### 3. Run Development Server

```bash
npm run dev
```

- **Web Reader**: [http://localhost:5173](http://localhost:5173)
- **API Server**: [http://localhost:8787](http://localhost:8787)
- **API Health**: [http://localhost:8787/api/health](http://localhost:8787/api/health)

---

## User Flow

```text
PDF (Upload or Drag & Drop)
  ↓
Active page detected (Debounced)
  ↓
POST /api/jobs/analyze-page
  ↓
Background queue (Async)
  ↓
Analysis provider (OpenAI / Gemini / Heuristic)
  ↓
Validated visual hooks (Kind, Priority, Source passage, Prompt)
  ↓
Image generation (Pollinations FLUX / DALL-E 3)
  ↓
SSE events stream to browser
  ↓
Visual rail updates progressively (Reader never blocks)
  ↓
IndexedDB persistent cache
```
