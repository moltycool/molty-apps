import "dotenv/config";
import { createServer } from "./app.js";

const start = async () => {
  const port = Number(process.env.PORT || 3000);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL is required to start the server.");
    process.exit(1);
  }

  const server = createServer({
    port,
    databaseUrl,
  });

  server.listen();
  // eslint-disable-next-line no-console
  console.log(`WakaWars server`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
