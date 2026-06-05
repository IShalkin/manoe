/**
 * Slice 0: when the embedding provider is LOCAL (deterministic noise),
 * vector search must fail CLOSED — return [] without querying Qdrant —
 * rather than ranking over meaningless pseudo-vectors.
 */
import { QdrantMemoryService, EmbeddingProvider } from "../services/QdrantMemoryService";

type AnyObj = Record<string, unknown>;

function makeService(provider: EmbeddingProvider) {
  const svc = new QdrantMemoryService();
  const o = svc as unknown as AnyObj;
  o.embeddingProvider = provider;
  o.embeddingDimension = 3072;
  o.embeddingModel = provider === EmbeddingProvider.LOCAL ? "none" : "text-embedding-3-small";
  // A client whose search() throws if ever called — proves we never query in LOCAL mode.
  const search = jest.fn(async () => { throw new Error("client.search must not be called in LOCAL mode"); });
  o.client = { search };
  o.collectionCharacters = "c";
  o.collectionWorldbuilding = "w";
  o.collectionScenes = "s";
  return { svc, search };
}

describe("QdrantMemoryService fail-closed on LOCAL embeddings", () => {
  it("searchScenes returns [] and does not query the client in LOCAL mode", async () => {
    const { svc, search } = makeService(EmbeddingProvider.LOCAL);
    const res = await svc.searchScenes("proj-1", "anything");
    expect(res).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("searchCharacters returns [] in LOCAL mode", async () => {
    const { svc, search } = makeService(EmbeddingProvider.LOCAL);
    expect(await svc.searchCharacters("proj-1", "q")).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("searchWorldbuilding returns [] in LOCAL mode", async () => {
    const { svc, search } = makeService(EmbeddingProvider.LOCAL);
    expect(await svc.searchWorldbuilding("proj-1", "q")).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("does NOT short-circuit when a real provider is active (OPENAI still queries)", async () => {
    const { svc, search } = makeService(EmbeddingProvider.OPENAI);
    // Force generateEmbedding to a fixed vector so we reach the client.search call.
    (svc as unknown as AnyObj).generateEmbedding = jest.fn(async () => new Array(3072).fill(0));
    await svc.searchScenes("proj-1", "q").catch(() => { /* search() throws by design */ });
    expect(search).toHaveBeenCalledTimes(1);
  });
});
