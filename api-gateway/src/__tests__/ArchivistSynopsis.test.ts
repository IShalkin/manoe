/**
 * Slice 2: ArchivistAgent.summarizeScene returns a compact (~<=80 word) recap
 * string for a finalized scene, built via the LLM call path.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
    get isEnabled() { return false; }
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { ArchivistAgent } from "../agents/ArchivistAgent";

type AnyObj = Record<string, unknown>;

function makeArchivist(): AnyObj {
  const langfuse = { isEnabled: false, startSpan: () => "s", endSpan: () => {}, addEvent: () => {}, trackLLMCall: () => {} } as unknown as ConstructorParameters<typeof ArchivistAgent>[1];
  const llmProvider = {} as unknown as ConstructorParameters<typeof ArchivistAgent>[0];
  return new ArchivistAgent(llmProvider, langfuse) as unknown as AnyObj;
}

describe("ArchivistAgent.summarizeScene", () => {
  it("returns the LLM's summary text trimmed", async () => {
    const a = makeArchivist();
    a.callLLM = jest.fn(async () => "Mara reaches the crypt and finds the seal already broken; she suspects Vex.");
    const out = await (a.summarizeScene as (r: string, o: AnyObj, n: number, text: string) => Promise<string>)(
      "run-1", { llmConfig: {}, projectId: "p" }, 3, "Long scene text ..."
    );
    expect(out).toContain("Mara");
    expect(out).toContain("crypt");
    expect((a.callLLM as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it("returns empty string when the scene text is blank (no LLM call)", async () => {
    const a = makeArchivist();
    a.callLLM = jest.fn(async () => "should not be called");
    const out = await (a.summarizeScene as (r: string, o: AnyObj, n: number, text: string) => Promise<string>)(
      "run-1", { llmConfig: {}, projectId: "p" }, 1, "   "
    );
    expect(out).toBe("");
    expect((a.callLLM as jest.Mock)).not.toHaveBeenCalled();
  });
});
