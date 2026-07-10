function packageParentPath(packagePath) {
  const segments = packagePath.split('/');
  const nodeModulesIndex = segments.lastIndexOf('node_modules');
  if (nodeModulesIndex < 0) return '';
  return segments.slice(0, nodeModulesIndex).join('/');
}

export function resolveLockedDependencyPath(packages, fromPackagePath, dependencyName) {
  let currentPackagePath = fromPackagePath;
  for (;;) {
    const candidate = currentPackagePath
      ? `${currentPackagePath}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    if (!currentPackagePath) return null;
    currentPackagePath = packageParentPath(currentPackagePath);
  }
}

function dependenciesForEntry(entry) {
  return [
    ...Object.keys(entry.dependencies ?? {}).map(name => ({ name, optional: false })),
    ...Object.keys(entry.optionalDependencies ?? {}).map(name => ({ name, optional: true })),
    ...Object.keys(entry.peerDependencies ?? {}).map(name => ({
      name,
      optional: entry.peerDependenciesMeta?.[name]?.optional === true,
    })),
  ];
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(key => [key, canonicalize(value[key])]),
  );
}

export function projectPublicPackageLock({ sourceLock, publicPackageJson }) {
  if (sourceLock?.lockfileVersion !== 3 || !sourceLock.packages?.['']) {
    throw new Error('OSS lock projection requires a package-lock v3 source with a root package');
  }
  const sourcePackages = sourceLock.packages;
  const includedPaths = new Set();
  const queue = [];
  const directDependencies = {
    ...(publicPackageJson.dependencies ?? {}),
    ...(publicPackageJson.devDependencies ?? {}),
  };

  for (const dependencyName of Object.keys(directDependencies).sort()) {
    const dependencyPath = resolveLockedDependencyPath(sourcePackages, '', dependencyName);
    if (!dependencyPath) {
      throw new Error(`Source lock is missing direct OSS dependency ${dependencyName}`);
    }
    queue.push(dependencyPath);
  }

  while (queue.length > 0) {
    const packagePath = queue.shift();
    if (includedPaths.has(packagePath)) continue;
    const entry = sourcePackages[packagePath];
    if (!entry) throw new Error(`Source lock is missing package entry ${packagePath}`);
    includedPaths.add(packagePath);

    for (const { name, optional } of dependenciesForEntry(entry)) {
      const dependencyPath = resolveLockedDependencyPath(sourcePackages, packagePath, name);
      if (!dependencyPath) {
        if (optional) continue;
        throw new Error(`Source lock cannot resolve ${name} required by ${packagePath}`);
      }
      queue.push(dependencyPath);
    }
  }

  const rootPackage = {
    name: publicPackageJson.name,
    version: publicPackageJson.version,
    license: publicPackageJson.license,
    dependencies: publicPackageJson.dependencies ?? {},
    devDependencies: publicPackageJson.devDependencies ?? {},
  };
  if (publicPackageJson.engines) rootPackage.engines = publicPackageJson.engines;

  const projectedPackages = { '': rootPackage };
  for (const packagePath of [...includedPaths].sort((left, right) => left.localeCompare(right))) {
    projectedPackages[packagePath] = sourcePackages[packagePath];
  }

  return canonicalize({
    name: publicPackageJson.name,
    version: publicPackageJson.version,
    lockfileVersion: 3,
    requires: true,
    packages: projectedPackages,
  });
}

export function serializePublicPackageLock(options) {
  return `${JSON.stringify(projectPublicPackageLock(options), null, 2)}\n`;
}
