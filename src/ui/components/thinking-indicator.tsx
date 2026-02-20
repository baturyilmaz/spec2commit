import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { T } from '../theme.js';

const SHIMMER_COLORS = ['#333', '#444', '#666', '#999', '#ccc', '#fff', '#ccc', '#999', '#666', '#444', '#333'];

export const ThinkingIndicator = React.memo(function ThinkingIndicator({
  startedAt,
  agent,
}: {
  startedAt?: number;
  agent?: 'codex' | 'claude';
}) {
  const [offset, setOffset] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setOffset((o) => o + 1), 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const label = agent ? ` ${agent}...` : ' Thinking...';
  const suffix = elapsed > 0 ? ` ${elapsed}s` : '';

  return (
    <Box paddingLeft={2}>
      <Text>
        {label.split('').map((ch, i) => (
          <Text key={i} color={SHIMMER_COLORS[(i + offset) % SHIMMER_COLORS.length]}>
            {ch}
          </Text>
        ))}
      </Text>
      {suffix && <Text color={T.dim}>{suffix}</Text>}
    </Box>
  );
});
