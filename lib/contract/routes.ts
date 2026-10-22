import type { ZodType } from "zod";
import { deviceAuth, registry, userAuth, z } from "./registry";
import * as S from "./schemas";

// ---------- Helpers ----------

const json = (schema: ZodType, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const err = (description: string, code: string, message: string) => ({
  description,
  content: { "application/json": { schema: S.ErrorResponse, example: { error: { code, message } } } },
});

const E401 = { 401: err("Missing or expired token", "unauthorized", "Token missing or expired") };
const E403 = { 403: err("Not your feeder, or admin only", "forbidden", "You do not have access to this feeder") };
const E404 = { 404: err("Not found", "not_found", "Feeder not found") };
const E422 = {
  422: {
    description: "Validation failed; see error.details",
    content: {
      "application/json": {
        schema: S.ErrorResponse,
        example: {
          error: {
            code: "validation_error",
            message: "portion_g must be between 5 and 100",
            details: [{ field: "portion_g", message: "Too big: expected <= 100" }],
          },
        },
      },
    },
  },
};

const feederParams = z.object({ id: S.FeederId });
const asUser = [{ [userAuth.name]: [] }];
const asDevice = [{ [deviceAuth.name]: [] }];

// ---------- Auth ----------

registry.registerPath({
  method: "post",
  path: "/auth/login",
  operationId: "login",
  tags: ["Auth"],
  summary: "Log in with email + password",
  security: [],
  request: { body: { content: { "application/json": { schema: S.LoginRequest } } } },
  responses: { 200: json(S.LoginResponse, "Logged in"), ...E401, ...E422 },
});

registry.registerPath({
  method: "get",
  path: "/me",
  operationId: "getMe",
  tags: ["Auth"],
  summary: "Who am I",
  security: asUser,
  responses: { 200: json(S.User, "The logged-in user"), ...E401 },
});

// ---------- Feeders ----------

registry.registerPath({
  method: "get",
  path: "/feeders",
  operationId: "listFeeders",
  tags: ["Feeders"],
  summary: "List feeders",
  description: "Owner: only their feeders. Admin: every feeder.",
  security: asUser,
  responses: { 200: json(z.object({ feeders: z.array(S.Feeder) }), "Feeders with status"), ...E401 },
});

registry.registerPath({
  method: "get",
  path: "/feeders/{id}/status",
  operationId: "getFeederStatus",
  tags: ["Feeders"],
  summary: "Online state and schedule sync",
  description: "Poll every 5 s while the screen is open.",
  security: asUser,
  request: { params: feederParams },
  responses: { 200: json(S.FeederStatus, "Status"), ...E401, ...E403, ...E404 },
});

registry.registerPath({
  method: "post",
  path: "/feeders/{id}/pair",
  operationId: "pairFeeder",
  tags: ["Admin"],
  summary: "Pair or re-pair a feeder (admin)",
  description:
    "Assigns the owner and creates a new MQTT password + device token. They are shown only in this response. Old secrets stop working.",
  security: asUser,
  request: { params: feederParams, body: { content: { "application/json": { schema: S.PairRequest } } } },
  responses: { 200: json(S.PairResponse, "New secrets"), ...E401, ...E403, ...E404, ...E422 },
});

// ---------- Schedules ----------

registry.registerPath({
  method: "get",
  path: "/feeders/{id}/schedules",
  operationId: "listSchedules",
  tags: ["Schedules"],
  summary: "List schedules",
  security: asUser,
  request: { params: feederParams },
  responses: { 200: json(S.ScheduleList, "All schedules + current version"), ...E401, ...E403, ...E404 },
});

registry.registerPath({
  method: "post",
  path: "/feeders/{id}/schedules",
  operationId: "saveSchedule",
  tags: ["Schedules"],
  summary: "Create or update a schedule",
  description:
    "No schedule_id = create (the server makes one). Existing schedule_id = update. The whole set is then published to the feeder and schedule_version goes up by 1.",
  security: asUser,
  request: { params: feederParams, body: { content: { "application/json": { schema: S.ScheduleInput } } } },
  responses: { 201: json(S.ScheduleSaved, "Saved and published"), ...E401, ...E403, ...E404, ...E422 },
});

registry.registerPath({
  method: "delete",
  path: "/feeders/{id}/schedules/{schedule_id}",
  operationId: "deleteSchedule",
  tags: ["Schedules"],
  summary: "Delete a schedule",
  security: asUser,
  request: { params: feederParams.extend({ schedule_id: z.string() }) },
  responses: { 200: json(S.ScheduleDeleted, "Deleted and republished"), ...E401, ...E403, ...E404 },
});

// ---------- Manual feed ----------

registry.registerPath({
  method: "post",
  path: "/feeders/{id}/commands/feed",
  operationId: "feedNow",
  tags: ["Commands"],
  summary: "Feed now",
  description:
    "Returns 202: the command was sent, not done. Poll GET /feeders/{id}/commands/{command_id} until status is `done`. The server never expires a command: a feeder that was offline ignores it once it is over 60 s old (spec rule 9), so it stays `sent`. Give up after about 60 s.",
  security: asUser,
  request: { params: feederParams, body: { content: { "application/json": { schema: S.FeedCommandRequest } } } },
  responses: { 202: json(S.FeedCommand, "Sent to the feeder"), ...E401, ...E403, ...E404, ...E422 },
});

registry.registerPath({
  method: "get",
  path: "/feeders/{id}/commands/{command_id}",
  operationId: "getCommand",
  tags: ["Commands"],
  summary: "Check a manual feed",
  security: asUser,
  request: { params: feederParams.extend({ command_id: z.string() }) },
  responses: { 200: json(S.FeedCommand, "Command with status"), ...E401, ...E403, ...E404 },
});

// ---------- Feeding events ----------

registry.registerPath({
  method: "get",
  path: "/feeders/{id}/events",
  operationId: "listEvents",
  tags: ["Events"],
  summary: "Feeding history",
  description:
    "History screen: use from/to. Live updates: poll every 5 s with since = the newest received_at you already have.",
  security: asUser,
  request: { params: feederParams, query: S.EventsQuery },
  responses: { 200: json(S.EventList, "Events"), ...E401, ...E403, ...E404, ...E422 },
});

registry.registerPath({
  method: "get",
  path: "/feeders/{id}/events.csv",
  operationId: "exportEventsCsv",
  tags: ["Admin"],
  summary: "Export events as CSV (admin)",
  security: asUser,
  request: { params: feederParams, query: S.EventsQuery.pick({ from: true, to: true }) },
  responses: {
    200: { description: "CSV, times in +07:00", content: { "text/csv": { schema: z.string() } } },
    ...E401,
    ...E403,
    ...E404,
  },
});

// ---------- Cats ----------

registry.registerPath({
  method: "get",
  path: "/cats",
  operationId: "listCats",
  tags: ["Cats"],
  summary: "List my cats",
  security: asUser,
  responses: { 200: json(z.object({ cats: z.array(S.Cat) }), "Cats"), ...E401 },
});

registry.registerPath({
  method: "post",
  path: "/cats",
  operationId: "createCat",
  tags: ["Cats"],
  summary: "Register a cat with its RFID tag",
  security: asUser,
  request: { body: { content: { "application/json": { schema: S.CatInput } } } },
  responses: {
    201: json(S.Cat, "Created"),
    ...E401,
    409: err("This RFID tag is already registered", "conflict", "RFID tag E200001A is already registered"),
    ...E422,
  },
});

// ---------- Sounds + media ----------

registry.registerPath({
  method: "get",
  path: "/feeders/{id}/sounds",
  operationId: "listSounds",
  tags: ["Sounds"],
  summary: "List feeding sounds",
  security: asUser,
  request: { params: feederParams },
  responses: { 200: json(z.object({ sounds: z.array(S.Sound) }), "Sounds"), ...E401, ...E403, ...E404 },
});

registry.registerPath({
  method: "post",
  path: "/feeders/{id}/sounds",
  operationId: "uploadSound",
  tags: ["Sounds"],
  summary: "Upload a feeding sound",
  security: asUser,
  request: { params: feederParams, body: { content: { "multipart/form-data": { schema: S.SoundUpload } } } },
  responses: { 201: json(S.Sound, "Converted and stored"), ...E401, ...E403, ...E404, ...E422 },
});

registry.registerPath({
  method: "get",
  path: "/media/{media_id}",
  operationId: "getMedia",
  tags: ["Sounds"],
  summary: "Download an image or sound",
  security: asUser,
  request: {
    params: z.object({
      media_id: z.string().openapi({ format: "uuid", description: "Any id that names no file, malformed or not, is 404" }),
    }),
  },
  responses: {
    200: {
      description: "The file",
      content: {
        "image/jpeg": { schema: z.string().openapi({ type: "string", format: "binary" }) },
        "audio/mpeg": { schema: z.string().openapi({ type: "string", format: "binary" }) },
      },
    },
    ...E401,
    ...E403,
    ...E404,
  },
});

// ---------- Devices ----------

registry.registerPath({
  method: "post",
  path: "/devices/{id}/images",
  operationId: "deviceUploadImage",
  tags: ["Devices"],
  summary: "Upload a visit photo (ESP32-CAM)",
  security: asDevice,
  request: { params: feederParams, body: { content: { "multipart/form-data": { schema: S.ImageUpload } } } },
  responses: { 201: json(S.ImageSaved, "Stored"), ...E401, ...E422 },
});

registry.registerPath({
  method: "get",
  path: "/devices/{id}/sounds/{sound_id}",
  operationId: "deviceGetSound",
  tags: ["Devices"],
  summary: "Download a feeding sound (main ESP32)",
  security: asDevice,
  request: { params: feederParams.extend({ sound_id: z.string() }) },
  responses: {
    200: { description: "MP3", content: { "audio/mpeg": { schema: z.string().openapi({ type: "string", format: "binary" }) } } },
    ...E401,
    ...E404,
  },
});

// ---------- Admin ----------

registry.registerPath({
  method: "get",
  path: "/admin/users",
  operationId: "adminListUsers",
  tags: ["Admin"],
  summary: "List users (to pick an owner when pairing)",
  security: asUser,
  responses: { 200: json(z.object({ users: z.array(S.User) }), "Users"), ...E401, ...E403 },
});

registry.registerPath({
  method: "get",
  path: "/admin/events",
  operationId: "adminListEvents",
  tags: ["Admin"],
  summary: "All feeding events, with raw payload",
  security: asUser,
  request: {
    query: S.EventsQuery.extend({
      feeder: S.FeederId.optional(),
      result: S.FeedResult.optional(),
    }),
  },
  responses: { 200: json(z.object({ events: z.array(S.AdminEvent) }), "Events"), ...E401, ...E403, ...E422 },
});

registry.registerPath({
  method: "get",
  path: "/admin/stats",
  operationId: "adminGetStats",
  tags: ["Admin"],
  summary: "Duplicate and failure counts",
  security: asUser,
  responses: { 200: json(S.AdminStats, "Stats"), ...E401, ...E403 },
});
