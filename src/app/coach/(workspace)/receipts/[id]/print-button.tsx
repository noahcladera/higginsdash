"use client";

import { Button } from "@/components/ui/button";

export function PrintReceiptButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      Print / Save as PDF
    </Button>
  );
}
