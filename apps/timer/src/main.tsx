import { createRoot } from "react-dom/client";
import { App } from "./app";
import { createSession } from "./session";
import { createBrowserEnvironment } from "./browser";
import { initialModel } from "./model";
import "./style.css";

const environment = createBrowserEnvironment();
const session = createSession(initialModel(environment.pathname), environment);
const root = document.getElementById("root");
if (root == null) {
  throw new Error("Missing root element");
}
const reactRoot = createRoot(root);
reactRoot.render(<App session={session} />);

if (import.meta.hot != null) {
  import.meta.hot.dispose(() => {
    reactRoot.unmount();
    session.dispose();
  });
}
