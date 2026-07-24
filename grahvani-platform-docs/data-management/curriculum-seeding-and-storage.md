# Curriculum Seeding and Storage

This document outlines how the academic content for Grahvani is authored, processed, stored in the database, and seamlessly synchronized across both the frontend applications and backend data stores using a fully automated architecture.

## 1. Content Authoring (Docs-as-Code)

Curriculum content is not created directly inside a CMS or a database UI. Instead, it is authored as **Markdown (.md)** files stored in an isolated, private GitHub repository (`github.com/GrahVani/curriculum`).

This approach allows curriculum designers to:
- Use Git for version control (branching, PR reviews) of the syllabus.
- Write content in a familiar format.
- Define metadata (like titles, prerequisites, and layout type) using **YAML Frontmatter** at the top of the file.

## 2. The Dual-Webhook Synchronization Architecture

Because the `curriculum` repository is completely decoupled from the application repositories (`frontend` and `backend`), we implemented a **Dual-Webhook** system. When a content creator updates a lesson in GitHub and clicks "Save/Merge", two distinct automatic processes fire simultaneously to ensure both the frontend and backend are perfectly synchronized within 60 seconds, with zero developer intervention.

### Pipeline A: The Frontend Rendering Webhook
The frontend Next.js application serves lesson content directly from the server disk for 0ms latency. 
1. **The Build Process:** The `package.json` in the frontend contains a build script (`git clone https://${GITHUB_TOKEN}@github.com/GrahVani/curriculum.git ...`) that securely clones the private curriculum repository using a Personal Access Token injected by our hosting provider (Coolify).
2. **The Webhook Trigger:** We configured a Deploy Webhook in the GitHub `curriculum` repository pointing to Coolify.
3. **The Automatic Update:** When a curriculum push occurs, GitHub triggers the Coolify Webhook. Coolify automatically spins up a fresh build container, pulls the brand-new markdown files using the token, builds the Next.js app, and deploys it. Users immediately experience the fresh, updated lesson content upon their next page load.

### Pipeline B: The Backend Delta-Seeding Webhook
At the exact same time the frontend is rebuilding, the backend database must update its records so that tracking, progression, and the AI Tutor are aware of the new content.
1. **The Webhook Trigger:** A second Webhook is configured in the GitHub `curriculum` repository, pointing directly to our backend API: `POST /api/v1/learn/admin/import/curriculum`.
2. **Targeted UPSERTs (Delta Seeding):** When GitHub hits this route, the `learning-service` wakes up. Instead of wiping and re-seeding the entire 12-module database, it reads the files and performs a Targeted UPSERT (`INSERT ... ON CONFLICT UPDATE`) into PostgreSQL. It checks checksums and updates **only the specific lesson rows** that changed. Surrounding user progression data remains completely pristine.
3. **Triggering AI Vector Memory:** The millisecond the `learning-service` finishes the UPSERT in PostgreSQL, it emits an internal Redis event (`curriculum.content.updated`). As detailed in `vector-embedding.md`, this automatically triggers the AI to vectorize the new lesson text.

## 3. Serving the Content

- **The Frontend:** The frontend reads the raw Markdown files from its local container disk (cloned during the webhook-triggered build) and renders them instantly.
- **The Backend:** The backend maintains the relational structure in PostgreSQL (Lesson IDs, Modules, Prerequisites) to manage learning progress, cooldowns, and the AI RAG context.

### Why Not WebSockets?
Curriculum text is read-heavy and static between authoring updates. By using webhooks to trigger fresh frontend builds and backend UPSERTs, we achieve a highly scalable, cached architecture. WebSockets are strictly reserved for real-time, bi-directional communication (like streaming the AI Tutor's chat responses).
