import type { ArtifactPreviewTranslations } from '../../../i18n';
import {
  getMornDraftFlatLayoutDecision,
  type PreviewRenderDeliveryAccess,
} from '../deliveryAccess';
import type { FinalInsertCommand } from '../finalInsertMenuRegistry';

export type FinalInsertVisibleEntry = {
  command: FinalInsertCommand;
  parent?: FinalInsertCommand;
};

export const normalizeFinalInsertQuery = (query: string) => query.trim().toLocaleLowerCase();

export const hasFinalInsertChildren = (command: FinalInsertCommand) =>
  Boolean(command.children && command.children.length > 0);

export const hasFinalInsertTableGrid = (command: FinalInsertCommand) =>
  Boolean(command.tableGrid && !command.disabledReason);

export const hasFinalInsertSubmenu = (command: FinalInsertCommand) =>
  hasFinalInsertChildren(command) || hasFinalInsertTableGrid(command);

export const isFinalInsertExecutable = (command: FinalInsertCommand) =>
  Boolean(command.source && command.artifactKind && !command.disabledReason);

export const isFinalInsertActionable = (command: FinalInsertCommand) =>
  hasFinalInsertSubmenu(command) || isFinalInsertExecutable(command);

const getFinalInsertCommandSearchText = (
  command: FinalInsertCommand,
  parent?: FinalInsertCommand,
) => [
  parent?.id,
  parent?.label,
  command.id,
  command.label,
  command.category,
  ...(parent?.keywords ?? []),
  ...command.keywords,
].filter(Boolean).join(' ').toLocaleLowerCase();

const flattenFinalInsertLeaves = (
  commands: readonly FinalInsertCommand[],
  parent?: FinalInsertCommand,
): FinalInsertVisibleEntry[] =>
  commands.flatMap((command) => (
    command.children?.length
      ? flattenFinalInsertLeaves(command.children, command)
      : [{ command, parent }]
  ));

const getFinalInsertMornDraftComponentString = (
  command: FinalInsertCommand,
  key: 'layout' | 'variant',
) => {
  const component = command.mornDraftComponent;
  if (!component || typeof component !== 'object') return undefined;
  const value = component[key];
  return typeof value === 'string' ? value : undefined;
};

const applyFinalInsertAccessToCommand = (
  command: FinalInsertCommand,
  deliveryAccess: PreviewRenderDeliveryAccess | undefined,
  t: ArtifactPreviewTranslations,
  resolveLayoutDecision: typeof getMornDraftFlatLayoutDecision,
): FinalInsertCommand => {
  if (command.children?.length) {
    const children = command.children.map((child) =>
      applyFinalInsertAccessToCommand(child, deliveryAccess, t, resolveLayoutDecision),
    );
    return children.every((child, index) => child === command.children?.[index])
      ? command
      : { ...command, children };
  }
  if (command.category !== 'MornDraft' || !command.mornDraftComponent) return command;
  const layout = getFinalInsertMornDraftComponentString(command, 'layout');
  const variant = getFinalInsertMornDraftComponentString(command, 'variant');
  const decision = resolveLayoutDecision(deliveryAccess, t, layout, variant);
  if (decision.isAllowed) {
    return command.disabledReason ? { ...command, disabledReason: undefined } : command;
  }
  return command.disabledReason === decision.text
    ? command
    : { ...command, disabledReason: decision.text };
};

export const getAccessAwareFinalInsertCommands = (
  commands: readonly FinalInsertCommand[],
  deliveryAccess: PreviewRenderDeliveryAccess | undefined,
  t: ArtifactPreviewTranslations,
  resolveLayoutDecision: typeof getMornDraftFlatLayoutDecision = getMornDraftFlatLayoutDecision,
): readonly FinalInsertCommand[] => commands.map((command) =>
  applyFinalInsertAccessToCommand(command, deliveryAccess, t, resolveLayoutDecision),
);

export const filterFinalInsertCommands = (
  query: string,
  commands: readonly FinalInsertCommand[],
): FinalInsertVisibleEntry[] => {
  if (commands.length === 0) return [];
  const normalizedQuery = normalizeFinalInsertQuery(query);
  if (!normalizedQuery) return commands.map((command) => ({ command }));
  return flattenFinalInsertLeaves(commands).filter(({ command, parent }) =>
    getFinalInsertCommandSearchText(command, parent).includes(normalizedQuery) ||
    Boolean(parent && getFinalInsertCommandSearchText(parent).includes(normalizedQuery)),
  );
};

export const getFirstActionableFinalInsertEntryIndex = (entries: readonly FinalInsertVisibleEntry[]) =>
  entries.findIndex((entry) => isFinalInsertActionable(entry.command));
