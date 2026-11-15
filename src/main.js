// Entry point: the HTML already holds the whole resume; this adds the 3D journey on top when WebGL exists.
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "./styles.css";
import { boot } from "./app.js";

boot(() => Promise.all([import("./stage.js"), import("./stations/index.js")]));
