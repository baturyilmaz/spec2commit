import React from 'react';
import { Box, Text } from 'ink';
import figures from 'figures';
import { T } from '../theme.js';
import { verbFor } from '../tool-verbs.js';

export const ToolResult = React.memo(function ToolResult({
  tools,
}: {
  tools: Array<{ tool: string; detail?: string }>;
}) {
  if (!tools.length) return null;

  if (tools.length <= 4) {
    return (
      <Box flexDirection="column">
        {tools.map((t, i) => {
          const label = t.detail ? `${verbFor(t.tool, true)} ${t.detail}` : verbFor(t.tool, true);
          return (
            <Box key={i} paddingLeft={4}>
              <Text color={T.dim}>{label}</Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box paddingLeft={4}>
      <Text color={T.dim}>
        {figures.arrowRight} {tools.length} tool calls
      </Text>
    </Box>
  );
});
