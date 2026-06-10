import React from "react";
import { createRoot } from "react-dom/client";
import { VoiceCall } from "./pages/VoiceCall";

const root = createRoot(document.getElementById("root")!);
root.render(<VoiceCall />);
