import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { T } from '../theme.js';
import { fmtMs } from '../format.js';

const STAGES = ['SPEC', 'PLAN', 'REVIEW', 'IMPL', 'REVIEW', 'COMMIT'] as const;
const STAGE_IDX: Record<string, number> = {
  IDLE: -1,
  SPEC: 0,
  PLAN: 1,
  PLAN_REVIEW: 2,
  IMPLEMENT: 3,
  IMPL_REVIEW: 4,
  COMMIT: 5,
  DONE: 6,
  PAUSED: -1,
};

export const StageProgress = React.memo(function StageProgress({
  stage,
  startedAt,
}: {
  stage?: string;
  startedAt?: number | null;
}) {
  const idx = stage ? (STAGE_IDX[stage] ?? -1) : -1;
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt || idx < 0) {
      setElapsed('');
      return;
    }
    const tick = () => setElapsed(fmtMs(Date.now() - startedAt));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt, idx]);

  if (idx < 0 && stage !== 'DONE') return null;

  return (
    <Box paddingLeft={2}>
      {STAGES.map((label, j) => {
        const done = j < idx || stage === 'DONE';
        const cur = j === idx;
        const clr = done ? T.success : cur ? T.bright : T.dim;
        return (
          <React.Fragment key={`${label}-${j}`}>
            <Text color={clr} bold={cur}>
              {label}
            </Text>
            {j < STAGES.length - 1 && <Text color={T.separator}>{' > '}</Text>}
          </React.Fragment>
        );
      })}
      {elapsed && (
        <Text color={T.dim}>
          {'  '}
          {elapsed}
        </Text>
      )}
    </Box>
  );
});
