import process from "node:process";
import { PostgresCrmApiService } from "./repository.js";
import { createCrmServer } from "./server.js";

const host = process.env.CRM_API_HOST ?? process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.CRM_API_PORT ?? process.env.PORT ?? 5185);

const server = createCrmServer(new PostgresCrmApiService());

server.listen(port, host, () => {
  console.log(`crm-api listening on http://${host}:${port}`);
});
