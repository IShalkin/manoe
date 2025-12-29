"use strict";
/**
 * Agents Module Exports
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchivistAgent = exports.ImpactAgent = exports.OriginalityAgent = exports.CriticAgent = exports.WriterAgent = exports.StrategistAgent = exports.WorldbuilderAgent = exports.ProfilerAgent = exports.ArchitectAgent = exports.AgentFactory = exports.BaseAgent = void 0;
var BaseAgent_1 = require("./BaseAgent");
Object.defineProperty(exports, "BaseAgent", { enumerable: true, get: function () { return BaseAgent_1.BaseAgent; } });
var AgentFactory_1 = require("./AgentFactory");
Object.defineProperty(exports, "AgentFactory", { enumerable: true, get: function () { return AgentFactory_1.AgentFactory; } });
__exportStar(require("./types"), exports);
// Agent implementations will be exported here as they are created
var ArchitectAgent_1 = require("./ArchitectAgent");
Object.defineProperty(exports, "ArchitectAgent", { enumerable: true, get: function () { return ArchitectAgent_1.ArchitectAgent; } });
var ProfilerAgent_1 = require("./ProfilerAgent");
Object.defineProperty(exports, "ProfilerAgent", { enumerable: true, get: function () { return ProfilerAgent_1.ProfilerAgent; } });
var WorldbuilderAgent_1 = require("./WorldbuilderAgent");
Object.defineProperty(exports, "WorldbuilderAgent", { enumerable: true, get: function () { return WorldbuilderAgent_1.WorldbuilderAgent; } });
var StrategistAgent_1 = require("./StrategistAgent");
Object.defineProperty(exports, "StrategistAgent", { enumerable: true, get: function () { return StrategistAgent_1.StrategistAgent; } });
var WriterAgent_1 = require("./WriterAgent");
Object.defineProperty(exports, "WriterAgent", { enumerable: true, get: function () { return WriterAgent_1.WriterAgent; } });
var CriticAgent_1 = require("./CriticAgent");
Object.defineProperty(exports, "CriticAgent", { enumerable: true, get: function () { return CriticAgent_1.CriticAgent; } });
var OriginalityAgent_1 = require("./OriginalityAgent");
Object.defineProperty(exports, "OriginalityAgent", { enumerable: true, get: function () { return OriginalityAgent_1.OriginalityAgent; } });
var ImpactAgent_1 = require("./ImpactAgent");
Object.defineProperty(exports, "ImpactAgent", { enumerable: true, get: function () { return ImpactAgent_1.ImpactAgent; } });
var ArchivistAgent_1 = require("./ArchivistAgent");
Object.defineProperty(exports, "ArchivistAgent", { enumerable: true, get: function () { return ArchivistAgent_1.ArchivistAgent; } });
//# sourceMappingURL=index.js.map