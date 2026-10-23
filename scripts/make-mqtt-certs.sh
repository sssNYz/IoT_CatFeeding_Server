#!/bin/sh
# Our own CA and Mosquitto's server certificate for MQTT over TLS on 8883 (spec Section 4).
#   sh scripts/make-mqtt-certs.sh            # reads PUBLIC_HOST from .env
# Writes certs/ (gitignored). Feeders trust certs/ca.crt, which is public: flash it into the firmware.
# certs/ca.key never leaves this machine. Re-running keeps an existing CA (feeders already trust it) and only
# makes a new server certificate, e.g. after PUBLIC_HOST changes.
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] && . ./.env
: "${PUBLIC_HOST:?PUBLIC_HOST is not set (see .env.example)}"
mkdir -p certs
cd certs

if [ ! -f ca.key ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
    -keyout ca.key -out ca.crt -subj "/CN=Cat Feeder MQTT CA"
fi

# RSA 2048 and SHA-256: what the ESP32's mbedTLS and small boards handle well.
openssl req -newkey rsa:2048 -nodes -sha256 -keyout mosquitto.key -out mosquitto.csr -subj "/CN=$PUBLIC_HOST"
printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$PUBLIC_HOST" > mosquitto.ext
openssl x509 -req -in mosquitto.csr -CA ca.crt -CAkey ca.key -CAcreateserial -sha256 -days 1825 \
  -extfile mosquitto.ext -out mosquitto.crt
rm -f mosquitto.csr mosquitto.ext
chmod 600 ca.key mosquitto.key
echo "certs/mosquitto.crt for $PUBLIC_HOST, signed by certs/ca.crt"
