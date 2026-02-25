// src/lib/qdrant.ts
import { randomUUID } from 'crypto';

type QdrantPoint = {
  id: string;
  vector: number[];
  payload?: Record<string, any>;
};

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? '';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'portalai_materials';

async function qdrantFetch(path: string, init: RequestInit) {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    'Content-Type': 'application/json',
  };

  if (QDRANT_API_KEY) {
    headers['api-key'] = QDRANT_API_KEY;
  }

  const res = await fetch(`${QDRANT_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(
      `Qdrant ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return json;
}

export async function ensureCollectionExists() {
  // перевіряємо чи існує
  try {
    await qdrantFetch(`/collections/${QDRANT_COLLECTION}`, { method: 'GET' });
    return;
  } catch {
    // якщо нема — створюємо
  }

  await qdrantFetch(`/collections/${QDRANT_COLLECTION}`, {
    method: 'PUT',
    body: JSON.stringify({
      vectors: { size: 1536, distance: 'Cosine' },
    }),
  });
}

export async function upsertPoints(points: QdrantPoint[]) {
  if (!points.length) return;

  await qdrantFetch(`/collections/${QDRANT_COLLECTION}/points?wait=true`, {
    method: 'PUT',
    body: JSON.stringify({ points }),
  });
}

export function makePointId() {
  return randomUUID();
}
