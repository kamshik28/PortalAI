// src/lib/openaiChat.ts
// Thin wrapper that exports a shared OpenAI client for chat completions.
// Embedding is handled separately in openaiEmbeddings.ts.

import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
if (!OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in env');
}

export const openaiChat = new OpenAI({ apiKey: OPENAI_API_KEY });
