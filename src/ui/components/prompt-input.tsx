import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import figures from 'figures';
import { T } from '../theme.js';
import { INPUT_HISTORY_SIZE } from '../../config.js';

const COMMANDS = [
  '/go',
  '/init',
  '/pause',
  '/cancel',
  '/resume',
  '/accept',
  '/spec',
  '/plan',
  '/session',
  '/status',
  '/reset',
  '/clear',
  '/help',
  '/quit',
];

interface PromptInputProps {
  onSubmit: (value: string) => void;
  isActive?: boolean;
}

export const PromptInput = React.memo(function PromptInput({ onSubmit, isActive = true }: PromptInputProps) {
  const [value, setValue] = useState('');
  const [histIdx, setHistIdx] = useState(-1);
  const historyRef = useRef<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const submit = useCallback(() => {
    const v = value.trim();
    if (!v) return;
    historyRef.current = [v, ...historyRef.current.filter((h) => h !== v)].slice(0, INPUT_HISTORY_SIZE);
    onSubmit(v);
    setValue('');
    setHistIdx(-1);
    setSuggestions([]);
  }, [value, onSubmit]);

  useInput(
    (input, key) => {
      if (!isActive) return;
      if (key.return) {
        submit();
        return;
      }
      if (key.upArrow) {
        const hist = historyRef.current;
        if (!hist.length) return;
        const next = Math.min(histIdx + 1, hist.length - 1);
        setHistIdx(next);
        setValue(hist[next]!);
        return;
      }
      if (key.downArrow) {
        if (histIdx <= 0) {
          setHistIdx(-1);
          setValue('');
          return;
        }
        const next = histIdx - 1;
        setHistIdx(next);
        setValue(historyRef.current[next]!);
        return;
      }
      if (key.backspace || key.delete) {
        setValue((v) => v.slice(0, -1));
        setHistIdx(-1);
        return;
      }
      if (key.tab && value.startsWith('/')) {
        if (suggestions.length === 1) {
          setValue(suggestions[0]! + ' ');
          setSuggestions([]);
        }
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        const next = value + input;
        setValue(next);
        setHistIdx(-1);
        setSuggestions(next.startsWith('/') ? COMMANDS.filter((c) => c.startsWith(next) && c !== next) : []);
      }
    },
    { isActive },
  );

  if (!isActive) {
    return (
      <Box paddingLeft={2}>
        <Text color={T.dim}>{figures.pointer} working...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {suggestions.length > 0 && (
        <Box paddingLeft={4}>
          <Text color={T.dim}>{suggestions.join('  ')}</Text>
        </Box>
      )}
      <Box paddingLeft={2}>
        <Text color={T.prompt} bold>
          {figures.pointer}{' '}
        </Text>
        <Text color={T.bright}>{value}</Text>
        <Text color={T.muted}>{'█'}</Text>
      </Box>
    </Box>
  );
});
