import { Configuration } from "@tsed/di";
import { PlatformApplication } from "@tsed/common";
import "@tsed/platform-express";
import "@tsed/socketio";
import "@tsed/swagger";
export declare class Server {
    protected app: PlatformApplication;
    protected settings: Configuration;
    $beforeRoutesInit(): void;
    $afterRoutesInit(): void;
}
//# sourceMappingURL=Server.d.ts.map