import { writeFileSync } from "node:fs";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "../lib/contract/registry";
import "../lib/contract/routes";

const doc = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: "3.1.0",
  info: {
    title: "Cat Feeder API",
    version: "0.1.0",
    description:
      "REST API for the owner app and admin dashboard. All times are Thai time (+07:00). Errors always use the Error shape.",
  },
  servers: [
    { url: "http://localhost:3000/api/v1", description: "Local development" },
    { url: "https://catfeeder-g05.duckdns.org/api/v1", description: "VPS (hostname not final)" },
  ],
});

writeFileSync("openapi.json", JSON.stringify(doc, null, 2) + "\n");
console.log(`openapi.json: ${Object.keys(doc.paths ?? {}).length} paths`);
