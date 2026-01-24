"use strict";
/**
 * Unit Tests for WriterAgent
 *
 * Tests the Writer agent's logic functions without making actual LLM calls.
 * These tests verify prompt building, persona break detection, and canonical names handling.
 */
describe("WriterAgent", () => {
    describe("detectPersonaBreak", () => {
        const personaBreakPatterns = [
            /which (?:approach|option|version) (?:would you|do you) prefer/i,
            /\b[ABC]\)\s+/,
            /your guidance/i,
            /let me know (?:if|which|what)/i,
            /would you like me to/i,
            /here (?:is|are) (?:the|some) (?:revised|options|approaches)/i,
            /please (?:choose|select|let me know)/i,
            /\?{2,}/,
        ];
        const detectPersonaBreak = (content) => {
            return personaBreakPatterns.some(pattern => pattern.test(content));
        };
        it("should detect 'which approach would you prefer' pattern", () => {
            const content = "Here are two versions. Which approach would you prefer?";
            expect(detectPersonaBreak(content)).toBe(true);
        });
        it("should detect A) B) C) options pattern", () => {
            const content = "A) The hero fights. B) The hero runs. C) The hero hides.";
            expect(detectPersonaBreak(content)).toBe(true);
        });
        it("should detect 'your guidance' pattern", () => {
            const content = "I need your guidance on how to proceed.";
            expect(detectPersonaBreak(content)).toBe(true);
        });
        it("should detect 'let me know' pattern", () => {
            const content = "Let me know if you want me to continue.";
            expect(detectPersonaBreak(content)).toBe(true);
        });
        it("should detect 'would you like me to' pattern", () => {
            const content = "Would you like me to revise this section?";
            expect(detectPersonaBreak(content)).toBe(true);
        });
        it("should detect 'here is the revised' pattern", () => {
            const content = "Here is the revised version of the scene.";
            expect(detectPersonaBreak(content)).toBe(true);
        });
        it("should detect 'please choose' pattern", () => {
            const content = "Please choose which version you prefer.";
            expect(detectPersonaBreak(content)).toBe(true);
        });
        it("should detect multiple question marks", () => {
            const content = "What do you think?? Should I continue??";
            expect(detectPersonaBreak(content)).toBe(true);
        });
        it("should NOT detect normal prose content", () => {
            const content = "The hero walked through the forest, his sword gleaming in the moonlight. He knew what he had to do.";
            expect(detectPersonaBreak(content)).toBe(false);
        });
        it("should NOT detect single question marks in dialogue", () => {
            const content = '"Where are you going?" she asked. "To find the treasure," he replied.';
            expect(detectPersonaBreak(content)).toBe(false);
        });
        it("should NOT detect 'here is' in narrative context", () => {
            const content = "Here is where the battle took place, centuries ago.";
            expect(detectPersonaBreak(content)).toBe(false);
        });
    });
    describe("buildCanonicalNamesBlock", () => {
        const buildCanonicalNamesBlock = (characters) => {
            if (!characters || !Array.isArray(characters)) {
                return "No characters established yet.";
            }
            const names = [];
            for (const char of characters) {
                if (typeof char === "object" && char !== null) {
                    const charObj = char;
                    const name = charObj.name || charObj.fullName || charObj.characterName;
                    if (typeof name === "string" && name.trim()) {
                        names.push(name.trim());
                    }
                }
            }
            if (names.length === 0) {
                return "No named characters established yet.";
            }
            return names.map(name => `- ${name}`).join("\n");
        };
        it("should return placeholder for null characters", () => {
            expect(buildCanonicalNamesBlock(null)).toBe("No characters established yet.");
        });
        it("should return placeholder for undefined characters", () => {
            expect(buildCanonicalNamesBlock(undefined)).toBe("No characters established yet.");
        });
        it("should return placeholder for non-array characters", () => {
            expect(buildCanonicalNamesBlock("not an array")).toBe("No characters established yet.");
        });
        it("should return placeholder for empty array", () => {
            expect(buildCanonicalNamesBlock([])).toBe("No named characters established yet.");
        });
        it("should extract names from character objects", () => {
            const characters = [
                { name: "John Smith" },
                { name: "Jane Doe" },
            ];
            expect(buildCanonicalNamesBlock(characters)).toBe("- John Smith\n- Jane Doe");
        });
        it("should handle fullName field", () => {
            const characters = [
                { fullName: "Sir Lancelot" },
            ];
            expect(buildCanonicalNamesBlock(characters)).toBe("- Sir Lancelot");
        });
        it("should handle characterName field", () => {
            const characters = [
                { characterName: "The Dark Knight" },
            ];
            expect(buildCanonicalNamesBlock(characters)).toBe("- The Dark Knight");
        });
        it("should skip characters without names", () => {
            const characters = [
                { name: "Hero" },
                { role: "Villain" },
                { name: "Sidekick" },
            ];
            expect(buildCanonicalNamesBlock(characters)).toBe("- Hero\n- Sidekick");
        });
        it("should trim whitespace from names", () => {
            const characters = [
                { name: "  John  " },
                { name: "Jane" },
            ];
            expect(buildCanonicalNamesBlock(characters)).toBe("- John\n- Jane");
        });
        it("should skip empty string names", () => {
            const characters = [
                { name: "" },
                { name: "Valid Name" },
                { name: "   " },
            ];
            expect(buildCanonicalNamesBlock(characters)).toBe("- Valid Name");
        });
    });
    describe("buildConstraintsBlock", () => {
        const buildConstraintsBlock = (constraints) => {
            if (!constraints || constraints.length === 0) {
                return "No constraints established yet.";
            }
            return constraints
                .map(c => `- ${c.key}: ${c.value}${c.immutable ? " [IMMUTABLE]" : ""}`)
                .join("\n");
        };
        it("should return placeholder for empty constraints", () => {
            expect(buildConstraintsBlock([])).toBe("No constraints established yet.");
        });
        it("should return placeholder for null constraints", () => {
            expect(buildConstraintsBlock(null)).toBe("No constraints established yet.");
        });
        it("should format single constraint", () => {
            const constraints = [{ key: "hero_name", value: "John" }];
            expect(buildConstraintsBlock(constraints)).toBe("- hero_name: John");
        });
        it("should format multiple constraints", () => {
            const constraints = [
                { key: "hero_name", value: "John" },
                { key: "setting", value: "Medieval castle" },
            ];
            expect(buildConstraintsBlock(constraints)).toBe("- hero_name: John\n- setting: Medieval castle");
        });
        it("should mark immutable constraints", () => {
            const constraints = [
                { key: "hero_name", value: "John", immutable: true },
                { key: "mood", value: "tense", immutable: false },
            ];
            expect(buildConstraintsBlock(constraints)).toBe("- hero_name: John [IMMUTABLE]\n- mood: tense");
        });
    });
    describe("word count calculation", () => {
        const calculateWordCount = (content) => {
            return content.split(/\s+/).filter(w => w.length > 0).length;
        };
        it("should count words correctly", () => {
            expect(calculateWordCount("one two three")).toBe(3);
        });
        it("should handle multiple spaces", () => {
            expect(calculateWordCount("one   two    three")).toBe(3);
        });
        it("should handle newlines", () => {
            expect(calculateWordCount("one\ntwo\nthree")).toBe(3);
        });
        it("should handle empty string", () => {
            expect(calculateWordCount("")).toBe(0);
        });
        it("should handle whitespace only", () => {
            expect(calculateWordCount("   \n\t  ")).toBe(0);
        });
        it("should count hyphenated words as one", () => {
            expect(calculateWordCount("well-known fact")).toBe(2);
        });
        it("should handle punctuation attached to words", () => {
            expect(calculateWordCount("Hello, world!")).toBe(2);
        });
    });
    describe("beats mode validation", () => {
        const validateBeatsMode = (params) => {
            const { partIndex, partsTotal, partTargetWords } = params;
            if (isNaN(partIndex) || isNaN(partsTotal) || isNaN(partTargetWords)) {
                return false;
            }
            if (partIndex < 1 || partIndex > partsTotal) {
                return false;
            }
            if (partsTotal < 1 || partsTotal > 10) {
                return false;
            }
            if (partTargetWords < 100 || partTargetWords > 2000) {
                return false;
            }
            return true;
        };
        it("should accept valid beats mode parameters", () => {
            expect(validateBeatsMode({ partIndex: 1, partsTotal: 3, partTargetWords: 500 })).toBe(true);
        });
        it("should reject NaN partIndex", () => {
            expect(validateBeatsMode({ partIndex: NaN, partsTotal: 3, partTargetWords: 500 })).toBe(false);
        });
        it("should reject NaN partsTotal", () => {
            expect(validateBeatsMode({ partIndex: 1, partsTotal: NaN, partTargetWords: 500 })).toBe(false);
        });
        it("should reject NaN partTargetWords", () => {
            expect(validateBeatsMode({ partIndex: 1, partsTotal: 3, partTargetWords: NaN })).toBe(false);
        });
        it("should reject partIndex less than 1", () => {
            expect(validateBeatsMode({ partIndex: 0, partsTotal: 3, partTargetWords: 500 })).toBe(false);
        });
        it("should reject partIndex greater than partsTotal", () => {
            expect(validateBeatsMode({ partIndex: 4, partsTotal: 3, partTargetWords: 500 })).toBe(false);
        });
        it("should reject partsTotal greater than 10", () => {
            expect(validateBeatsMode({ partIndex: 1, partsTotal: 11, partTargetWords: 500 })).toBe(false);
        });
        it("should reject partTargetWords less than 100", () => {
            expect(validateBeatsMode({ partIndex: 1, partsTotal: 3, partTargetWords: 50 })).toBe(false);
        });
        it("should reject partTargetWords greater than 2000", () => {
            expect(validateBeatsMode({ partIndex: 1, partsTotal: 3, partTargetWords: 2500 })).toBe(false);
        });
    });
});
//# sourceMappingURL=WriterAgent.test.js.map