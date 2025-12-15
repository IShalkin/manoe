import { Configuration, Inject } from "@tsed/di";
import { PlatformApplication } from "@tsed/common";
import "@tsed/platform-express";
import "@tsed/socketio";
import * as bodyParser from "body-parser";
import compress from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import methodOverride from "method-override";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Import controllers
import { ProjectController } from "./controllers/ProjectController";
import { GenerationController } from "./controllers/GenerationController";
import { MemoryController } from "./controllers/MemoryController";
import { ModelsController } from "./controllers/ModelsController";
import { HealthController } from "./controllers/HealthController";

const rootDir = __dirname;

@Configuration({
  rootDir,
  acceptMimes: ["application/json"],
  httpPort: process.env.PORT || 3000,
  httpsPort: false,
  mount: {
    "/api": [
      ProjectController,
      GenerationController,
      MemoryController,
      ModelsController,
      HealthController,
    ],
  },
  socketIO: {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  },
  middlewares: [
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    }),
    cookieParser(),
    compress(),
    methodOverride(),
    bodyParser.json(),
    bodyParser.urlencoded({ extended: true }),
  ],
  exclude: ["**/*.spec.ts"],
})
export class Server {
  @Inject()
  protected app: PlatformApplication;

  @Configuration()
  protected settings: Configuration;

  $beforeRoutesInit(): void {
    // Add any pre-route initialization here
  }

  $afterRoutesInit(): void {
    // Add any post-route initialization here
  }
}
