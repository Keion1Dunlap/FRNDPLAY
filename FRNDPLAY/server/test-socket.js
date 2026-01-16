import "dotenv/config";
import { io } from "socket.io-client";

// Usage:
//   PowerShell:
//     $env:ACCESS_TOKEN="<token>"; node test-socket.js
//   CMD:
//     set ACCESS_TOKEN=<token> && node test-socket.js
const token = process.env.ACCESS_TOKEN;
if (!token) {
  console.error("Missing ACCESS_TOKEN env var");
  process.exit(1);
}

const socket = io("http://localhost:4000", {
  auth: { accessToken: token },
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("✅ Connected! Socket ID:", socket.id);

  // If your server listens for "ROOM_CREATE", this will test it:
  socket.emit("ROOM_CREATE", { name: "Test Room" }, (res) => {
    console.log("ROOM_CREATE response:", res);
    socket.disconnect();
  });
});

socket.on("connect_error", (err) => {
  console.log("❌ connect_error:", err.message);
});
