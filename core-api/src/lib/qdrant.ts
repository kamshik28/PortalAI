// src/lib/qdrant.ts
//
// Low-level Qdrant HTTP client used by course material indexing, AIS sync,
// quiz generation and RAG search.  All filter-sensitive operations are
// intentionally kept here so the calling code never builds raw HTTP payloads.

import { createHash, randomUUID } from 'crypto';

type QdrantPoint = {
  id: string | number;
  vector: number[];
  payload?: Record<string, any>;
};

export type QdrantFilter = {
  must?: Array<Record<string, any>>;
  should?: Array<Record<string, any>>;
  must_not?: Array<Record<string, any>>;
};

export type QdrantScoredPoint = {
  id: string | number;
  score: number;
  payload?: Record<string, any>;
};

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? '';
export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'portalai_materials';

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
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(
      `Qdrant ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`,
    );
  }

  return json;
}

export async function ensureCollectionExists() {
  try {
    await qdrantFetch(`/collections/${QDRANT_COLLECTION}`, { method: 'GET' });
    console.log(`[QDRANT] collection "${QDRANT_COLLECTION}" exists`);
    return;
  } catch {
    // collection neexistuje -> vytvoríme
  }

  await qdrantFetch(`/collections/${QDRANT_COLLECTION}`, {
    method: 'PUT',
    body: JSON.stringify({
      vectors: { size: 1536, distance: 'Cosine' },
    }),
  });

  console.log(
    `[QDRANT] collection "${QDRANT_COLLECTION}" created ` +
    `(size=1536, distance=Cosine)`,
  );
}

/**
 * Creates keyword payload indexes for the five fields used in every RAG
 * filter.  Safe to call repeatedly — Qdrant treats duplicate index creation
 * as a no-op or updates the existing index.
 *
 * Call once at application startup (see AppService.onModuleInit).
 *
 * Fields indexed:
 *   sourceType — distinguishes course_material vs ais
 *   courseId   — course RAG filter (and Flowise AIS chat via chatCourseId)
 *   materialId — course material delete-by-ID filter
 *   userId     — AIS per-user isolation
 *   subjectId  — AIS per-subject isolation
 */
export async function ensurePayloadIndexes() {
  const fields: Array<{ name: string; schema: string }> = [
    { name: 'sourceType', schema: 'keyword' },
    { name: 'courseId',   schema: 'keyword' },
    { name: 'materialId', schema: 'keyword' },
    { name: 'userId',     schema: 'keyword' },
    { name: 'subjectId',  schema: 'keyword' },
  ];

  for (const { name, schema } of fields) {
    try {
      await qdrantFetch(`/collections/${QDRANT_COLLECTION}/index`, {
        method: 'PUT',
        body: JSON.stringify({ field_name: name, field_schema: schema }),
      });
      console.log(`[QDRANT] payload index ok: ${name} (${schema})`);
    } catch (e) {
      // Non-fatal — the collection still works without the index, just slower.
      console.warn(
        `[QDRANT] payload index warning field=${name}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}

export async function upsertPoints(points: QdrantPoint[]) {
  if (!points.length) return;

  await qdrantFetch(`/collections/${QDRANT_COLLECTION}/points?wait=true`, {
    method: 'PUT',
    body: JSON.stringify({ points }),
  });
}

export async function deletePointsByFilter(filter: QdrantFilter) {
  // Log a safe summary of what the delete targets — no payload values, only
  // field names and match values (which are IDs / enum strings, not PII).
  const filterSummary = (filter.must ?? [])
    .map((c) => {
      const key = typeof c['key'] === 'string' ? c['key'] : '?';
      const val =
        typeof c['match']?.['value'] === 'string'
          ? c['match']['value']
          : typeof c['match']?.['value'] === 'number'
            ? String(c['match']['value'])
            : '?';
      return `${key}=${val}`;
    })
    .join(', ');

  console.log(`[QDRANT] deletePointsByFilter: { ${filterSummary} }`);

  await qdrantFetch(
    `/collections/${QDRANT_COLLECTION}/points/delete?wait=true`,
    {
      method: 'POST',
      body: JSON.stringify({ filter }),
    },
  );

  console.log(`[QDRANT] delete completed: { ${filterSummary} }`);
}

export async function searchPoints(params: {
  vector: number[];
  limit: number;
  filter?: QdrantFilter;
}): Promise<QdrantScoredPoint[]> {
  try {
    const queryJson = await qdrantFetch(
      `/collections/${QDRANT_COLLECTION}/points/query`,
      {
        method: 'POST',
        body: JSON.stringify({
          query: params.vector,
          limit: params.limit,
          filter: params.filter,
          with_payload: true,
          with_vector: false,
        }),
      },
    );

    const points = Array.isArray(queryJson?.result?.points)
      ? queryJson.result.points
      : Array.isArray(queryJson?.result)
        ? queryJson.result
        : [];

    return points as QdrantScoredPoint[];
  } catch {
    const searchJson = await qdrantFetch(
      `/collections/${QDRANT_COLLECTION}/points/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          vector: params.vector,
          limit: params.limit,
          filter: params.filter,
          with_payload: true,
          with_vector: false,
        }),
      },
    );

    const points = Array.isArray(searchJson?.result) ? searchJson.result : [];
    return points as QdrantScoredPoint[];
  }
}

export function makePointId() {
  return randomUUID();
}

export function makeStablePointId(
  parts: Array<string | number | null | undefined>,
) {
  const raw = parts.map((p) => String(p ?? '')).join('::');

  const hex = createHash('sha1').update(raw).digest('hex').slice(0, 32);

  const chars = hex.split('');

  // UUID version 5-like marker
  chars[12] = '5';

  // UUID variant bits: 10xx
  const current = parseInt(chars[16], 16);
  chars[16] = ((current & 0x3) | 0x8).toString(16);

  const normalized = chars.join('');

  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join('-');
}
