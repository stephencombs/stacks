module.exports = {
  hooks: {
    // vite-plus-core's typescript peer range excludes @tsc-rs/typescript (0.8.x). Without this,
    // pnpm can resolve a second vite-plus instance and tests load two copies of vitest.
    readPackage(pkg) {
      if (pkg.name === "@voidzero-dev/vite-plus-core" && pkg.peerDependencies?.typescript) {
        pkg.peerDependencies.typescript = "*";
      }
      return pkg;
    },
  },
};
