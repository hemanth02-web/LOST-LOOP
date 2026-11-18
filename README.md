# LostLoop – Campus Lost & Found Portal

Group 9, BCA Section A, RV University Mysuru (CS1385 Web & UX Design).

Team: Aromal P (2RUA26BCA0026), C D Sarthak Belliappa (2RUA26BCA0032), Mary Sherin T G (2RUA26BCA0061), Hemanth Suresh (2RUA26BCA0005). Faculty: Ms. Chaitra M.

Pitch deck (web presentation): open `public/presentation/index.html`, or /presentation/ on the running site.
UI design: Figma file https://www.figma.com/design/UMs9bjTE4GUmgIDrXDdxZp (page "v2 – Final UI": light/dark colour tokens, Inter text styles, shadows, reusable components and screens; page "v1 – First draft": early screens). The CSS in `public/css/styles.css` uses the same tokens and component sizes. Extra Figma screens can be generated with the plugin in `LostLoop_Figma_Plugin`.

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
