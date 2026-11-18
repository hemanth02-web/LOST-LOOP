'use strict';
const { createApp } = require('./app');
const { seedIfEmpty } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const app = createApp();
const seeded = seedIfEmpty(app.locals.db);
app.listen(PORT, () => {
  console.log('\n  LostLoop is running  ->  http://localhost:' + PORT);
  if (seeded) {
    console.log('  Sample data loaded. Demo logins (password: Demo@1234):');
    console.log('    student@rvu.edu.in   faculty@rvu.edu.in   staff@rvu.edu.in');
    console.log('  Admin login: admin@rvu.edu.in  /  Admin@1234');
  }
  console.log('  Press Ctrl+C to stop.\n');
});
