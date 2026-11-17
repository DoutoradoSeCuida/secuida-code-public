module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [function ({ template }) {
      return {
        visitor: {
          FunctionDeclaration(path, state) {
            const filename = state.filename?.replaceAll('\\', '/') || '';
            if (!filename.endsWith('/expo-router/build/fork/getStateFromPath.js') ||
                path.node.id?.name !== 'getStateFromPath' || path.node.params[0]?.name !== 'path') return;
            path.get('body').unshiftContainer('body',
              template.statement.ast('path = globalThis.SC_CODE_PUBLIC_ROUTER?.read(path) ?? path;'));
          },
        },
      };
    }],
  };
};
