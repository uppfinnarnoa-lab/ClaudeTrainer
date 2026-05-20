# Races API

## GET /api/races

Fetch all race records for the user.

**Auth:** Required

**Response (200):** Array of `RaceRecord`, ordered by `distanceM` asc then `date` desc.

```json
[
  {
    "id": "cuid",
    "distance": "5K",
    "distanceM": 5000,
    "time": 1185,
    "date": "2025-09-14",
    "eventName": "Lidingöloppet",
    "stravaActivityId": "123456789",
    "notes": null,
    "isManual": false
  }
]
```

---

## POST /api/races

Create a race record manually.

**Auth:** Required

**Request:**
```json
{
  "distance":         "string (e.g. '5K', 'Half Marathon')",
  "distanceM":        "number (meters)",
  "time":             "number (seconds)",
  "date":             "YYYY-MM-DD",
  "eventName":        "string | null",
  "stravaActivityId": "string | null",
  "notes":            "string | null",
  "isManual":         "boolean (default: false)"
}
```

**Response (201):** Created `RaceRecord`.

---

## GET /api/races/activities-near?date=YYYY-MM-DD

Find running activities within ±3 days of a date for activity linking.

**Auth:** Required

**Response (200):** Array of nearby activities.
```json
[
  { "stravaId": "12345", "name": "Tisdagsbana", "date": "2025-09-14", "distanceKm": 10.2, "movingTime": 2580 }
]
```

**Filtering:** Only `Run`, `TrailRun`, `VirtualRun` sport types. Max 10 results.

---

## PATCH /api/races/[id]

Update a race record (edit time, date, or event name).

**Auth:** Required

**Request (all optional):**
```json
{
  "time":      "number (seconds)",
  "date":      "YYYY-MM-DD",
  "eventName": "string | null",
  "notes":     "string | null"
}
```

**Response (200):** Updated `RaceRecord`.

---

## DELETE /api/races/[id]

Delete a race record.

**Auth:** Required. **Response (200):** `{ "ok": true }`.
