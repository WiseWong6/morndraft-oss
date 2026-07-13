export const PUBLIC_MERMAID_RENDER_DEBOUNCE_MS = 250;
export const PUBLIC_MERMAID_MAX_SOURCE_LENGTH = 50_000;

let serialRenderTail: Promise<void> = Promise.resolve();

const runSerially = (task: () => Promise<void>) => {
  const result = serialRenderTail.then(task, task);
  serialRenderTail = result.catch(() => undefined);
  return result;
};

export const assertPublicMermaidSourceBudget = (source: string) => {
  if (source.length > PUBLIC_MERMAID_MAX_SOURCE_LENGTH) {
    throw new Error(`Mermaid source exceeds the ${PUBLIC_MERMAID_MAX_SOURCE_LENGTH}-character limit.`);
  }
};

export const createLatestOnlyPublicMermaidRenderer = <Input, Output>({
  debounceMs = PUBLIC_MERMAID_RENDER_DEBOUNCE_MS,
  render,
  onResult,
  onError,
}: {
  debounceMs?: number;
  render: (input: Input) => Promise<Output>;
  onResult: (output: Output) => void;
  onError: (error: unknown) => void;
}) => {
  let disposed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (input: Input) => {
    if (disposed) return;
    generation += 1;
    const scheduledGeneration = generation;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void runSerially(async () => {
        if (disposed || scheduledGeneration !== generation) return;
        try {
          const output = await render(input);
          if (!disposed && scheduledGeneration === generation) onResult(output);
        } catch (error) {
          if (!disposed && scheduledGeneration === generation) onError(error);
        }
      });
    }, Math.max(0, debounceMs));
  };

  const dispose = () => {
    disposed = true;
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  return { dispose, schedule };
};
