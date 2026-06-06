/**
 * Unit tests for QdrantMemoryService embedding helpers.
 *
 * Covers two bug fixes:
 * 1. LOCAL embeddings must be DETERMINISTIC from text (not Math.random),
 *    so identical text maps to identical vectors and cosine ranking is stable.
 * 2. The OpenAI embedding response must be guarded against empty/missing
 *    `data` so an empty/content-filtered response throws a clear, catchable
 *    error instead of dereferencing `undefined`.
 *
 * These exercise the pure static helpers `localEmbedding` and
 * `extractEmbedding`, so the service never has to be instantiated.
 */

// Mock heavy / DI-coupled dependencies so the module imports cleanly under jest.
jest.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("uuid", () => ({ v4: jest.fn().mockReturnValue("test-uuid") }));

import { QdrantMemoryService } from "../services/QdrantMemoryService";

describe("QdrantMemoryService.localEmbedding (deterministic local embeddings)", () => {
  it("returns a vector of the requested dimension", () => {
    const vec = QdrantMemoryService.localEmbedding("hello world", 3072);
    expect(vec).toHaveLength(3072);
    const vec2 = QdrantMemoryService.localEmbedding("hello world", 1536);
    expect(vec2).toHaveLength(1536);
  });

  it("is deterministic: identical text yields identical vectors", () => {
    const a = QdrantMemoryService.localEmbedding("The Captain stood on the bridge", 256);
    const b = QdrantMemoryService.localEmbedding("The Captain stood on the bridge", 256);
    expect(a).toEqual(b);
  });

  it("differentiates: different text yields different vectors", () => {
    const a = QdrantMemoryService.localEmbedding("alpha", 256);
    const b = QdrantMemoryService.localEmbedding("beta", 256);
    expect(a).not.toEqual(b);
  });

  it("produces only finite numbers", () => {
    const vec = QdrantMemoryService.localEmbedding("some text with symbols !@#$ 123", 512);
    expect(vec.every((n: number) => Number.isFinite(n))).toBe(true);
  });

  it("handles empty text without throwing and stays deterministic", () => {
    const a = QdrantMemoryService.localEmbedding("", 128);
    const b = QdrantMemoryService.localEmbedding("", 128);
    expect(a).toHaveLength(128);
    expect(a).toEqual(b);
    expect(a.every((n: number) => Number.isFinite(n))).toBe(true);
  });
});

describe("QdrantMemoryService.extractEmbedding (OpenAI response guard)", () => {
  it("returns the embedding for a well-formed response", () => {
    const embedding = Array(1536).fill(0.1);
    const out = QdrantMemoryService.extractEmbedding({ data: [{ embedding }] }, 1536);
    expect(out).toBe(embedding);
  });

  it("throws a clear error when data is an empty array", () => {
    expect(() => QdrantMemoryService.extractEmbedding({ data: [] }, 1536)).toThrow(
      /empty|no embedding/i
    );
  });

  it("throws a clear error when data is missing", () => {
    expect(() => QdrantMemoryService.extractEmbedding({} as never, 1536)).toThrow(
      /empty|no embedding/i
    );
  });

  it("throws when the first entry has no embedding array", () => {
    expect(() =>
      QdrantMemoryService.extractEmbedding({ data: [{}] } as never, 1536)
    ).toThrow(/empty|no embedding/i);
  });
});
