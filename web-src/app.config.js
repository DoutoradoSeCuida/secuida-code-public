module.exports = {
  expo: {
    name: 'SeCuida Code Público',
    slug: 'secuida-code-public',
    version: '1.0.0',
    icon: './assets/icon.png',
    platforms: ['web'],
    web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
    plugins: ['expo-router', 'expo-font'],
  },
};
