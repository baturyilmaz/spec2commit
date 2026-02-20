import React from 'react';
import { Box, Text } from 'ink';
import { T } from '../theme.js';

export const StatusLine = React.memo(function StatusLine({
  project,
  codexId,
  autoApprove,
}: {
  project: string;
  codexId?: string | null;
  autoApprove?: boolean;
}) {
  const parts: string[] = [
    `spec2commit`,
    project,
    codexId ? codexId.slice(0, 8) : '',
    autoApprove ? 'auto' : 'review',
    '/help',
  ].filter(Boolean);

  return (
    <Box paddingLeft={2}>
      <Text color={T.dim}>{parts.join(' · ')}</Text>
    </Box>
  );
});
