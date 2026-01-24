"use strict";
/**
 * Unit Tests for CriticAgent
 *
 * Tests the Critic agent's logic functions without making actual LLM calls.
 * These tests verify revision decision logic, score handling, and constraint checking.
 */
describe("CriticAgent", () => {
    describe("isRevisionNeeded", () => {
        const isRevisionNeeded = (critique) => {
            const hasIssues = Array.isArray(critique.issues) && critique.issues.length > 0;
            const hasRevisionRequests = Array.isArray(critique.revisionRequests) && critique.revisionRequests.length > 0;
            const score = typeof critique.score === "number" ? critique.score : null;
            // 1. Check hard failures first (guard clauses)
            if (critique.wordCountCompliance === false) {
                return true;
            }
            if (critique.scopeAdherence === false) {
                return true;
            }
            // Score below 7 always needs revision
            if (score !== null && score < 7) {
                return true;
            }
            // Score 7-8 needs revision if there are any issues
            if (score !== null && score < 8 && hasIssues) {
                return true;
            }
            // Any issues or revision requests require revision
            if (hasIssues || hasRevisionRequests) {
                return true;
            }
            // 2. Check success conditions
            if (critique.approved === true && score !== null && score >= 8) {
                return false;
            }
            if (score !== null && score >= 8) {
                return false;
            }
            // 3. Default to safe behavior
            return true;
        };
        describe("hard failure conditions", () => {
            it("should require revision when wordCountCompliance is false", () => {
                const critique = {
                    approved: true,
                    score: 10,
                    wordCountCompliance: false,
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should require revision when scopeAdherence is false", () => {
                const critique = {
                    approved: true,
                    score: 10,
                    scopeAdherence: false,
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should require revision when score is below 7", () => {
                const critique = {
                    approved: true,
                    score: 6,
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should require revision when score is 7 and has issues", () => {
                const critique = {
                    score: 7,
                    issues: ["Minor pacing issue"],
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
        });
        describe("issues and revision requests", () => {
            it("should require revision when there are issues", () => {
                const critique = {
                    score: 9,
                    issues: ["Character inconsistency"],
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should require revision when there are revision requests", () => {
                const critique = {
                    score: 9,
                    revisionRequests: ["Add more sensory details"],
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should require revision when both issues and revision requests exist", () => {
                const critique = {
                    score: 9,
                    issues: ["Pacing issue"],
                    revisionRequests: ["Slow down the action"],
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should NOT require revision for empty issues array", () => {
                const critique = {
                    approved: true,
                    score: 9,
                    issues: [],
                };
                expect(isRevisionNeeded(critique)).toBe(false);
            });
        });
        describe("success conditions", () => {
            it("should NOT require revision when approved and score >= 8", () => {
                const critique = {
                    approved: true,
                    score: 8,
                };
                expect(isRevisionNeeded(critique)).toBe(false);
            });
            it("should NOT require revision when score >= 8 without issues", () => {
                const critique = {
                    score: 9,
                };
                expect(isRevisionNeeded(critique)).toBe(false);
            });
            it("should NOT require revision for perfect score", () => {
                const critique = {
                    approved: true,
                    score: 10,
                    wordCountCompliance: true,
                    scopeAdherence: true,
                };
                expect(isRevisionNeeded(critique)).toBe(false);
            });
        });
        describe("edge cases", () => {
            it("should require revision when score is null", () => {
                const critique = {
                    approved: true,
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should require revision for empty critique", () => {
                const critique = {};
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should handle score at boundary (7.5)", () => {
                const critique = {
                    score: 7.5,
                    issues: ["Minor issue"],
                };
                expect(isRevisionNeeded(critique)).toBe(true);
            });
            it("should handle score exactly at 8", () => {
                const critique = {
                    score: 8,
                };
                expect(isRevisionNeeded(critique)).toBe(false);
            });
        });
    });
    describe("word count compliance calculation", () => {
        const calculateWordCountCompliance = (actualWordCount, targetWordCount) => {
            const ratio = actualWordCount / targetWordCount;
            return {
                compliant: ratio >= 0.7,
                ratio,
            };
        };
        it("should pass when actual equals target", () => {
            const result = calculateWordCountCompliance(1500, 1500);
            expect(result.compliant).toBe(true);
            expect(result.ratio).toBe(1);
        });
        it("should pass when actual is above target", () => {
            const result = calculateWordCountCompliance(1800, 1500);
            expect(result.compliant).toBe(true);
            expect(result.ratio).toBeCloseTo(1.2);
        });
        it("should pass at exactly 70% threshold", () => {
            const result = calculateWordCountCompliance(1050, 1500);
            expect(result.compliant).toBe(true);
            expect(result.ratio).toBe(0.7);
        });
        it("should fail below 70% threshold", () => {
            const result = calculateWordCountCompliance(1000, 1500);
            expect(result.compliant).toBe(false);
            expect(result.ratio).toBeCloseTo(0.667, 2);
        });
        it("should fail for very short content", () => {
            const result = calculateWordCountCompliance(300, 1500);
            expect(result.compliant).toBe(false);
            expect(result.ratio).toBe(0.2);
        });
        it("should handle zero actual word count", () => {
            const result = calculateWordCountCompliance(0, 1500);
            expect(result.compliant).toBe(false);
            expect(result.ratio).toBe(0);
        });
    });
    describe("critique score clamping", () => {
        const clampScore = (score) => {
            return Math.max(1, Math.min(10, score));
        };
        it("should clamp score above 10 to 10", () => {
            expect(clampScore(15)).toBe(10);
        });
        it("should clamp score below 1 to 1", () => {
            expect(clampScore(0)).toBe(1);
            expect(clampScore(-5)).toBe(1);
        });
        it("should keep valid scores unchanged", () => {
            expect(clampScore(1)).toBe(1);
            expect(clampScore(5)).toBe(5);
            expect(clampScore(10)).toBe(10);
            expect(clampScore(7.5)).toBe(7.5);
        });
    });
    describe("scope adherence detection", () => {
        const checkScopeAdherence = (content, sceneHook, futureEvents) => {
            const violations = [];
            // Check if content ends with or near the specified hook
            // Filter out common words to avoid false positives
            const commonWords = new Set(["the", "a", "an", "is", "are", "was", "were", "to", "of", "in", "on", "at"]);
            const hookWords = sceneHook.toLowerCase().split(/\s+/)
                .filter(word => word.length > 2 && !commonWords.has(word))
                .slice(0, 3);
            const contentEnding = content.toLowerCase().slice(-500);
            const hasHook = hookWords.length === 0 || hookWords.some(word => contentEnding.includes(word));
            if (!hasHook && sceneHook.length > 0) {
                violations.push("Scene does not end on specified hook");
            }
            // Check for future events mentioned in content
            for (const event of futureEvents) {
                if (content.toLowerCase().includes(event.toLowerCase())) {
                    violations.push(`Premature mention of future event: ${event}`);
                }
            }
            return {
                adherent: violations.length === 0,
                violations,
            };
        };
        it("should pass when content ends with hook", () => {
            const content = "The hero walked away, leaving the door open behind him.";
            const hook = "leaving the door open";
            const result = checkScopeAdherence(content, hook, []);
            expect(result.adherent).toBe(true);
            expect(result.violations).toHaveLength(0);
        });
        it("should fail when content does not end with hook", () => {
            const content = "The hero walked away into the sunset.";
            const hook = "discovering ancient artifact underground";
            const result = checkScopeAdherence(content, hook, []);
            expect(result.adherent).toBe(false);
            expect(result.violations.length).toBeGreaterThan(0);
        });
        it("should detect premature future events", () => {
            const content = "The hero knew he would defeat the dragon in the final battle.";
            const hook = "";
            const futureEvents = ["defeat the dragon", "final battle"];
            const result = checkScopeAdherence(content, hook, futureEvents);
            expect(result.adherent).toBe(false);
            expect(result.violations.length).toBeGreaterThan(0);
        });
        it("should pass with empty hook", () => {
            const content = "The hero walked away.";
            const hook = "";
            const result = checkScopeAdherence(content, hook, []);
            expect(result.adherent).toBe(true);
        });
    });
    describe("critique JSON parsing", () => {
        const parseCritiqueJSON = (response) => {
            try {
                // Try to extract JSON from the response
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    return null;
                }
                return JSON.parse(jsonMatch[0]);
            }
            catch {
                return null;
            }
        };
        it("should parse valid JSON critique", () => {
            const response = '{"approved": true, "score": 8, "issues": []}';
            const result = parseCritiqueJSON(response);
            expect(result).not.toBeNull();
            expect(result?.approved).toBe(true);
            expect(result?.score).toBe(8);
        });
        it("should extract JSON from surrounding text", () => {
            const response = 'Here is my critique: {"approved": false, "score": 6} That is all.';
            const result = parseCritiqueJSON(response);
            expect(result).not.toBeNull();
            expect(result?.approved).toBe(false);
            expect(result?.score).toBe(6);
        });
        it("should handle multiline JSON", () => {
            const response = `{
        "approved": true,
        "score": 9,
        "strengths": ["Good pacing", "Strong dialogue"]
      }`;
            const result = parseCritiqueJSON(response);
            expect(result).not.toBeNull();
            expect(result?.score).toBe(9);
            expect(result?.strengths).toHaveLength(2);
        });
        it("should return null for invalid JSON", () => {
            const response = "This is not JSON at all";
            const result = parseCritiqueJSON(response);
            expect(result).toBeNull();
        });
        it("should return null for malformed JSON", () => {
            const response = '{"approved": true, "score": }';
            const result = parseCritiqueJSON(response);
            expect(result).toBeNull();
        });
    });
    describe("critique validation", () => {
        const validateCritique = (critique) => {
            const errors = [];
            // Check required fields
            if (typeof critique.approved !== "boolean") {
                errors.push("Missing or invalid 'approved' field");
            }
            if (typeof critique.score !== "number" || critique.score < 1 || critique.score > 10) {
                errors.push("Missing or invalid 'score' field (must be 1-10)");
            }
            // Check optional array fields
            if (critique.issues !== undefined && !Array.isArray(critique.issues)) {
                errors.push("'issues' must be an array");
            }
            if (critique.strengths !== undefined && !Array.isArray(critique.strengths)) {
                errors.push("'strengths' must be an array");
            }
            if (critique.revisionRequests !== undefined && !Array.isArray(critique.revisionRequests)) {
                errors.push("'revisionRequests' must be an array");
            }
            return {
                isValid: errors.length === 0,
                errors,
            };
        };
        it("should validate correct critique", () => {
            const critique = {
                approved: true,
                score: 8,
                issues: [],
                strengths: ["Good pacing"],
            };
            const result = validateCritique(critique);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
        it("should fail for missing approved field", () => {
            const critique = {
                score: 8,
            };
            const result = validateCritique(critique);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain("Missing or invalid 'approved' field");
        });
        it("should fail for missing score field", () => {
            const critique = {
                approved: true,
            };
            const result = validateCritique(critique);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain("Missing or invalid 'score' field (must be 1-10)");
        });
        it("should fail for score out of range", () => {
            const critique = {
                approved: true,
                score: 15,
            };
            const result = validateCritique(critique);
            expect(result.isValid).toBe(false);
        });
        it("should fail for non-array issues", () => {
            const critique = {
                approved: true,
                score: 8,
                issues: "not an array",
            };
            const result = validateCritique(critique);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain("'issues' must be an array");
        });
    });
});
//# sourceMappingURL=CriticAgent.test.js.map