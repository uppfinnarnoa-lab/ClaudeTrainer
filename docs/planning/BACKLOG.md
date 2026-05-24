# TrainingLab — Backlog

Living document for bugs and feature requests. Add new items at the top of each section.
Format: `- [ ] Description — *context / repro steps if bug*`

---

## Features

- [ ] **Activity History — klickbara aktiviteter**: Gör varje aktivitetsrad/-kort i `history-client.tsx` klickbar så att man navigerar till `/activities/[id]`. Sidan `/activities/[id]` finns redan — det saknas bara en länk från historyvyn. Lägg till `href={/activities/${a.id}}` (eller `<Link>`) på aktivitetskortet/raden. Lägg ev. till extern Strava-länk (`https://www.strava.com/activities/${a.stravaId}`) bredvid.

---

## Bugs

*(inga kända buggar just nu)*

---

*Uppdaterad: 2026-05-24*
