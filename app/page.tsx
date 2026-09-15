import { Frame } from "@/components/frame";

/* The page is the frame and nothing else. The tower that stands in it -- the
   storeys, the sky bands, the world lanes, the rail -- is built after mount by
   lib/engine.ts, which owns the DOM under #stack the same way the IIFE in
   index.html does. React deliberately renders none of it. */
export default function Home() {
  return <Frame />;
}
