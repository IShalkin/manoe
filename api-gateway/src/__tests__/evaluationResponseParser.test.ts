import { parseEvaluationResponse } from "../utils/evaluationResponseParser";

describe("parseEvaluationResponse (real shipped logic)", () => {
  it("parses a clean JSON object", () => {
    const r = parseEvaluationResponse('{"score": 0.8, "reasoning": "good"}', "gpt-5.4-mini", 12);
    expect(r).toEqual({ score: 0.8, reasoning: "good", evaluationModel: "gpt-5.4-mini", durationMs: 12 });
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const r = parseEvaluationResponse('Here is my verdict: {"score": 0.5, "reasoning": "ok"} done', "m", 1);
    expect(r?.score).toBe(0.5);
  });

  it("clamps a score above 1 to 1", () => {
    expect(parseEvaluationResponse('{"score": 5, "reasoning": "x"}', "m", 1)?.score).toBe(1);
  });

  it("clamps a negative score to 0", () => {
    expect(parseEvaluationResponse('{"score": -3, "reasoning": "x"}', "m", 1)?.score).toBe(0);
  });

  it("coerces a non-numeric/NaN score to 0", () => {
    expect(parseEvaluationResponse('{"score": "abc", "reasoning": "x"}', "m", 1)?.score).toBe(0);
  });

  it("defaults reasoning when missing", () => {
    expect(parseEvaluationResponse('{"score": 0.9}', "m", 1)?.reasoning).toBe("No reasoning provided");
  });

  it("returns null when there is no JSON", () => {
    expect(parseEvaluationResponse("no json here", "m", 1)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseEvaluationResponse('{"score": 0.5, ', "m", 1)).toBeNull();
  });
});
