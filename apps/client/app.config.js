// Complète app.json. Les versions de test peuvent viser un serveur local en HTTP
// (adresse IP de l'ordinateur sur le Wi-Fi) ; la version de production impose HTTPS.
module.exports = ({ config }) => {
  const production = process.env.APP_VARIANT === 'production';
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: !production } }],
    ],
    android: {
      ...config.android,
      // Numéro de version croissant à chaque compilation (mises à jour sans désinstaller).
      versionCode: Number(process.env.GITHUB_RUN_NUMBER ?? 1),
    },
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(production
          ? {}
          : {
              NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: true,
                NSAllowsLocalNetworking: true,
              },
            }),
      },
    },
  };
};
