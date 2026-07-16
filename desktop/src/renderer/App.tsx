import React from "react";
import Desktop, { CaptureWindow } from "./Desktop";

export default function App() {
  if (window.location.hash === "#capture") {
    return <CaptureWindow />;
  }
  return <Desktop />;
}
