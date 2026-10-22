import React from "react";
import * as stylex from "@stylexjs/stylex";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [value, setValue] = React.useState("");
  const [status, setStatus] = React.useState("Loading…");

  React.useEffect(() => {
    fetch("/api/data/note")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        return response.json();
      })
      .then((data) => {
        if (
          data == null ||
          typeof data !== "object" ||
          !("value" in data) ||
          (data.value !== null && typeof data.value !== "string")
        ) {
          setStatus("Could not load: unexpected response format.");
          return;
        }
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
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      setStatus("Saved");
    } catch {
      setStatus("Could not save. Check your sign-in and try again.");
    }
  }

  return (
    <main {...stylex.props(styles.main)}>
      <p {...stylex.props(styles.eyebrow)}>INOREAD · STARTER APP</p>
      <h1 {...stylex.props(styles.heading)}>A small idea, ready to grow.</h1>
      <p {...stylex.props(styles.intro)}>This is the starting point for your mobile web apps.</p>
      <label {...stylex.props(styles.label)} htmlFor="note">
        A note saved to your account
      </label>
      <textarea
        {...stylex.props(styles.textarea)}
        id="note"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        {...stylex.props(styles.button)}
        onClick={() => {
          void save().catch((error: unknown) => console.error(error));
        }}
      >
        Save note
      </button>
      <output {...stylex.props(styles.status)}>{status}</output>
    </main>
  );
}

const styles = stylex.create({
  main: {
    width: "min(100% - 32px, 560px)",
    margin: "12vh auto 0",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "#687064",
  },
  heading: {
    margin: "32px 0 12px",
    fontSize: "clamp(2.3rem, 9vw, 4rem)",
    lineHeight: 1.02,
    letterSpacing: "-0.055em",
  },
  intro: {
    color: "#62685f",
    marginBottom: 40,
  },
  label: {
    display: "block",
    fontWeight: 600,
    marginBottom: 10,
  },
  textarea: {
    display: "block",
    width: "100%",
    minHeight: 160,
    padding: 14,
    border: "1px solid #d5d8d0",
    borderRadius: 12,
    backgroundColor: "white",
    color: "inherit",
    font: "inherit",
    resize: "vertical",
  },
  button: {
    marginTop: 14,
    borderWidth: 0,
    borderRadius: 10,
    padding: "12px 18px",
    backgroundColor: "#283b2b",
    color: "white",
    font: "inherit",
    fontWeight: 600,
    transform: { default: null, ":active": "translateY(1px)" },
  },
  status: {
    minHeight: "1.5em",
    color: "#62685f",
    fontSize: "0.9rem",
  },
});

const root = document.getElementById("root");
if (root == null) {
  throw new Error("Missing root element");
}
createRoot(root).render(<App />);
