import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [value, setValue] = React.useState("");
  const [status, setStatus] = React.useState("Loading…");

  React.useEffect(() => {
    fetch("/api/data/note")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json() as Promise<{ value?: string }>;
      })
      .then((data) => {
        setValue(data.value ?? "");
        setStatus("Saved to your Cloudflare account");
      })
      .catch(() => setStatus("Sign in with Google through Cloudflare Access to load your data."));
  }, []);

  async function save() {
    setStatus("Saving…");
    try {
      const response = await fetch("/api/data/note", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      setStatus("Saved");
    } catch {
      setStatus("Could not save. Check your sign-in and try again.");
    }
  }

  return (
    <main>
      <p className="eyebrow">INOREAD · STARTER APP</p>
      <h1>A small idea, ready to grow.</h1>
      <p className="intro">This is the starting point for your mobile web apps.</p>
      <label htmlFor="note">A note saved to your account</label>
      <textarea id="note" value={value} onChange={(event) => setValue(event.target.value)} />
      <button onClick={save}>Save note</button>
      <output className="status">{status}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
