// Entry point of the voxel version: the same page and the same behavior as the first one (src/app.js),
// with its own styles and scenes.
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "./styles.css";
import { boot } from "../../src/app.js";

boot(() => Promise.all([import("./stage.js"), import("./stations/index.js")]));
