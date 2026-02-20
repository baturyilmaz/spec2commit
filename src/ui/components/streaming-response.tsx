import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { T } from '../theme.js';
import { MAX_STREAM_LINES } from '../../config.js';

export const StreamingResponse = React.memo(function StreamingResponse({ text }: { text: string }) {
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setCursor((c) => !c), 530);
    return () => clearInterval(t);
  }, []);

  const lines = useMemo(() => text.split('\n').filter(Boolean).slice(-MAX_STREAM_LINES), [text]);

  return (
    <Box flexDirection="column" width="100%" paddingLeft={4}>
      <Text color={T.text}>
        {lines.join('\n')}
        {cursor ? '█' : ' '}
      </Text>
    </Box>
  );
});
