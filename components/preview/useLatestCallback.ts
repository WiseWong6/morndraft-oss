import { useCallback, useRef } from 'react';

export const useLatestCallback = <Args extends unknown[], Result>(
  callback: ((...args: Args) => Result) | undefined,
) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback((...args: Args): Result | undefined => callbackRef.current?.(...args), []);
};
