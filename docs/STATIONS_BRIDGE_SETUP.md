# Stations: connect the gateway to the backend

```
station --LoRa--> [relay ...] --LoRa--> gateway --USB serial--> bridge (a computer or Raspberry Pi) --HTTPS--> backend /api/stations/ingest
```
The gateway firmware prints `[DATA RX] ...` lines and has no network. The bridge (`backend/scripts/station_bridge.py`) turns each line into a reading and sends signed batches. The backend checks an HMAC-SHA256 signature per gateway. The node payload (15 bytes, tag `S`) matches the backend decoder (`app/services/stations.py`); position (`P`) and sound (`A`) payloads are decoded too.

## One-time setup
1. **Make a secret** (keep it out of chat and out of git): `python3 -c "import secrets;print(secrets.token_hex(32))"`
2. **Backend (Vercel project `terra-watch-server`)**: add the environment variable `STATION_GATEWAY_KEYS` with the value `gw1:<the secret>` (several gateways: `gw1:s1,gw2:s2`) for Production, marked sensitive, then redeploy the backend. Without it the endpoint answers 503 (ingest off).
   `cd website/backend && npx vercel env add STATION_GATEWAY_KEYS production --sensitive` (paste the value when asked)
3. **Register each station** in the dashboard: Admin, station setup (node id, name, position, state). Node ids heard by the gateway but not registered are listed there to claim.
4. **On the machine next to the gateway:**
   ```
   export STATION_GATEWAY_SECRET=<the secret>
   python backend/scripts/station_bridge.py --port /dev/ttyACM0 --url https://terra-watch-server.vercel.app --gateway-id gw1
   ```
   Readings that cannot be sent are kept in `~/.station_bridge_queue.jsonl` and retried, so a dropped link loses nothing. Use `--file gateway.log` to replay a saved serial log.

## Check it works
- The bridge prints `sent N {"stored": ..., "unknown_node": ...}`. `unknown_node` means the station is not registered yet.
- The Control Room page "Stations" lists the station as online after its first report; a station silent for two intervals shows as late, then offline.
- Rotate the secret by changing the Vercel variable and the bridge's environment together, then redeploy.

## Not done yet
- Hardware test of the gateway and nodes together (firmware notes say not tested on hardware).
- Frequency: firmware is 433 MHz; check the licence-free band for India before ordering radios (docs/13, open item 2).
