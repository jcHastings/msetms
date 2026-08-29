# MSE TMS product catalog

Source of truth for what this product is for. **Do not treat this list as a build-now backlog.** v1 only ships the slice in [ROADMAP.md](./ROADMAP.md). Most items below are later.

This catalog records the owner’s Reefer Trucking TMS vision: a numbered core of **300** capabilities plus the extension modules (Accounting, Fuel, Customer Portal, Core Integrations, EDI & API, AI, Executive Command Center). The original Grok/owner paste was not attached to this repository run; the numbered list here is the persisted product catalog for M&S Loads, aligned to that brief.

## Design principle

**Exception-ranked command center, not babysitting a map.**

Dispatchers should open the desk and see the handful of loads that need a human — late to pickup, reefer out of range, HOS running out, missing POD, compliance about to expire — ranked by severity. A map is a detail view, not the product.

## Architecture

**The TMS sits above the systems of record. It normalizes. It does not replace them.**

| Layer | Role |
| --- | --- |
| **MSE TMS** | Loads, assign/reassign, documents, exceptions, settlements, customer billing, IFTA filing packet |
| **Samsara** | Tractor GPS, driver HOS, IFTA jurisdiction miles |
| **ORBCOMM** | Trailer location (when present), reefer temp / setpoint / return-supply / alarms |
| **Later reefer telematics** | Carrier Lynx, Thermo King — additional reefer feeds if needed |
| **Motive** | Optional ELD / GPS alternative; never required |
| **Fuel cards** | Gallons and location for IFTA / fuel tax — later |
| **QuickBooks Online** | Customer invoices (and later payments / bills). Not the dispatch system of record |

Confirmed split (do not blur):

- **Samsara** = truck GPS + HOS (+ IFTA miles). Never reefer temps.
- **ORBCOMM** = trailer tracking + reefer monitoring. Never HOS.
- **Later:** Carrier Lynx / Thermo King as extra reefer telematics; Motive optional.

Credentials stay in gitignored `.env`. Demo is labeled. A failed live API is an error, not invented “live” data.

## How to use this catalog

- **[v1]** = already in this PR’s slice (or the in-flight stub). Keep shipping that slice.
- Unmarked = not now. Sequence via ROADMAP.
- Extensions are after item 300. They are modules, not a reason to explode v1.

---

## 1–25 · Command center and exceptions

1. [v1] Home counts: open loads, in transit, available trucks, unassigned loads.
2. [v1] Dispatch inbox ranked by exception severity (the “7 loads need attention” list).
3. [v1] Exception types in this slice: late to PU/DEL, window at risk, reefer vs setpoint, missing POD, compliance expiring, unassigned covering today. (HOS short is later.)
4. [v1] Acknowledge / snooze / resolve an exception with a reason.
5. Exception history on the load.
6. [v1] Shift handoff note (“what’s on fire”).
7. [v1] Watch list of loads a dispatcher pinned.
8. [v1] Silent loads (in transit, no exception) stay off the inbox.
9. Map is a drill-in, not the home screen.
10. Sound / badge only for new high-severity exceptions.
11. [v1] Filter inbox by exception type.
12. [v1] Filter inbox by customer or lane (find box).
13. Filter inbox by driver or truck.
14. Saved inbox views per dispatcher.
15. [v1] “All quiet” empty state when nothing is on fire.
16. [v1] Daily recap: delivered, late, claims opened.
17. Weekly recap: on-time %, temp claims, detention.
18. [v1] Command-center KPI strip (open loads, rolling, trucks available, unassigned).
19. Click-through from a KPI to the matching load list.
20. After-hours on-call queue.
21. Escalation if an exception sits untouched.
22. Multi-dispatcher claim of an exception (“I’ve got it”).
23. Audit: who resolved which exception.
24. [v1] Seed / demo exceptions labeled as demo.
25. Never invent a live exception from a failed telematics call.

## 26–55 · Loads and dispatch board

26. [v1] Load list with status, pickup, delivery, assigned truck/driver, dates.
27. [v1] Filter board by status.
28. [v1] Filter board by pickup date.
29. [v1] Search by load #, customer, origin, destination, commodity. Dedicated Search page: origin/dest state, first-pickup date range, This week/This month, customer/driver/truck/trailer/status, live/archived/cancelled, saved reports.
30. [v1] Create a load: customer, origin, destination, PU/DEL windows, weight, commodity, rate, notes.
31. [v1] Statuses: available, hold, assigned, dispatched, at PU, loading, picked up, in transit, at DEL, unloading, delivered, completed, cancelled.
32. [v1] Edit a load after it is created.
33. [v1] Special instructions travel with the load.
34. [v1] Appointment notes and refs / PO on the load.
35. [v1] Reefer setpoint on the load.
36. [v1] Assign truck + trailer + driver from the board.
37. [v1] Change unit after dispatch; old driver loses the load.
38. [v1] Assign-time compliance warnings; expired docs require confirm.
39. [v1] Richer statuses: dispatched, at PU, loading, picked up, at DEL, unloading, completed.
40. [v1] Status reason codes (wait, breakdown, rejected, rolled).
41. [v1] Multi-stop loads (more than PU + DEL).
42. [v1] Stop sequence reorder.
43. [v1] Split / relay (hook and drop, second driver). Internal legs only — not on the customer invoice or customer confirmation.
44. [v1] Team vs solo flag.
45. [v1] Load templates by customer / lane.
46. [v1] Duplicate a load.
47. [v1] Cancel with reason (stored on the load; driver notify later).
48. [v1] Hold / pending customer confirmation.
49. [v1] Cover-by date vs pickup window.
50. [v1] Equipment required (53' reefer, dry van, flatbed, power only).
51. Temperature required vs actual setpoint mismatch alert.
52. [v1] Commodity class / hazmat flag.
53. [v1] Seal numbers on the load.
54. [v1] Pallet / case counts.
55. Load profit snapshot (rate vs OO pay vs estimated fuel) — later.

## 56–80 · Windows, appointments, detention

56. [v1] Pickup window start/end.
57. [v1] Delivery window start/end.
58. [v1] Appointment-required flag per stop (on the location; shown on the load and driver).
59. [v1] Appointment confirmation number.
60. [v1] FCFS vs appointment (per location).
61. [v1] Detention clock start / stop.
62. Detention free time by customer.
63. Auto-suggest detention from geofence dwell — later.
64. [v1] Lumper expected / actual.
65. [v1] Driver assist / unload type.
66. [v1] Scale tickets (document type on the load).
67. Arrival / departure timestamps (manual).
68. Arrival / departure from geofence (Samsara) — later.
69. Late risk forecast vs appointment.
70. Reschedule a stop.
71. Notify customer of ETA change — later (portal / email).
72. Yard dwell.
73. [v1] Drop hook vs live unload (unload type on the load).
74. Pre-cool required before PU.
75. Pulp / product temp at PU.
76. [v1] Receiver (and shipper) hours of operation on the location.
77. Closed-day calendar (no Saturday, etc.).
78. Time-zone display per stop.
79. Recurring dedicated lane schedule.
80. Tender accept / reject timestamps.

## 81–105 · Customers, rates, and lanes

81. [v1] Customer name and billing notes.
82. [v1] Customer contacts (name, role, phone, email).
83. [v1] Pick a customer when creating a load.
84. [v1] Create customer from a rate-con import if the name is new.
85. Bill-to vs shipper vs consignee parties.
86. [v1] Credit hold.
87. [v1] Default payment terms.
88. Customer-required documents (POD, temp log, seals).
89. Customer accessorial tariff (lumper, detention, layover).
90. Fuel surcharge schedule.
91. Lane history: what we charged last time.
92. Simple pricing helper from lane history.
93. Quote vs booked rate.
94. Accessorials on the load (not only the linehaul).
95. Rate confirmation number stored as the load # or ref.
96. Broker vs direct shipper flag.
97. Customer portal users — see Customer Portal extension.
98. Do-not-use locations.
99. Preferred drivers / trucks for a customer.
100. Insurance certificate requirements.
101. POD email routing per customer.
102. Invoice email routing per customer.
103. Customer scorecard (on-time, claims).
104. Blacklist a lane or receiver.
105. Merge duplicate customer records.

## 106–130 · Fleet: trucks and trailers

106. [v1] Trucks: unit #, type, capacity, status, assigned driver, notes, active.
107. [v1] Truck types: dry van, reefer, flatbed, box, power only.
108. [v1] Truck status: available, in use, maintenance, out of service.
109. [v1] Samsara vehicle ID on the truck.
110. [v1] First-class trailers (unit, type, status).
111. [v1] ORBCOMM asset ID on the trailer.
112. [v1] Assign truck and trailer separately on a load.
113. [v1] Truck registration issued / expires (60-day window).
114. [v1] Trailer registration issued / expires (60-day window).
115. [v1] DOT inspection completed / expires (30-day window).
116. [v1] Fleet document uploads (registration, DOT, insurance).
117. [v1] VIN, plate, year, make, model on the truck.
118. [v1] Trailer VIN / plate.
119. Next PM due (miles or date).
120. Out-of-service reason.
121. Trailer pool / yard location.
122. Trailer inventory independent of power.
123. Reefer hour meter.
124. Trailer loaded / empty / dropped status.
125. [v1] Hooked-to truck (current pairing).
126. Ownership: company vs leased vs OO trailer.
127. IFTA qualified vehicle flag.
128. Fuel type / tank size.
129. ELD device id (if not Samsara).
130. Do not dispatch if registration or DOT is expired (hard block option).

## 131–155 · Drivers, HOS, compliance

131. [v1] Drivers: name, phone, email, license, assigned truck, notes, active, status.
132. [v1] Driver PIN login for the driver app.
133. [v1] Samsara driver ID.
134. [v1] License number, state, expiration (30-day window).
135. [v1] Medical card issued / expires (30-day window).
136. [v1] Company driver vs owner-operator.
137. [v1] Default OO pay percent on the driver.
138. [v1] Assign-time alerts name the person, document, and date.
139. [v1] Dashboard / fleet list of upcoming compliance.
140. [v1] Remaining drive time from Samsara HOS clocks (live or labeled demo).
141. CDL class and endorsements (hazmat, tanker).
142. Twic / passport / FAST.
143. Drug test / clearinghouse status.
144. Hire date / termination date.
145. Emergency contact.
146. Preferred home time.
147. HOS cycle (70/8 vs 60/7).
148. Recap hours.
149. Violation / CSA notes.
150. Driver document vault (CDL image, med card image) — [v1] uploads exist.
151. Expiring-doc email to dispatcher.
152. Cannot assign when license/med expired unless override.
153. Home-time request calendar.
154. Driver scorecard (on-time, claims, HOS).
155. Contractor packet / W-9 for OO — later.

## 156–180 · Reefer and cold chain

156. [v1] Reefer setpoint on the load.
157. [v1] Live or imported ORBCOMM temp, setpoint, return/supply, alarms.
158. [v1] Trailer location from ORBCOMM when the report has it.
159. [v1] Settings: ORBCOMM connect status; demo if no credentials.
160. [v1] Import Reefer Status Report CSV/JSON (no portal scrape).
161. Temp vs setpoint variance banner on the load.
162. Continuous temp log attached to the load.
163. Pre-trip reefer checklist.
164. Pre-cool complete flag.
165. Pulp temperatures at pickup.
166. Alarm acknowledge + dispatcher note.
167. Claim pack: temp log + photos + setpoint history.
168. Remote setpoint change request (Thermo King / Carrier Lynx later) — TMS records the request, does not replace the OEM portal.
169. Multi-zone reefer.
170. Defrost cycle visible.
171. Door-open events from the trailer feed.
172. Run-mode (continuous / cycle-sentry / start-stop).
173. Fuel / hour meter on the reefer unit.
174. FSMA-style temp report PDF on the load.
175. Customer-required temp range vs actual.
176. Auto-exception when temp leaves the band.
177. Second telematics source (Carrier Lynx) merged, labeled by source.
178. Third telematics source (Thermo King) merged, labeled by source.
179. Never show Samsara as the reefer source.
180. Never invent a live temp when ORBCOMM credentials fail.

## 181–200 · Documents and rate cons

181. [v1] Attachments on the load (rate con, BOL, POD, lumper, photos).
182. [v1] Driver uploads from the phone-width app.
183. [v1] Rate-con ingest: PDF text extract + optional local OCR.
184. [v1] Review/edit extracted fields before save.
185. [v1] Original rate con stored on the load.
186. [v1] Load confirmation PDF from the live load (OO vs company template).
187. [v1] Company header editable on Settings.
188. [v1] IFTA report CSV attached to the load documents.
189. [v1] Document checklist per load (what’s still missing).
190. POD required before invoice.
191. Temp log required before invoice (reefer).
192. Photo requirements (seals, product, trailer) per customer.
193. Split-page / multi-page rate-con templates per customer.
194. Low-confidence parse queue (human confirm).
195. Email inbound rate con to a drop box — later.
196. Versioning when a rate con is revised.
197. Redact tokens / account numbers if a file is logged.
198. Retention policy for uploads.
199. Bulk download of a load’s packet.
200. Watermark demo files so they are never filed as live.

## 201–220 · Telematics normalize (Samsara / others)

201. [v1] Tractor GPS from Samsara (live or labeled demo).
202. [v1] Driver HOS from Samsara (live or labeled demo).
203. [v1] Map Samsara vehicle id on the truck, driver id on the driver.
204. [v1] 401/403 → error + demo GPS/HOS; do not crash.
205. [v1] IFTA refresh from Samsara IFTA APIs; demo from origin/destination without a token.
206. [v1] IFTA table: jurisdiction, miles, total, vehicle id, generated at.
207. Breadcrumb trail for a load window.
208. Geofence arrive/depart at PU and DEL.
209. Idle time on the load.
210. Speeding / harsh events (optional, later).
211. Motive adapter (same TMS fields as Samsara; labeled source).
212. Geotab adapter — later.
213. Vehicle assignment history (who had the truck).
214. IFTA live trip-window job as the default when Write IFTA is on the token.
215. IFTA quarter rollup across loads.
216. IFTA vs fuel-card gallons (Fuel extension).
217. Last GPS age (“stale 2h”) as an exception.
218. HOS projected arrival vs appointment.
219. Settings: each integration Connected vs Demo independently.
220. No secrets in git, logs, seed, or UI.

## 221–240 · Driver app and communications

221. [v1] Phone-width driver web app.
222. [v1] Name + PIN login.
223. [v1] Driver sees only their assigned / in-transit / delivered loads.
224. [v1] Progress: en route PU → loaded → en route DEL → delivered.
225. [v1] Progress moves dispatcher status to in transit / delivered.
226. [v1] Driver download of the load confirmation PDF.
227. Push notifications (native later).
228. Offline photo queue.
229. Camera-first POD.
230. In-app chat dispatcher ↔ driver.
231. Check-call template (location, ETA, temp).
232. SMS of dispatch / rate con — later.
233. Email of rate con and confirmation — later.
234. Native iOS wrapper.
235. Native Android wrapper.
236. Driver sees remaining drive time (Samsara).
237. Driver sees reefer temp/setpoint (ORBCOMM).
238. Driver can report a breakdown.
239. Driver can request detention start.
240. Sign-on-glass for load confirmation (OO).

## 241–260 · Pay: company vs owner-operator

241. [v1] Company vs OO on the driver.
242. [v1] Load stores OO % and computed pay (rate × %).
243. [v1] Company driver: pay N/A / cleared.
244. [v1] Recalc OO pay when the driver or rate changes.
245. [v1] Confirmation PDF: OO shows agreed amount / carrier pay; company does not.
246. [v1] QBO invoices the **customer rate**, never OO pay.
247. [v1] Settlement worksheet (delivered OO loads; mark paid locally).
248. Accessorials on the settlement (detention, layover, lumper advance).
249. Deductions (insurance, escrow, advances).
250. Per-diem vs taxable pay.
251. Statement PDF for the OO.
252. [v1] Mark settlement paid.
253. 1099 export — later.
254. Company driver payroll hours export — later.
255. Empty move / deadhead pay.
256. Stop-off pay.
257. Fuel advance (Comdata / EFS) — Fuel extension.
258. Recoup advance on settlement.
259. Dispute a line on the settlement.
260. Do not create a QBO bill for OO pay unless a later accounting slice says so.

## 261–280 · Claims, OS&D, safety

261. [v1] OS&D record on the load.
262. [v1] Claim number and status.
263. Photos + temp log linked to the claim.
264. Cargo insurance notice.
265. Rejected load workflow.
266. Reconsign / salvage.
267. Accident / incident file.
268. Safety meeting acknowledgements.
269. DVIR defects.
270. Out-of-service from a DVIR.
271. Insurance claim packet export.
272. Customer claim vs carrier claim.
273. Reserve / payout amounts.
274. Preventable flag.
275. Lessons-learned note.
276. Seal discrepancy.
277. Shortage / overage counts.
278. Temperature claim specific fields (setpoint, pulp, logger).
279. Legal hold on a load’s files.
280. Do not delete claim evidence on load cancel.

## 281–300 · Admin, users, reporting

281. [v1] Single-tenant local; dispatcher PIN login (demo: MS Test / 4020). Optional TOTP 2-step after PIN.
282. [v1] Administrator / Standard / Accounting roles (MS Test seeded as Administrator via manager).
283. [v1] Audit log: clone and desk actions (local).
284. [v1] Company profile (name, dispatcher, phone, email, fax, address, logo) for confirmations.
285. Terminal / yard list.
286. [v1] User add / deactivate (local PIN; no invite email).
287. [v1] Roles Administrator / Standard / Accounting (legacy manager and read-only still valid). Users tab + Settings → Users share the same records.
288. [v1] Data export (loads CSV).
289. [v1] On-time report.
290. [v1] Revenue by customer / lane.
291. Empty miles report.
292. Exception volume report.
293. Compliance expiration report — [v1] upcoming list exists.
294. IFTA packet by quarter (all loads).
295. Backup / restore of SQLite + uploads.
296. Environment / demo reset.
297. [v1] Currency (USD/CAD) and weight units (lb/kg).
298. Mobile dispatcher layout (tablet).
299. Help / how-we-dispatch short guide.
300. Catalog + roadmap stay the source of truth; new work is a slice, not “build 300.”

---

## Extension modules

These sit **on top of** the core 300. Do not start them until the ROADMAP phase says so.

### Accounting

- Customer invoice from a delivered load (linehaul = customer rate). [v1 stub: QBO send / demo invoice]
- Invoice accessorials (lumper, detention, fuel surcharge).
- Payments / AR aging. [v1 local mark-paid on invoices; no aging buckets yet]
- Credit memos.
- QBO customer find/create by name. [v1]
- QBO invoice id + timestamp on the load; no double-send without confirm. [v1]
- Bills for vendor / lumper (not OO settlement by default). [v1 local AP]
- OO settlement is **not** a QBO bill unless a later slice says so.
- Sync payments back from QBO.
- Multi-entity / multiple QBO realms — not v1.
- Credentials only via env; in-app QuickBooks Online OAuth stores realm/refresh on the server. [v1]

### Fuel

- Fuel card import (EFS, Comdata, Wex, etc.).
- Gallons and jurisdiction per swipe.
- Pair gallons with IFTA miles already on the load.
- IFTA tax worksheet (miles vs gallons by state/province).
- Fuel advance / code issuance.
- Fuel exception (off-route, high price).
- Tank / reefer fuel separate from tractor fuel.
- No inventing live card data when the feed fails.

### Customer portal

- Shipment status without the dispatch board.
- Login per customer contact.
- See only that customer’s loads.
- Documents the customer is allowed to download (POD, temp report).
- Appointment requests.
- Claim intake.
- No HOS, pay, or internal exceptions.

### Core integrations

- Samsara: GPS, HOS, IFTA. [v1 stubs + live when token set]
- ORBCOMM: trailer + reefer. [v1 stubs + import / live when creds set]
- QuickBooks Online: customer invoice. [v1 stub / live when tokens set]
- Carrier Lynx: additional reefer — later.
- Thermo King: additional reefer — later.
- Motive: optional GPS/HOS — later.
- Each integration Connected vs Demo independently.
- Normalize into TMS fields (`source: samsara | orbcomm | demo | …`).
- Failed live call → error, not a fake live payload.

### EDI & API

- 204 inbound (tender).
- 990 accept/reject.
- 214 status out.
- 210 invoice out.
- Customer-specific maps.
- Load-board post (DAT / Truckstop) — later.
- Public API for the customer portal and internal tools.
- Idempotent webhooks.
- v1 loads are keyed or imported from a rate con only.

### AI

- Digital dispatcher: suggest cover (truck + driver) from HOS, location, equipment, compliance.
- Rate-con extract beyond labeled text (already have a simple extract). [v1 labeled extract]
- Exception narrative (“why this load is on the inbox”).
- Lane price assist from history.
- Never auto-assign without a human confirm in early phases.
- Never silently overwrite a dispatcher’s assignment.
- Model/provider keys only in gitignored env.

### Executive Command Center

- Exception-ranked inbox as the default home (see items 2–25).
- Fleet-at-a-glance without babysitting every truck on a map.
- Today’s money: delivered unbilled, billed unpaid.
- Risk: expiring CDL/med/registration/DOT, reefer alarms, HOS.
- One-click to the load, not a new silo.
- After-hours summary.
- This is a **view of TMS data**, not a second product.

---

## v1 slice (this PR) — already shipping

See [SHIPPED.md](./SHIPPED.md) for the working-screen checklist. Dispatcher PIN login, Locations, Search, richer load statuses, multi-stop, clone/templates, exception inbox actions, Accounting (AR/AP/pay/commissions/QBO), compliance page, claims, reports.

Stubs + UI + seed when credentials/APIs are missing. No invented live third-party data.

Skipped for later: native iOS/Android stores, EDI VAN, live fuel cards, replacing Samsara, pixel-perfect Ascend.
