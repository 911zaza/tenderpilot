import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./env.js";
import { routesAvis } from "./routes/avis.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart);
await app.register(routesAvis);

app.get("/health", async () => ({ ok: true }));

app.listen({ port: env.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`TenderPilot API sur ${address}`);
});
