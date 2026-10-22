import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Owner app and admin dashboard: JWT from POST /auth/login.
export const userAuth = registry.registerComponent("securitySchemes", "userAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "JWT from `POST /auth/login`. Lasts 3 days.",
});

// ESP32 / ESP32-CAM: device token issued at pairing.
export const deviceAuth = registry.registerComponent("securitySchemes", "deviceAuth", {
  type: "http",
  scheme: "bearer",
  description: "Device token shown once when the admin pairs the feeder.",
});

export { z };
