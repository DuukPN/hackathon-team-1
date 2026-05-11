import { Hono } from "hono";

export const app = new Hono();

app.get("/api/hello", (c) => {
  console.log("Hello route hit");
  return c.json({ message: "Hello from hackathon-team-1!" });
});
