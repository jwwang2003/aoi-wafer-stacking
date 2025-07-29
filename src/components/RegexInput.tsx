import React, { useState } from 'react';
import { TextInput } from '@mantine/core';

interface RegexInputProps {
  label: string;
  defaultRegex: string;
  onValidChange?: (newPattern: string) => void;
}

export default function RegexInput({ label, defaultRegex, onValidChange }: RegexInputProps) {
  // This is the "committed" pattern we actually use
  const [pattern, setPattern] = useState(defaultRegex);
  // Error message if the user’s input fails to parse
  const [error, setError] = useState<string | null>(null);

  // Handle every attempted change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const candidate = e.currentTarget.value;
    setPattern(candidate); // Update pattern value
    setError(null); // Reset error on input change
  };

  // Compile the regex when the input loses focus
  const handleBlur = () => {
    try {
      new RegExp(pattern); // Try to compile the regex
      setError(null); // No error, valid regex
      onValidChange?.(pattern); // Pass valid pattern to the parent
    } catch (err) {
      setError('非法正则表达式'); // Invalid regex, show error
    }
  };

  return (
    <TextInput
      label={label}
      placeholder={defaultRegex}
      value={pattern}
      onChange={handleChange}
      error={error}
      onBlur={handleBlur} // Trigger regex compilation when input loses focus
    />
  );
}