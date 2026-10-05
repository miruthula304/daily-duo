# Daily Duo

A small two-person shared daily checklist with:

- One room URL
- No end-user account/login
- Shared live checkmarks through a server
- Recurring tasks (the same task list appears every calendar day)
- Calendar navigation
- Per-person completion
- Historical days stored in SQLite
- Mobile-friendly UI
- Add recurring tasks and rename the room/people

## Run locally

Requirements: Node.js 18+.

```bash
npm install
npm start
```

Open http://localhost:3000.

Create a room and copy its URL. A second device can use that URL while both devices are connected to the same running server.

## Put it online

This project needs a Node.js host with persistent disk because it stores the SQLite database.

Good choices are a small VPS or a hosting service that supports a persistent Node process and disk volume.

Important:
- Do NOT use an ephemeral serverless filesystem for `daily-duo.sqlite`.
- Put the app behind HTTPS in production.
- The generated room ID is the access credential. Anyone with the URL can edit that room.
- Back up `daily-duo.sqlite` if you care about the history.

### Environment

Optional:
- `PORT` — listening port (default 3000)
- `DB_FILE` — database file path (default `./daily-duo.sqlite`)

## What "daily" means

Tasks are recurring: the same task list is available for every calendar date. Checkmarks are stored separately by date and person, so October 5 and October 6 have independent progress.

## Next upgrades

If you later want stronger privacy, push notifications, invite codes, or automatic cloud backups, add authentication and a hosted database.
