import React from 'react';
import { Box, Text } from 'ink';
import { T } from '../theme.js';
import type { ModelConfig } from '../../types.js';

export const StatusLine = React.memo(function StatusLine({
  project,
  codexId,
  autoApprove,
  models,
}: {
  project: string;
  codexId?: string | null;
  autoApprove?: boolean;
  models?: ModelConfig;
}) {
  const modelInfo = models ? `${models.planner}→${models.reviewer}` : '';
  const parts: string[] = [
    `spec2commit`,
    project,
    modelInfo,
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
