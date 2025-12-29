"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneCritiqueDTO = exports.SceneDraftDTO = exports.SceneOutlineDTO = exports.CharacterProfileDTO = exports.NarrativePossibilityDTO = exports.ProjectResponseDTO = exports.StoryProjectDTO = exports.MoralCompass = void 0;
const schema_1 = require("@tsed/schema");
var MoralCompass;
(function (MoralCompass) {
    MoralCompass["ETHICAL"] = "Ethical";
    MoralCompass["UNETHICAL"] = "Unethical";
    MoralCompass["AMORAL"] = "Amoral";
    MoralCompass["AMBIGUOUS"] = "Ambiguous";
    MoralCompass["USER_DEFINED"] = "UserDefined";
})(MoralCompass || (exports.MoralCompass = MoralCompass = {}));
class StoryProjectDTO {
    seedIdea;
    moralCompass;
    targetAudience;
    themeCore;
    toneStyleReferences;
    customMoralSystem;
}
exports.StoryProjectDTO = StoryProjectDTO;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("The 'What If?' question or initial concept that sparks the story"),
    __metadata("design:type", String)
], StoryProjectDTO.prototype, "seedIdea", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(MoralCompass),
    (0, schema_1.Description)("Ethical framework that influences theme and style"),
    __metadata("design:type", String)
], StoryProjectDTO.prototype, "moralCompass", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Intended audience (age group, genre preferences, sensibilities)"),
    __metadata("design:type", String)
], StoryProjectDTO.prototype, "targetAudience", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    (0, schema_1.Description)("2-3 core themes to explore"),
    __metadata("design:type", Array)
], StoryProjectDTO.prototype, "themeCore", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    (0, schema_1.Description)("Style references (e.g., 'Palahniuk-esque cynicism')"),
    __metadata("design:type", Array)
], StoryProjectDTO.prototype, "toneStyleReferences", void 0);
__decorate([
    (0, schema_1.Description)("Required if moralCompass is USER_DEFINED"),
    __metadata("design:type", String)
], StoryProjectDTO.prototype, "customMoralSystem", void 0);
class ProjectResponseDTO {
    id;
    status;
    message;
    seedIdea;
    moralCompass;
    targetAudience;
    createdAt;
    updatedAt;
}
exports.ProjectResponseDTO = ProjectResponseDTO;
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], ProjectResponseDTO.prototype, "id", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], ProjectResponseDTO.prototype, "status", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], ProjectResponseDTO.prototype, "message", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], ProjectResponseDTO.prototype, "seedIdea", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], ProjectResponseDTO.prototype, "moralCompass", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], ProjectResponseDTO.prototype, "targetAudience", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], ProjectResponseDTO.prototype, "createdAt", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], ProjectResponseDTO.prototype, "updatedAt", void 0);
class NarrativePossibilityDTO {
    plotSummary;
    settingDescription;
    mainConflict;
    potentialCharacters;
    possibleTwists;
    thematicElements;
    moralCompassApplication;
}
exports.NarrativePossibilityDTO = NarrativePossibilityDTO;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Brief summary of the plot"),
    __metadata("design:type", String)
], NarrativePossibilityDTO.prototype, "plotSummary", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Description of the story setting"),
    __metadata("design:type", String)
], NarrativePossibilityDTO.prototype, "settingDescription", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Central conflict of the story"),
    __metadata("design:type", String)
], NarrativePossibilityDTO.prototype, "mainConflict", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    (0, schema_1.Description)("Character types needed for the story"),
    __metadata("design:type", Array)
], NarrativePossibilityDTO.prototype, "potentialCharacters", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    (0, schema_1.Description)("Potential plot twists or turns"),
    __metadata("design:type", Array)
], NarrativePossibilityDTO.prototype, "possibleTwists", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    (0, schema_1.Description)("Themes to be explored"),
    __metadata("design:type", Array)
], NarrativePossibilityDTO.prototype, "thematicElements", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("How the moral compass will be applied"),
    __metadata("design:type", String)
], NarrativePossibilityDTO.prototype, "moralCompassApplication", void 0);
class CharacterProfileDTO {
    name;
    archetype;
    coreMotivation;
    innerTrap;
    psychologicalWound;
    copingMechanism;
    deepestFear;
    breakingPoint;
    occupationRole;
    affiliations;
    visualSignature;
    publicGoal;
    hiddenGoal;
    definingMoment;
    familyBackground;
    specialSkill;
    quirks;
    moralStance;
    potentialArc;
}
exports.CharacterProfileDTO = CharacterProfileDTO;
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "name", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "archetype", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "coreMotivation", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "innerTrap", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "psychologicalWound", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "copingMechanism", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "deepestFear", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "breakingPoint", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "occupationRole", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    __metadata("design:type", Array)
], CharacterProfileDTO.prototype, "affiliations", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "visualSignature", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "publicGoal", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "hiddenGoal", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "definingMoment", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "familyBackground", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "specialSkill", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    __metadata("design:type", Array)
], CharacterProfileDTO.prototype, "quirks", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "moralStance", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], CharacterProfileDTO.prototype, "potentialArc", void 0);
class SceneOutlineDTO {
    sceneNumber;
    title;
    setting;
    charactersPresent;
    conflictType;
    conflictDescription;
    emotionalBeat;
    subtextLayer;
    plotAdvancement;
    characterDevelopment;
    estimatedWordCount;
}
exports.SceneOutlineDTO = SceneOutlineDTO;
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Number)
], SceneOutlineDTO.prototype, "sceneNumber", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneOutlineDTO.prototype, "title", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneOutlineDTO.prototype, "setting", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    __metadata("design:type", Array)
], SceneOutlineDTO.prototype, "charactersPresent", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneOutlineDTO.prototype, "conflictType", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneOutlineDTO.prototype, "conflictDescription", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Object)
], SceneOutlineDTO.prototype, "emotionalBeat", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneOutlineDTO.prototype, "subtextLayer", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneOutlineDTO.prototype, "plotAdvancement", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], SceneOutlineDTO.prototype, "characterDevelopment", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], SceneOutlineDTO.prototype, "estimatedWordCount", void 0);
class SceneDraftDTO {
    sceneNumber;
    title;
    settingDescription;
    sensoryDetails;
    narrativeContent;
    dialogueEntries;
    subtextLayer;
    emotionalShift;
    wordCount;
    showDontTellRatio;
}
exports.SceneDraftDTO = SceneDraftDTO;
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Number)
], SceneDraftDTO.prototype, "sceneNumber", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneDraftDTO.prototype, "title", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneDraftDTO.prototype, "settingDescription", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Object)
], SceneDraftDTO.prototype, "sensoryDetails", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneDraftDTO.prototype, "narrativeContent", void 0);
__decorate([
    (0, schema_1.CollectionOf)(Object),
    __metadata("design:type", Array)
], SceneDraftDTO.prototype, "dialogueEntries", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneDraftDTO.prototype, "subtextLayer", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneDraftDTO.prototype, "emotionalShift", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Number)
], SceneDraftDTO.prototype, "wordCount", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Number)
], SceneDraftDTO.prototype, "showDontTellRatio", void 0);
class SceneCritiqueDTO {
    sceneNumber;
    overallScore;
    approved;
    feedbackItems;
    strengths;
    weaknesses;
    revisionRequired;
    revisionFocus;
    creativeRiskAssessment;
    psychologicalAlignment;
    complexityAssessment;
}
exports.SceneCritiqueDTO = SceneCritiqueDTO;
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Number)
], SceneCritiqueDTO.prototype, "sceneNumber", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Number)
], SceneCritiqueDTO.prototype, "overallScore", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Boolean)
], SceneCritiqueDTO.prototype, "approved", void 0);
__decorate([
    (0, schema_1.CollectionOf)(Object),
    __metadata("design:type", Array)
], SceneCritiqueDTO.prototype, "feedbackItems", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    __metadata("design:type", Array)
], SceneCritiqueDTO.prototype, "strengths", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    __metadata("design:type", Array)
], SceneCritiqueDTO.prototype, "weaknesses", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", Boolean)
], SceneCritiqueDTO.prototype, "revisionRequired", void 0);
__decorate([
    (0, schema_1.CollectionOf)(String),
    __metadata("design:type", Array)
], SceneCritiqueDTO.prototype, "revisionFocus", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneCritiqueDTO.prototype, "creativeRiskAssessment", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneCritiqueDTO.prototype, "psychologicalAlignment", void 0);
__decorate([
    (0, schema_1.Required)(),
    __metadata("design:type", String)
], SceneCritiqueDTO.prototype, "complexityAssessment", void 0);
//# sourceMappingURL=ProjectModels.js.map