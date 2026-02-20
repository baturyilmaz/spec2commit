import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { T } from '../theme.js';
import { cachedMarkdown } from '../format.js';

export const AgentMessage = React.memo(function AgentMessage({
  agent,
  content,
}: {
  agent: 'codex' | 'claude';
  content: string;
}) {
  const rendered = useMemo(() => cachedMarkdown(content), [content]);
  return (
    <Box flexDirection="column" width="100%" marginTop={1}>
      <Box paddingLeft={4}>
        <Text>{rendered}</Text>
      </Box>
      <Box paddingLeft={4}>
        <Text color={T.dim} dimColor>
          {agent}
        </Text>
      </Box>
    </Box>
  );
});
