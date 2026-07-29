import { createApp } from "./app.js";

const port = Number.parseInt(process.env.RELAY_PORT ?? "4318", 10);
const host = "127.0.0.1";

createApp().listen(port, host, () => {
  console.log(`Hy3 Relay running at http://${host}:${port}`);
});
