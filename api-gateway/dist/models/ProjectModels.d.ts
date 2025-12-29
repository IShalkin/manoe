export declare enum MoralCompass {
    ETHICAL = "Ethical",
    UNETHICAL = "Unethical",
    AMORAL = "Amoral",
    AMBIGUOUS = "Ambiguous",
    USER_DEFINED = "UserDefined"
}
export declare class StoryProjectDTO {
    seedIdea: string;
    moralCompass: MoralCompass;
    targetAudience: string;
    themeCore?: string[];
    toneStyleReferences?: string[];
    customMoralSystem?: string;
}
export declare class ProjectResponseDTO {
    id: string;
    status: string;
    message?: string;
    seedIdea?: string;
    moralCompass?: string;
    targetAudience?: string;
    createdAt?: string;
    updatedAt?: string;
}
export declare class NarrativePossibilityDTO {
    plotSummary: string;
    settingDescription: string;
    mainConflict: string;
    potentialCharacters: string[];
    possibleTwists?: string[];
    thematicElements: string[];
    moralCompassApplication: string;
}
export declare class CharacterProfileDTO {
    name: string;
    archetype: string;
    coreMotivation: string;
    innerTrap: string;
    psychologicalWound: string;
    copingMechanism: string;
    deepestFear: string;
    breakingPoint: string;
    occupationRole: string;
    affiliations?: string[];
    visualSignature: string;
    publicGoal: string;
    hiddenGoal?: string;
    definingMoment: string;
    familyBackground?: string;
    specialSkill?: string;
    quirks?: string[];
    moralStance: string;
    potentialArc: string;
}
export declare class SceneOutlineDTO {
    sceneNumber: number;
    title: string;
    setting: string;
    charactersPresent: string[];
    conflictType: string;
    conflictDescription: string;
    emotionalBeat: {
        initialState: string;
        climax: string;
        finalState: string;
    };
    subtextLayer: string;
    plotAdvancement: string;
    characterDevelopment?: string;
    estimatedWordCount?: number;
}
export declare class SceneDraftDTO {
    sceneNumber: number;
    title: string;
    settingDescription: string;
    sensoryDetails: {
        sight: string[];
        sound: string[];
        smell: string[];
        taste: string[];
        touch: string[];
        internal: string[];
    };
    narrativeContent: string;
    dialogueEntries?: Array<{
        speaker: string;
        spokenText: string;
        subtext: string;
        actionBeat?: string;
    }>;
    subtextLayer: string;
    emotionalShift: string;
    wordCount: number;
    showDontTellRatio: number;
}
export declare class SceneCritiqueDTO {
    sceneNumber: number;
    overallScore: number;
    approved: boolean;
    feedbackItems: Array<{
        category: string;
        score: number;
        feedback: string;
        suggestions: string[];
        lineReferences?: number[];
    }>;
    strengths: string[];
    weaknesses: string[];
    revisionRequired: boolean;
    revisionFocus?: string[];
    creativeRiskAssessment: string;
    psychologicalAlignment: string;
    complexityAssessment: string;
}
//# sourceMappingURL=ProjectModels.d.ts.map