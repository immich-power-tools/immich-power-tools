import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.APP_DB_PATH
      ? `file:${process.env.APP_DB_PATH}`
      : "file:./data/app.db",
  },
});
