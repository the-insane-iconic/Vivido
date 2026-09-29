# Vivido — Complete Implementation Plan

## Project Goal

Vivido is a context-aware AI reading environment that turns important information in a book into visual memory anchors while the reader continues reading.

The final product should allow a user to:

1. Open a supported PDF.
2. Read it inside Vivido.
3. Automatically detect the page currently being read.
4. Extract and understand the page content.
5. Determine which parts of the page deserve visual representation.
6. Generate precise visual instructions using an analysis model.
7. Generate images using an image-generation model.
8. Display those images beside the reading surface without interrupting the reader.
9. Maintain semantic and visual continuity across pages.
10. Search the book using both text and generated visual memory.
11. Navigate from a visual memory result back to the original passage.
12. Explore a visual representation of the book's accumulated ideas.
13. Run the product reliably in production as a deployed web application and browser extension.

The implementation is deliberately divided into five milestones. Each milestone must produce a working system before the next one begins.

The final milestone is the production showcase version.

---

# Architecture Principles

These principles apply throughout the project.

## 1. Separate reading from AI processing

The reader must remain usable while AI work happens in the background.

The UI must never depend on an image generation request completing before the user can continue reading.

## 2. Separate page understanding from image generation

Use two logical AI stages:

### Analysis Model

Responsible for:

- page understanding
- semantic extraction
- genre/context recognition
- visual opportunity detection
- visual-hook selection
- prompt construction
- continuity requirements

### Image Model

Responsible only for:

- receiving a validated visual prompt
- generating the requested visual
- returning the generated asset

The analysis layer must never assume that an image model understands raw book text correctly.

## 3. Treat AI output as untrusted data

Every AI response must be:

- schema validated
- normalized
- bounded
- logged
- recoverable when invalid

Do not allow arbitrary model output to directly control application state.

## 4. Preserve source context

Every generated visual must retain references to:

- book
- document
- page
- source text span
- analysis result
- prompt
- model
- generation status
- generated asset

This allows every visual to be traced back to its source.

## 5. Prefer deterministic application logic around probabilistic models

The AI decides semantic meaning.

The application decides:

- when analysis happens
- how many jobs can run
- how jobs are retried
- how state is stored
- how images are displayed
- what happens when a provider fails
- what content belongs to which page
- how users navigate back to source content

## 6. Optimize for quality before quantity

The user's image limit is an upper bound, not a requirement.

The analysis layer should be capable of returning fewer visual hooks when the page does not contain enough meaningful visual material.

## 7. Keep the product visually quiet

Vivido should feel like a reading environment rather than an AI dashboard.

AI activity should be visible enough to establish trust but subtle enough not to interrupt reading.

---

# Recommended Technology Stack

## Frontend

- React
- TypeScript
- Vite
- CSS or a lightweight component system
- PDF.js for PDF rendering
- IndexedDB for local reader/cache state
- browser extension APIs for extension integration

## Backend

- Node.js
- TypeScript
- REST API for normal application operations
- Server-Sent Events or WebSockets for generation status
- PostgreSQL for persistent application data
- Object storage for generated images

## AI Layer

Use provider-neutral interfaces.

Required logical providers:

- page-analysis model
- image-generation model
- optional embedding model for semantic search

Do not couple the application's business logic directly to a single AI provider.

## Infrastructure

Use a production setup that supports:

- HTTPS
- environment variables/secrets
- persistent database
- object storage
- background jobs
- application logs
- error tracking
- rate limiting
- usage limits

A queue system may initially run inside the backend but should be structured so it can later be moved to Redis-backed workers or another dedicated job system without redesigning the product.

---

# Core Domain Model

Design the application around the following entities.

## User

Fields:

- id
- email or authentication identifier
- plan
- createdAt
- updatedAt

## Book

Fields:

- id
- userId
- title
- author
- sourceFile
- metadata
- createdAt
- updatedAt

## Document

Represents the uploaded PDF.

Fields:

- id
- bookId
- storageKey
- pageCount
- fileSize
- checksum
- processingStatus
- createdAt

## Page

Fields:

- id
- documentId
- pageNumber
- extractedText
- textBlocks
- readingPosition
- analysisStatus
- createdAt
- updatedAt

## PageAnalysis

Fields:

- id
- pageId
- summary
- genre
- tone
- setting
- entities
- concepts
- events
- visualCandidates
- model
- modelVersion
- promptVersion
- status
- createdAt

## VisualHook

Fields:

- id
- pageId
- sourceText
- title
- caption
- kind
- priority
- visualPrompt
- generationStatus
- generationAttempts
- createdAt
- updatedAt

## VisualAsset

Fields:

- id
- visualHookId
- storageKey
- width
- height
- mimeType
- provider
- model
- generationMetadata
- createdAt

## VisualEntity

Represents continuity information.

Fields:

- id
- bookId
- type
- name
- description
- visualAttributes
- firstSeenPage
- lastSeenPage
- confidence
- createdAt
- updatedAt

## SearchIndex

Stores text/semantic retrieval information.

Fields:

- id
- bookId
- pageId
- visualHookId
- content
- embedding
- metadata

---

# Global AI Contract

Every analysis model call should use a structured response.

The response must contain:

```text
page context
page summary
genre
tone
setting
entities
important concepts
events
visual candidates
```

Every visual candidate must contain:

```text
source span
visual type
importance
reason
scene description
environment
characters/entities
actions
composition
style constraints
continuity requirements
negative constraints
```

The server must validate this structure before anything reaches the image-generation layer.

---

# AI Prompt Construction Architecture

Do not send the raw page text directly to the image model as the primary mechanism.

Use this pipeline:

```text
Page Text
    ↓
Context Extraction
    ↓
Semantic Analysis
    ↓
Visual Candidate Selection
    ↓
Continuity Resolution
    ↓
Prompt Construction
    ↓
Prompt Validation
    ↓
Image Model
```

The prompt builder should combine:

- source-derived information
- book-level context
- page-level context
- continuity context
- visual style
- composition requirements
- safety/content constraints
- image-model requirements

Prompt versions must be stored so generation quality can be reproduced and evaluated later.

---

# Milestone 1 — The Magic

## Objective

Create the smallest complete version of the product:

```text
PDF
 ↓
Current page
 ↓
Page text
 ↓
AI analysis
 ↓
Visual prompt
 ↓
Image generation
 ↓
Visual rail
```

The milestone is complete when the user can open a PDF and receive generated visual hooks alongside the current page.

---

## 1.1 Build the reader shell

Implement:

- application layout
- top navigation
- document title
- page navigation
- page number indicator
- zoom
- left page navigation
- central reading surface
- right visual rail
- responsive desktop layout

The visual hierarchy should prioritize the book.

The visual rail is secondary.

---

## 1.2 Integrate PDF.js

Replace the static reader surface with actual PDF.js rendering.

Implement:

- PDF upload
- PDF loading
- page rendering
- page navigation
- scrolling
- zoom
- page count
- page selection
- page rendering state
- page errors

The reader must remain functional if AI services are unavailable.

---

## 1.3 Extract page text

Build a page-text extraction service.

Store:

- raw extracted text
- text block positions
- page number
- extraction status

Preserve text positions because later versions may need to highlight the source passage associated with a visual.

---

## 1.4 Detect the active page

The system should know which page the user is reading.

Support:

- explicit page navigation
- scroll-based page detection
- active page state
- debounce
- prefetch of nearby pages

Avoid repeatedly triggering analysis while the user is rapidly scrolling.

---

## 1.5 Create the analysis API

Create:

```text
POST /api/pages/:pageId/analyze
```

Input:

- page identifier
- analysis configuration

Output:

- validated PageAnalysis object

The API should:

1. load page text
2. load book context if available
3. call the analysis model
4. validate the response
5. store the analysis
6. return the normalized result

---

## 1.6 Create the image API

Create:

```text
POST /api/visual-hooks/:hookId/generate
```

The endpoint should:

1. load the visual hook
2. validate its prompt
3. call the image provider
4. store the result
5. update generation state
6. return the asset reference

Never expose provider API keys to the browser.

---

## 1.7 Build the visual rail

The visual rail should support:

- queued hooks
- generating state
- completed state
- failure state
- retry
- image preview
- hook title
- short caption
- source-page association

Images should appear progressively.

The UI must not wait for all images before displaying the first completed image.

---

## 1.8 Implement the first background workflow

Use this lifecycle:

```text
page detected
    ↓
analysis queued
    ↓
analysis running
    ↓
analysis completed
    ↓
visual hooks created
    ↓
image jobs queued
    ↓
image generation running
    ↓
image completed
    ↓
visual appears
```

The user should be able to continue reading during the entire process.

---

## 1.9 Milestone 1 completion criteria

The milestone is complete only when:

- a real PDF can be opened
- real pages can be rendered
- page text can be extracted
- active page can be detected
- the analysis model receives the current page
- visual hooks are returned
- images are generated through an API
- images appear progressively
- the reader remains usable during generation
- failed image jobs can be retried
- provider credentials are never exposed to the client

---

# Milestone 2 — The Intelligence

## Objective

Turn the basic pipeline into a context-aware visual system.

The system must determine what type of visual representation is appropriate for the content instead of applying one image-generation strategy to every page.

---

## 2.1 Build page classification

The analysis layer should classify contextual properties including:

- genre
- document type
- tone
- temporal setting
- geographic setting
- fictional versus factual context
- narrative versus explanatory structure

Classification should be stored with confidence information.

---

## 2.2 Build visual candidate detection

The analysis layer should identify candidate information such as:

- important scenes
- meaningful actions
- environments
- objects
- metaphors
- symbols
- relationships
- processes
- conceptual relationships

Candidates must receive importance scores.

---

## 2.3 Build visualizability scoring

A candidate should be evaluated on:

- semantic importance
- visual clarity
- memorability
- uniqueness
- redundancy
- source support
- suitability for image representation

The system should discard weak candidates.

---

## 2.4 Build visual-type routing

Create different prompt strategies for different information types.

Possible internal routes include:

```text
narrative scene
environment
character moment
metaphor
symbolic composition
conceptual illustration
technical diagram
process visualization
spatial relationship
```

The model should select the appropriate route based on content.

---

## 2.5 Build source-grounded prompt generation

The prompt generator must remain faithful to the page.

It should distinguish:

- directly stated information
- strongly implied information
- visual interpretation
- symbolic representation

Do not allow visual interpretation to be represented as factual source information.

---

## 2.6 Build prompt validation

Before sending prompts to the image model, validate:

- prompt length
- required scene fields
- source grounding
- absence of unsupported critical details
- required environment
- required action/state
- visual style
- negative constraints

Reject or regenerate malformed prompts.

---

## 2.7 Build genre-aware visual strategies

The architecture must support different rendering strategies without hardcoding the entire system to a specific genre.

Create a strategy registry:

```text
GenreStrategy
    analyzeContext()
    selectVisualType()
    buildPrompt()
    validatePrompt()
```

Strategies should be configurable and versioned.

---

## 2.8 Build intelligent image count

Do not force a fixed number of images.

Calculate:

```text
maximum allowed hooks
        ↓
candidate detection
        ↓
candidate scoring
        ↓
redundancy filtering
        ↓
final hook selection
```

The user's preference becomes a maximum.

---

## 2.9 Add semantic deduplication

Prevent several images from representing essentially the same idea.

Use:

- semantic similarity
- source-span overlap
- concept overlap
- candidate priority

Only retain distinct memory anchors.

---

## 2.10 Milestone 2 completion criteria

The milestone is complete when:

- different document types are handled differently
- visual candidates are selected intelligently
- weak candidates are discarded
- metaphors and concepts are treated differently from literal scenes
- image counts adapt to page content
- prompts are grounded in source text
- duplicate visuals are filtered
- prompt validation prevents malformed image requests
- the same architecture works across different book genres

---

# Milestone 3 — The Engineering

## Objective

Transform the prototype into a reliable asynchronous application.

This milestone focuses on performance, scalability, caching, recovery and production-quality behavior.

---

## 3.1 Introduce background jobs

Separate user requests from long-running AI work.

Create job types:

```text
PAGE_ANALYSIS
VISUAL_SELECTION
IMAGE_GENERATION
EMBEDDING
INDEXING
```

Each job must have:

- id
- type
- status
- priority
- attempts
- maximumAttempts
- payload reference
- error
- createdAt
- startedAt
- completedAt

---

## 3.2 Create a job queue

The queue should support:

- pending
- processing
- completed
- failed
- retrying
- cancelled

Add exponential backoff for transient failures.

Do not retry permanent validation failures indefinitely.

---

## 3.3 Add concurrency control

Limit simultaneous AI requests.

Use separate limits for:

- page analysis
- image generation
- embeddings

This protects both cost and provider quotas.

---

## 3.4 Add streaming status updates

Use Server-Sent Events or WebSockets.

Events should communicate:

```text
analysis.started
analysis.completed
hook.created
image.started
image.completed
image.failed
page.ready
```

The client should update immediately when a job changes state.

---

## 3.5 Add caching

Cache:

- extracted PDF text
- page analysis
- visual prompts
- generated images
- embeddings

Use stable content hashes where possible.

If identical content has already been processed under the same model/prompt version, avoid unnecessary regeneration.

---

## 3.6 Add local client storage

Use IndexedDB for:

- recently opened books
- reading position
- page analysis cache
- visual hook metadata
- image references
- pending client state

The user should not lose their reading position because the network temporarily fails.

---

## 3.7 Add prefetching

When the user is reading page N:

- analyze page N
- optionally prepare page N+1
- avoid processing large numbers of unseen pages

Prefetching must respect usage limits.

---

## 3.8 Add retry and recovery

Every long-running operation must recover from:

- network interruption
- provider timeout
- provider rate limit
- malformed model response
- image generation failure
- browser refresh
- backend restart

Jobs must be idempotent.

---

## 3.9 Add observability

Track:

- analysis latency
- image latency
- queue latency
- generation success rate
- retry rate
- provider failures
- average images per page
- cache hit rate
- cost per processed page
- user-visible generation delay

Do not log raw private book content unnecessarily.

---

## 3.10 Add cost controls

Implement:

- per-user usage limits
- page processing limits
- image generation limits
- model selection by plan
- caching
- maximum queue depth
- request cancellation

The system should be designed so that one user cannot accidentally create unlimited image-generation costs.

---

## 3.11 Add security

Implement:

- authentication
- authorization
- secure file handling
- file-size limits
- MIME validation
- malware scanning where appropriate
- signed asset URLs
- API rate limiting
- secret management
- database access controls
- CSRF protection where applicable
- input validation
- output validation

Never trust uploaded filenames or model output.

---

## 3.12 Milestone 3 completion criteria

The milestone is complete when:

- AI work runs asynchronously
- the reader never blocks on generation
- generation progress streams to the UI
- jobs retry safely
- results are cached
- duplicate processing is avoided
- client state survives refresh
- usage is bounded
- API credentials remain private
- failures are observable
- the system can recover after backend interruption

---

# Milestone 4 — Visual Continuity

## Objective

Make generated visuals behave like parts of one coherent book rather than isolated AI generations.

This is the milestone that gives Vivido a strong technical identity.

---

## 4.1 Build the Visual Bible

Create a book-level continuity system.

The Visual Bible contains:

```text
characters
locations
objects
organizations
recurring concepts
visual style
historical context
world rules
```

Each entity should contain:

- canonical name
- aliases
- description
- relevant attributes
- first appearance
- last appearance
- source pages
- confidence
- visual constraints

---

## 4.2 Extract recurring entities

During page analysis, identify entities that may recur.

Resolve whether a newly detected entity is:

- existing
- new
- uncertain

Do not automatically merge uncertain entities.

---

## 4.3 Maintain entity continuity

When generating a visual, retrieve relevant Visual Bible information.

The prompt builder should receive only context relevant to the current visual.

Do not send the entire book context to every image model request.

---

## 4.4 Maintain environment continuity

Track recurring locations and environments.

Store relevant:

- architecture
- geography
- time period
- weather patterns where source-supported
- environmental characteristics
- visual constraints

---

## 4.5 Maintain object continuity

Important recurring objects should maintain stable descriptions.

Track:

- appearance
- function
- ownership
- relevant changes
- first/last appearance

---

## 4.6 Maintain visual style

Create a book-level style profile.

Possible properties:

- realism level
- illustration level
- color characteristics
- lighting approach
- composition preference
- visual abstraction
- historical treatment

The style profile must support the content rather than overpower it.

---

## 4.7 Resolve contradictions

When the source later changes previously inferred information:

- prioritize newer source-supported information
- preserve historical versions where useful
- mark uncertain continuity
- do not silently overwrite important conflicting facts

---

## 4.8 Add continuity validation

Before image generation:

```text
current page
    ↓
visual candidate
    ↓
entity retrieval
    ↓
continuity context
    ↓
prompt
    ↓
continuity validation
    ↓
image generation
```

The validator should identify obvious conflicts before spending image-generation credits.

---

## 4.9 Add visual asset versioning

Store:

- prompt version
- model
- model version
- continuity context version
- generation timestamp

This allows future regeneration when models improve.

---

## 4.10 Milestone 4 completion criteria

The milestone is complete when:

- recurring entities are detected
- entities can be resolved across pages
- characters remain visually coherent
- locations remain coherent
- recurring objects remain coherent
- book-level visual style persists
- contradictions are handled explicitly
- prompts contain only relevant continuity information
- generated assets are reproducible through stored metadata

---

# Milestone 5 — Production Showcase

## Objective

Turn Vivido into a complete, deployable product that can be demonstrated to real users.

This milestone should produce the version used for portfolio demonstrations, public testing and deployment.

---

# 5.1 Build semantic book search

Implement:

```text
keyword search
+
semantic search
+
visual-hook search
```

Search should cover:

- extracted page text
- page summaries
- concepts
- entities
- visual hook descriptions
- source passages

---

## 5.2 Build embeddings

Generate embeddings for:

- page chunks
- page summaries
- visual hooks
- important concepts

Store embeddings in a vector-capable database.

Use the same indexing pipeline for both newly processed and previously processed pages.

---

## 5.3 Build “Where did I read that?”

The user should be able to search a concept or phrase and receive:

- matching pages
- relevant source passages
- associated visual hooks
- page navigation

Selecting a result should move the reader to the correct page.

The visual hook must remain connected to its original source.

---

## 5.4 Build the Visual Memory Map

Create a book-level visual navigation experience.

It should expose:

- important concepts
- recurring entities
- major visual hooks
- page relationships
- chronological or structural progression where appropriate

The map should be generated from stored data rather than regenerated from the book every time the user opens it.

---

## 5.5 Build visual-to-source navigation

Every visual must provide:

- source page
- source text
- navigation target

Selecting a visual should return the user to the relevant location in the book.

---

## 5.6 Build book-level state

Persist:

- current page
- reading progress
- bookmarks
- visual hooks
- generated assets
- search history where appropriate
- Visual Bible
- analysis state

The user should be able to close the application and return later.

---

## 5.7 Build authentication

Implement:

- account creation
- login
- session management
- logout
- password recovery if password authentication is used
- account deletion

Ensure every book and generated asset is scoped to the authenticated user.

---

## 5.8 Build usage and subscription architecture

Even if payments are not enabled initially, design the system around plans.

Possible limits:

- books
- pages processed
- images generated
- storage
- semantic search
- advanced models

Keep entitlement checks centralized on the backend.

Do not rely on frontend-only restrictions.

---

## 5.9 Build polished onboarding

The first session should communicate the product without requiring documentation.

Onboarding should explain:

- open a book
- start reading
- visuals appear automatically
- visual hooks connect back to source text
- the book develops a visual memory layer

Avoid unnecessary configuration.

---

## 5.10 Build loading and failure states

Every AI operation needs a polished state.

Required states:

```text
waiting
queued
analyzing
selecting
generating
completed
retrying
failed
cancelled
```

The UI should never display unexplained blank spaces.

---

## 5.11 Build privacy controls

Give users control over:

- uploaded books
- generated assets
- account data
- deletion
- retention

Clearly communicate whether uploaded content is sent to external AI providers.

Do not store unnecessary book content.

---

## 5.12 Build provider abstraction

Create provider interfaces:

```text
PageAnalysisProvider
ImageGenerationProvider
EmbeddingProvider
```

The application should be able to switch providers without rewriting the product.

Store provider and model metadata with every AI result.

---

## 5.13 Build evaluation infrastructure

Create a dataset-free evaluation framework that can test:

### Analysis quality

- source grounding
- candidate relevance
- visualizability
- redundancy
- genre routing

### Prompt quality

- completeness
- specificity
- continuity
- source fidelity

### Image quality

- prompt adherence
- visual usefulness
- continuity
- absence of unwanted text
- consistency

### Product quality

- time to first visual
- generation reliability
- interaction latency
- reader interruption rate

Human review should be used for final visual-quality evaluation.

---

## 5.14 Add model/version tracking

Every AI result should record:

```text
provider
model
model version
prompt version
application version
generation timestamp
```

This allows comparison between future AI providers and prompt improvements.

---

## 5.15 Production database

Move persistent data to PostgreSQL.

Create migrations for:

- users
- books
- documents
- pages
- analyses
- visual hooks
- visual assets
- entities
- search records
- jobs
- usage records

Add appropriate indexes.

---

## 5.16 Object storage

Store PDFs and generated images outside the application server filesystem.

Use:

- object storage
- signed URLs
- lifecycle policies
- appropriate access control

Do not serve private user assets through unrestricted public URLs.

---

## 5.17 Production deployment

Deploy:

```text
Frontend
    ↓
HTTPS
    ↓
Application/API
    ↓
PostgreSQL

Application
    ↓
Job Queue
    ↓
AI Workers
    ↓
AI Providers

Generated Assets
    ↓
Object Storage/CDN
```

Use separate environments:

```text
development
staging
production
```

Never use production credentials during local development.

---

## 5.18 Browser extension deployment

The extension should eventually provide:

- opening Vivido from supported PDF contexts
- side-panel access where appropriate
- authentication
- communication with the deployed backend
- secure session handling
- reader integration

Do not put AI provider credentials into the extension.

The extension communicates with Vivido's backend.

---

## 5.19 Domain and public application

Prepare:

- production domain
- HTTPS
- application hosting
- API hosting
- database
- object storage
- monitoring
- error tracking

Create a public landing page explaining the product.

---

## 5.20 Production security review

Before public deployment verify:

- authentication boundaries
- authorization
- file upload restrictions
- API rate limits
- prompt injection resistance
- model-output validation
- signed asset access
- database permissions
- secret management
- user deletion
- data retention
- error-message leakage
- logging of sensitive content

---

# Final User Flow

The completed product should feel like this:

```text
USER
  │
  ▼
Open Vivido
  │
  ▼
Open PDF
  │
  ▼
Reader renders document
  │
  ▼
User reads
  │
  ▼
Active page detected
  │
  ▼
Page enters processing queue
  │
  ├──────────────► Reader remains usable
  │
  ▼
Analysis Model
  │
  ▼
Semantic page representation
  │
  ▼
Visual candidate selection
  │
  ▼
Visual Bible lookup
  │
  ▼
Prompt construction
  │
  ▼
Prompt validation
  │
  ▼
Image queue
  │
  ▼
Image Model
  │
  ▼
Asset storage
  │
  ▼
Realtime event
  │
  ▼
Visual appears in rail
  │
  ▼
User continues reading
```

---

# Final Product Architecture

```text
                         ┌────────────────────┐
                         │       USER         │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │  Vivido Reader     │
                         │ React + PDF.js     │
                         └─────────┬──────────┘
                                   │
                   ┌───────────────┼────────────────┐
                   │               │                │
                   ▼               ▼                ▼
              Page State       Visual Rail      Search UI
                   │
                   ▼
             Backend API
                   │
          ┌────────┴─────────┐
          │                  │
          ▼                  ▼
     Page Pipeline      Search Pipeline
          │                  │
          ▼                  ▼
     Job Queue          Embeddings
          │                  │
          ▼                  ▼
   Analysis Worker       Vector DB
          │
          ▼
    Analysis Model
          │
          ▼
  Visual Candidate Layer
          │
          ▼
   Visual Bible
          │
          ▼
   Prompt Builder
          │
          ▼
   Prompt Validator
          │
          ▼
    Image Queue
          │
          ▼
    Image Worker
          │
          ▼
    Image Model
          │
          ▼
   Object Storage
          │
          ▼
     Realtime Events
          │
          ▼
      Visual Rail
```

---

# Development Order

Do not build the entire system simultaneously.

Follow this order exactly:

## Stage A

Reader foundation:

- React
- TypeScript
- PDF.js
- page navigation
- page detection
- text extraction

## Stage B

First AI pipeline:

- analysis endpoint
- structured AI output
- visual-hook schema
- image endpoint
- visual rail

## Stage C

Automatic experience:

- background generation
- progressive rendering
- retry
- caching
- prefetch

## Stage D

Intelligence:

- visual candidate scoring
- genre routing
- metaphor/concept handling
- redundancy filtering
- prompt validation

## Stage E

Continuity:

- Visual Bible
- entity resolution
- character continuity
- environment continuity
- object continuity
- style continuity

## Stage F

Memory:

- embeddings
- semantic search
- visual-to-source navigation
- Visual Memory Map

## Stage G

Production:

- authentication
- PostgreSQL
- object storage
- queues
- monitoring
- usage limits
- privacy controls
- security review
- deployment

## Stage H

Showcase:

- production domain
- deployed web application
- browser extension
- polished onboarding
- public landing page
- demonstration book
- documented architecture
- performance metrics
- project documentation

---

# Definition of Done

Vivido is ready for public showcase only when a new user can:

1. Visit the deployed product.
2. Create an account.
3. Open a PDF.
4. Read normally.
5. Have the active page detected automatically.
6. Receive AI-generated visual hooks without manually requesting each image.
7. See images appear progressively.
8. Continue reading without waiting for generation.
9. Navigate between pages normally.
10. Return to previously generated visuals.
11. Search the book semantically.
12. Jump from a visual result back to its source passage.
13. Open the book's visual memory layer.
14. Close the application.
15. Return later and retain their reading state.
16. Recover from failed generation jobs.
17. Delete their uploaded book and associated generated assets.

The product should remain usable even when AI services are temporarily unavailable.

---

# Showcase Requirements

The final demonstration should show the system rather than merely describe it.

The showcase should demonstrate:

- a real PDF
- automatic page detection
- background analysis
- progressive image generation
- genre/context-aware visual selection
- visual continuity across multiple pages
- visual-to-source navigation
- semantic book search
- Visual Memory Map
- persistence after refresh
- deployed production environment

The architecture should be explainable at three levels:

### User level

Vivido creates visual memories while you read.

### Product level

Vivido understands the page, selects important visual ideas, generates context-aware visuals and builds a visual memory layer around the book.

### Engineering level

Vivido combines document processing, structured LLM orchestration, asynchronous job processing, image generation, semantic retrieval, entity continuity, persistent storage and browser-based reading into one system.

---

# Engineering Quality Bar

Before calling the project complete, verify:

- TypeScript has no avoidable type errors.
- API inputs and outputs are schema validated.
- AI responses are validated before persistence.
- Background jobs are idempotent.
- Retries are bounded.
- Provider credentials never reach the client.
- User data is isolated between accounts.
- Uploaded files are validated.
- Generated assets are access-controlled.
- Database queries are indexed appropriately.
- The reader does not block on AI generation.
- AI failures do not crash the reader.
- Generated visuals retain source references.
- Model and prompt versions are recorded.
- Logs do not unnecessarily expose private book content.
- Usage limits are enforced server-side.
- Production secrets are stored securely.
- The deployed system can be monitored.
- The application has a documented recovery procedure.

---

# Final Milestone Outcome

At the end of Milestone 5, Vivido should no longer be described as a PDF viewer with an image-generation API.

It should be a complete AI reading system with:

```text
Document understanding
        +
Visual reasoning
        +
Context-aware generation
        +
Asynchronous AI infrastructure
        +
Cross-page continuity
        +
Semantic retrieval
        +
Visual memory
        +
Production deployment
```

The central product loop remains deliberately simple:

**Read → understand → visualize → remember.**

Everything else in the architecture exists to make that loop reliable, intelligent and useful.
