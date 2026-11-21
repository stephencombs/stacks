module.exports = {
  hooks: {
    // WARNING: vite-plus-core's typescript peer excludes @tsc-rs/typescript, so without this hook pnpm installs a second vite-plus and tests load two copies of vitest.
    readPackage(pkg) {
      if (pkg.name === "@voidzero-dev/vite-plus-core" && pkg.peerDependencies?.typescript) {
        pkg.peerDependencies.typescript = "*";
      }

      return pkg;
    },
  },
};
