"use client";
import { T } from "@/lib/i18n/provider";

import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>
        <T>{"We couldn’t open this screen."}</T>
      </h1>
      <p>
        <T>{"Please try again. If the problem continues, restart the app."}</T>
      </p>
      <Button onClick={reset}>
        <T>{"Try again"}</T>
      </Button>
    </main>
  );
}
