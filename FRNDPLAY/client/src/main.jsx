import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./styles/queueFeatures.css";
import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";

posthog.init(
  import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN,
  {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  }
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <App />
    </PostHogProvider>
  </React.StrictMode>
);