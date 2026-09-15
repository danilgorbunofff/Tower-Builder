"use client";

import { useEffect } from "react";
import { startEngine, type EngineOptions } from "@/lib/engine";

/* The one line of React between the page and the tower.

   Frame is server-rendered and the engine only starts once it is on screen, so
   this renders nothing and does its work in an effect. Everything after that --
   the storeys, the sky bands, the world lanes, the rail, the render loop, the
   handlers on #order -- belongs to lib/engine.ts. React never re-renders any of
   it, which is the point: see the header of that file.

   Starting twice is harmless. The engine stamps #stage and refuses a second
   boot, which is what keeps React's development-only StrictMode mount/unmount/
   mount from building two towers and charging twice per tap. */
export function Engine({ onPurchase }: EngineOptions = {}) {
  useEffect(() => {
    startEngine({ onPurchase });
    /* boot once and keep the handler it was given: the engine owns the document
       from here on, and an onPurchase whose identity changed would want to be a
       fresh boot, not a second listener on the same buttons */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
