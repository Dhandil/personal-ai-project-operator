import { RegistryDatabase, defaultDatabasePath } from "./registry-database.js";

const database = new RegistryDatabase(defaultDatabasePath());
const migrated = database.migrate();
if (!migrated.ok) {
  console.error(migrated.error.message, ...migrated.error.details);
  database.close();
  process.exitCode = 1;
} else {
  console.log(`SQLite migration complete: ${database.databasePath()}`);
  database.close();
}
