export type PrivateRuntimeGatewayName =
  | 'aiInstruction'
  | 'analytics'
  | 'editorImport'
  | 'previewAiSelection';

type PrivateRuntimeGatewayLoader = () => Promise<Record<string, any>>;

const gatewayLoaders: Partial<Record<PrivateRuntimeGatewayName, PrivateRuntimeGatewayLoader>> = {};

export const installPrivateRuntimeGateway = (
  name: PrivateRuntimeGatewayName,
  loader: PrivateRuntimeGatewayLoader,
) => {
  gatewayLoaders[name] = loader;
};

export const getPrivateRuntimeGateway = (name: PrivateRuntimeGatewayName) =>
  gatewayLoaders[name] ?? null;
