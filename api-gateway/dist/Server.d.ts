import { Configuration } from "@tsed/di";
import { PlatformApplication } from "@tsed/common";
import "@tsed/platform-express";
import "@tsed/socketio";
import "@tsed/swagger";
import { StorytellerOrchestrator } from "./services/StorytellerOrchestrator";
export declare class Server {
    protected app: PlatformApplication;
    protected orchestrator: StorytellerOrchestrator;
    protected settings: Configuration;
    $beforeRoutesInit(): void;
    $afterRoutesInit(): Promise<void>;
    /**
     * Register handler for graceful shutdown
     * Saves active run states to Supabase before process exit
     */
    private registerShutdownHandler;
}
//# sourceMappingURL=Server.d.ts.map