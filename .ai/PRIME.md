State-Hash: ea3adc38b555d37fa3bbf122a44db7bdc8c0e9c6-4aeee8fc4564b0cf9e727e5cd2b74439

# Baseline - Repository Prime Context (Updated)

## Overview
Baseline is a local-first Electron desktop application for writing and AI-assisted text generation. 

## Key Features & Architecture Updates
- **Fuzzy Intellisense**: A custom Tiptap extension (`GhostIntellisense.js`) that provides inline, greyed-out word suggestions. It uses a fuzzy subsequence matching algorithm (`suggestion.js`) against the vocabulary found in the AI ghost text.
- **Centralized Settings System**: 
  - A data-driven schema (`settingsSchema.js`) manages all application configurations.
  - Settings are no longer in popups; they are integrated as a dynamic "Settings" tab in the `ProjectView`.
  - Supports a "Basic Editor" mode which disables MiniLM embeddings and matching UI.
- **UI Architecture**:
  - `App.jsx` manages global theme and settings visibility.
  - `ProjectView.jsx` handles tab switching between Brain Dump, AI Versions, Writing, and the new Settings view.
  - `SettingsContent.jsx` renders a minimalist, left-aligned settings list with custom monochrome toggles.

## Tech Stack
- Electron, React, Vite.
- Tiptap (ProseMirror) for rich text editing.
- MiniLM (via `@xenova/transformers`) for local sentence similarity (can be toggled off).
- Custom CSS Modules for styling.

## Project Structure
- `src/extensions/`: Contains the `GhostIntellisense` Tiptap plugin.
- `src/utils/`: Includes `suggestion.js` (fuzzy matching) and `settingsSchema.js`.
- `src/components/`: Modular UI components including `SettingsContent` and updated `Titlebar` (now simplified).
