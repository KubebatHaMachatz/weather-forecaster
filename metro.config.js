const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// The pure-logic layer (src/api, src/geo, src/puzzle, src/scoring,
// src/calibration) uses TypeScript's "bundler" moduleResolution convention:
// relative imports end in `.js` but point at `.ts` source files. tsc, tsx,
// and Vitest all understand this; Metro's default resolver takes an explicit
// extension literally and fails. Rather than rewrite that established,
// already-tested convention across the whole pure-logic layer, teach Metro
// to try the `.ts`/`.tsx` sibling first for relative `.js` imports, falling
// back to its normal resolution for everything else (node_modules, actual
// `.js` files).
const { resolveRequest: defaultResolveRequest } = config.resolver;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js') && (moduleName.startsWith('./') || moduleName.startsWith('../'))) {
    for (const ext of ['.ts', '.tsx']) {
      try {
        return (defaultResolveRequest ?? context.resolveRequest)(
          context,
          moduleName.replace(/\.js$/, ext),
          platform,
        );
      } catch {
        // fall through to try the next extension, then the default resolver
      }
    }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativewind(config, { inlineRem: 16 });
