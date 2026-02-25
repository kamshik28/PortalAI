// src/lib/openaiEmbeddings.ts
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
if (!OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in env');
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function embed(texts: string[]) {
  // важливо: тексти не мають бути пусті
  const input = texts.map((t) => t.slice(0, 8000));

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
  const resp = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
  return resp.data.map((d) => d.embedding);
}
