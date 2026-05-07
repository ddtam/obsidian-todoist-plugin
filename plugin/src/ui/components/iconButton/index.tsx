import classNames from "classnames";
import type React from "react";
import { useRef } from "react";
import { Button } from "react-aria-components";

import { ObsidianIcon } from "@/ui/components/obsidian-icon";
import { useObsidianTooltip } from "@/ui/hooks";

type Props = {
  iconId: string;
  action: () => Promise<void> | void;
  className?: string;
  tooltip?: string;
  size?: React.ComponentProps<typeof ObsidianIcon>["size"];
};

export const IconButton: React.FC<Props> = ({ iconId, action, className, tooltip, size = "s" }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handler = async () => {
    const result = action();
    if (result instanceof Promise) {
      await result;
    }
  };

  useObsidianTooltip(buttonRef.current, tooltip ?? "");

  return (
    <Button className={classNames(className)} onPress={handler} ref={buttonRef}>
      <ObsidianIcon id={iconId} size={size} />
    </Button>
  );
};
