import { createApp } from "./app.js";
const port = Number(process.env.PORT || 3000);
createApp().listen(port, "0.0.0.0", () => {
  console.log(`Care Buddy backend listening on http://0.0.0.0:${port}`);
});
