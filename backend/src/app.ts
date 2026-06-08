import express, {
  Application,
  NextFunction,
  Request,
  Response,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import httpStatus from "http-status";
import cookieParser from "cookie-parser";

import config from "./config";
import { Routers } from "./router";
import globalErrorHandler from "./app/middleware/global.error.handler";

const app: Application = express();

app.set("trust proxy", 1);

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});

app.use(limiter);

/**
 * Allowed frontend origins.
 * Falls back to localhost origins during development.
 */
const defaultCorsOrigins: string[] =
  process.env.NODE_ENV === "development"
    ? ["http://localhost:4001", "http://localhost:4002"]
    : [];

const corsOrigins: string[] =
  config.cors_origins && config.cors_origins.length > 0
    ? config.cors_origins
    : defaultCorsOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin && process.env.NODE_ENV === "production") {
        return callback(new Error("Origin header required in production"));
      }

      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          new Error(
            "Blocked by Cross-Origin Resource Sharing (CORS) Policy"
          )
        );
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Cookie",
    ],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

/**
 * Rewrites legacy story routes to the current API version.
 *
 * Example:
 * /api/story/:id/character-network
 * ->
 * /api/v1/story/:id/character-network
 */
const rewriteLegacyStoryRoutes = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (
    req.method === "GET" &&
    /^\/api\/story\/[a-f0-9]{24}\/character-network$/i.test(req.path)
  ) {
    req.url = req.url.replace(
      /^\/api\/story\//,
      "/api/v1/story/"
    );
  }

  next();
};

app.use(rewriteLegacyStoryRoutes);

app.use("/api/v1", Routers);

app.use((req: Request, res: Response) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: "Not Found",
    errorMessages: [
      {
        path: req.originalUrl,
        message: "API Not Found",
      },
    ],
  });
});

app.use(globalErrorHandler);

export default app;
