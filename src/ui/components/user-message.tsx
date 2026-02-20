import React from 'react';
import { Box, Text } from 'ink';
import figures from 'figures';
import { T } from '../theme.js';

export const UserMessage = React.memo(function UserMessage({ content }: { content: string }) {
  return (
    <Box width="100%" paddingLeft={2} marginTop={1}>
      <Text color={T.bright} bold>
        {figures.pointer}{' '}
      </Text>
      <Text color={T.bright}>{content}</Text>
    </Box>
  );
});
