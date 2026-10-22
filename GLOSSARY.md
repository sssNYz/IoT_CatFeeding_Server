# Cat Feeder

A smart cat feeder that dispenses food on a schedule, records each feeding, and lets the owner watch and control it remotely.

## Language

### People and clients

**Owner**:
The person whose cat uses a feeder; they set schedules, trigger feeds and read history.
_Avoid_: User, customer

**Admin**:
A member of the project team who oversees every feeder; there is no admin sign-up.
_Avoid_: Superuser, operator

**Owner app**:
The mobile app the owner uses to control and watch their feeders.
_Avoid_: Dashboard, client, frontend

**Admin dashboard**:
The web page the project team uses to oversee every feeder; never used by owners.
_Avoid_: Dashboard (on its own), web app

### Devices

**Feeder**:
One physical cat feeder, made of a main ESP32 and an ESP32-CAM, identified by its `device_id`.
_Avoid_: Device (when you mean the whole unit), node

**Pairing**:
Giving a feeder its own secret logins and assigning it to an owner; re-pairing replaces the secrets and makes the old ones stop working.
_Avoid_: Registration, provisioning, onboarding

**Fake feeder**:
A script that stands in for a real feeder, speaking the same protocols, so the server and owner app can be built before the hardware exists.
_Avoid_: Simulator, mock device

### Feeding

**Feeding event**:
The record of one attempt to release food, identified by an `event_id` the feeder creates.
_Avoid_: Log, feed log, record

**Schedule**:
One planned daily feeding time with its portion and sound.
_Avoid_: Timer, alarm

**Schedule version**:
A number that goes up by one every time a feeder's set of schedules changes.
_Avoid_: Revision, schedule ID

**Synced**:
A feeder is synced when the schedule version it reports equals the server's newest schedule version.
_Avoid_: Up to date, applied

**Feeding sound**:
A short sound the owner records in the owner app, which the feeder plays at feeding time to call the cat.
_Avoid_: Audio, ringtone, call
