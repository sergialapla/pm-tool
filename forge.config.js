const { VitePlugin } = require('@electron-forge/plugin-vite')
const { AutoUnpackNativesPlugin } = require('@electron-forge/plugin-auto-unpack-natives')

module.exports = {
  packagerConfig: { asar: true },
  makers: [
    { name: '@electron-forge/maker-squirrel', config: { name: 'pm_tool' } },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] }
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' }
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.ts' }
      ]
    })
  ]
}
