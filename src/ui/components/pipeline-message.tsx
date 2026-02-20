import React from 'react';
import { Box, Text } from 'ink';
import figures from 'figures';
import { T } from '../theme.js';
import { cachedMarkdown } from '../format.js';
import type { PipeMsg } from '../../types.js';

export const PipelineMessage = React.memo(function PipelineMessage({ msg }: { msg: PipeMsg }) {
  switch (msg.kind) {
    case 'banner':
      return (
        <Box paddingLeft={2} marginTop={1}>
          <Text color={T.bright} bold>
            {msg.stage}
          </Text>
          <Text color={T.dim}> {msg.agent}</Text>
          {msg.detail && <Text color={T.muted}> {msg.detail}</Text>}
        </Box>
      );

    case 'stage_summary':
      return (
        <Box flexDirection="column" width="100%" paddingLeft={2}>
          <Box>
            <Text color={T.bright} bold>
              {msg.stage}
            </Text>
            {msg.attempt && <Text color={T.dim}> ({msg.attempt})</Text>}
          </Box>
          {msg.verdict && (
            <Box paddingLeft={2}>
              <Text color={msg.verdict === 'APPROVE' ? T.success : msg.verdict === 'REVISE' ? T.warning : T.muted} bold>
                {msg.verdict}
              </Text>
              <Text color={T.text}> {msg.detail ?? ''}</Text>
              {msg.elapsed && <Text color={T.dim}> ({msg.elapsed})</Text>}
            </Box>
          )}
          {!msg.verdict && msg.detail && (
            <Box paddingLeft={2}>
              <Text color={T.muted}>
                {msg.detail}
                {msg.elapsed ? ` (${msg.elapsed})` : ''}
              </Text>
            </Box>
          )}
        </Box>
      );

    case 'progress':
      return null;
    case 'ok':
      return (
        <Box paddingLeft={2}>
          <Text color={T.success}>
            {figures.tick} {msg.text}
          </Text>
        </Box>
      );
    case 'warn':
      return (
        <Box paddingLeft={2}>
          <Text color={T.warning}>
            {figures.warning} {msg.text}
          </Text>
        </Box>
      );
    case 'error':
      return (
        <Box paddingLeft={2}>
          <Text color={T.error}>
            {figures.cross} {msg.text}
          </Text>
        </Box>
      );
    case 'sep':
      return null;

    case 'text': {
      const rendered = cachedMarkdown(msg.text);
      return (
        <Box flexDirection="column" width="100%" marginTop={1}>
          <Box paddingLeft={4}>
            <Text>{rendered}</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text color={T.dim} dimColor>
              {msg.agent}
            </Text>
          </Box>
        </Box>
      );
    }

    case 'status':
      return (
        <Box paddingLeft={4}>
          <Text color={T.dim}>{msg.text}</Text>
        </Box>
      );

    case 'duration':
      return (
        <Box paddingLeft={2}>
          <Text color={T.dim}>{msg.session} </Text>
          <Text color={T.codex}>codex {msg.codex}</Text>
          <Text color={T.dim}> </Text>
          <Text color={T.claude}>claude {msg.claude}</Text>
        </Box>
      );
  }
});
