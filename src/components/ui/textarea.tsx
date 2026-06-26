import * as React from "react";

import { cn } from "@/lib/utils";
import { formControlClasses } from "@/lib/ui/form-control";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        formControlClasses,
        "field-sizing-content min-h-20 py-2.5 resize-y",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
