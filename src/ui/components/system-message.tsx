import React from 'react';
import { Box, Text } from 'ink';
import figures from 'figures';
import { T } from '../theme.js';

export const SystemMessage = React.memo(function SystemMessage({
  variant,
  text,
}: {
  variant: 'ok' | 'warn' | 'error';
  text: string;
}) {
  const icon = variant === 'ok' ? figures.tick : variant === 'warn' ? figures.warning : figures.cross;
  const color = variant === 'ok' ? T.success : variant === 'warn' ? T.warning : T.error;
  return (
    <Box paddingLeft={2}>
      <Text color={color}>
        {icon} {text}
      </Text>
    </Box>
  );
});
