import "dotenv/config";
import { query, closeDatabaseConnection } from "./src/db.ts";

try {
  const result = await query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      current_setting('search_path') AS search_path,
      inet_server_addr()::text AS server_address,
      to_regclass('public.platform_analytics_events')::text
        AS platform_analytics_events,
      to_regclass('public.admin_action_logs')::text
        AS admin_action_logs,
      to_regclass('public.admin_analytics_baselines')::text
        AS admin_analytics_baselines
  `);

  console.log("StatusFly database diagnostic:");
  console.table(result.rows);
} catch (error) {
  console.error("Database diagnostic failed:", error);
  process.exitCode = 1;
} finally {
  await closeDatabaseConnection();
}