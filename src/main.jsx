import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

function showBootError(errorLike) {
  const err = errorLike instanceof Error ? errorLike : new Error(String(errorLike));
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="padding:16px;font-family:monospace;background:#110909;color:#ffb4b4;min-height:100vh;white-space:pre-wrap;line-height:1.5;">
Runtime error while loading Legal Dataset Validator\n\n${err.message}\n\n${err.stack || "(no stack trace)"}
    </div>
  `;
}

window.addEventListener("error", event => {
  if (event?.error) showBootError(event.error);
});

window.addEventListener("unhandledrejection", event => {
  showBootError(event?.reason || "Unhandled promise rejection");
});

try {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  showBootError(err);
}
