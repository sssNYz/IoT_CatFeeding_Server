# ESP32-CAM gets the event_id from the main ESP32 over UART

The main ESP32 creates each feeding's `event_id`, but the photo is taken by a separate ESP32-CAM board that must tag its upload with that same ID. We wire the two boards together with UART and the main ESP32 sends the `event_id` down the wire, instead of publishing it on an MQTT topic. UART works with no Internet or broker, keeps the camera off MQTT entirely (no extra MQTT login or ACL entry), and the camera's only server contact stays the HTTPS image upload.

## Consequences

- The camera may upload its photo long after the event (after an outage), so the server links image and event by `event_id` at read time, never by arrival order.
- Changing to MQTT later means rewiring and reflashing both boards.
