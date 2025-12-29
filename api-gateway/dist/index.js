"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@tsed/common");
const platform_express_1 = require("@tsed/platform-express");
const Server_1 = require("./Server");
async function bootstrap() {
    try {
        const platform = await platform_express_1.PlatformExpress.bootstrap(Server_1.Server);
        await platform.listen();
        common_1.$log.info("MANOE API Gateway started successfully");
        common_1.$log.info(`Server listening on port ${process.env.PORT || 3000}`);
    }
    catch (error) {
        common_1.$log.error({ event: "SERVER_BOOTSTRAP_ERROR", error });
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=index.js.map