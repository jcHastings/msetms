# Samsara camera stills on load documents

Stacked on draft PR #68 tip `d68e77d6977d4779b266e823a4e8f179a76856cb` (200-mi lane avg + RC fine print). Tip SHA is the latest commit on `cursor/samsara-still-docs-4c31`.

JC yes via Chief of Staff. Draft tip only. No Office Update. No merge.

## What

Dispatchers pull one Samsara dashcam still onto a load as a document, same place as POD.

- `POST /cameras/media/retrieval` with `mediaType=image`
- Poll `GET /cameras/media/retrieval?retrievalId=`
- Download the signed URL (expires ~8h) into `data/uploads/{loadId}`
- Kind `samsara_still`, `uploaded_by=samsara`, audit line `source=samsara;facing=…;vehicle=…;time=…;retrieval=…`

Truck → vehicle uses the existing `trucks.samsara_vehicle_id` field (and `loads.truck_samsara_id` as a fallback). No second ID store.

## Auth

Env var: `SAMSARA_API_TOKEN` (same as GPS / HOS / import). Never hardcoded.

Token scopes (Samsara docs, Safety & Cameras):

- **Write Media Retrieval**
- **Read Media Retrieval**

Missing token or 401/403 is a setup blocker on the panel. It does not 500 and does not block Confirm.

## Demo clicks

1. Open a load that has a truck with a Samsara vehicle id.
2. **Documents** tab.
3. **Fetch Samsara still**.
4. Time: **Now** (default). **Arrive** / **Depart** show when those stop times exist. **Custom** is a datetime box.
5. Camera: **Road-facing** (default) or **Driver-facing**.
6. After success the image is in **Load documents** as **Samsara still**.
7. Same control is on **Fleet → Trucks → unit** when that truck has a load.

Soft-fail copy covers offline, monthly media quota, no still at that time, and a missing vehicle id. Saving the load / Confirm is unchanged.

## Out of scope

Live video, hyperlapse, auto-poll every minute, trailer Orbcomm cameras, Office Update, merge.
