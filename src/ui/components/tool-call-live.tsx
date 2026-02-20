import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import cliSpinners from 'cli-spinners';
import { T } from '../theme.js';
import { verbFor } from '../tool-verbs.js';

export const ToolCallLive = React.memo(function ToolCallLive({ tool, detail }: { tool: string; detail?: string }) {
  const frames = cliSpinners.dots.frames;
  const [f, setF] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setF((i) => (i + 1) % frames.length), cliSpinners.dots.interval);
    return () => clearInterval(t);
  }, [frames]);

  const label = detail ? `${verbFor(tool, false)} ${detail}...` : `${verbFor(tool, false)}...`;
  return (
    <Box paddingLeft={4}>
      <Text color={T.dim}>
        {frames[f]} {label}
      </Text>
    </Box>
  );
});
