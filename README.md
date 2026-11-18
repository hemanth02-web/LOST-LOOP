# LostLoop – Campus Lost & Found Portal

Group 9, BCA Section A, RV University Mysuru (CS1385 Web & UX Design).
Full-stack web app: Node.js + Express REST API, SQLite database, bcrypt + JWT cookie login, photo upload, server-side matching.

## Run it
1. Install Node.js LTS (https://nodejs.org).
2. Double-click `start.bat` (or run `npm install` then `npm start`).
3. Open http://localhost:3000

The database (`data/lostloop.db`) and photos (`data/uploads/`) are created on first run with demo data.

## Demo logins
| Account | Password |
|---|---|
| student@rvu.edu.in, faculty@rvu.edu.in, staff@rvu.edu.in | Demo@1234 |
| admin@rvu.edu.in (administrator) | Admin@1234 |

## Commands
- `npm start` start the server (PORT env var changes the port)
- `npm run seed` reset the database to the demo data
- `npm test` run the 16 API tests

## Structure
- `server/` Express app, routes (`auth`, `items`, `misc`), SQLite schema, seed data, tests
- `public/` front end (HTML, CSS, JavaScript) served by the same server

Optional environment variables: `JWT_SECRET`, `COOKIE_SECURE=1` (when using HTTPS), `ALLOWED_EMAIL_DOMAIN`.
