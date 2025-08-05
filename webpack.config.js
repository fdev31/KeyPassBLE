const webpack = require("@nativescript/webpack");
const { VueLoaderPlugin } = require('vue-loader');

module.exports = (env) => {
	webpack.init(env);

	// Define __DEV__ based on the build environment
	const isDevelopment = !env.production;

	webpack.chainWebpack((config) => {
    config.plugin('VueLoaderPlugin').use(VueLoaderPlugin);

		// Define global constants
		config.plugin("DefinePlugin").tap((args) => {
			args[0]["__DEV__"] = isDevelopment;
			return args;
		});

		// Configure terser to remove console.log in production
		if (!isDevelopment) {
			config.optimization.minimizer('TerserPlugin').tap(args => {
				args[0].terserOptions.compress.drop_console = true;
				return args;
			});
		}

    config.resolve.fallback = {
      ...config.resolve.fallback,
      "url": require.resolve("url/"),
      "util": require.resolve("util/")
    };

    config.module
      .rule('vue')
      .test(/\.vue$/)
      .use('vue-loader')
      .loader('vue-loader')
      .tap((options) => {
        options.compilerOptions = {
          ...options.compilerOptions,
          isCustomElement: (tag) => tag === 'v-template' || tag.startsWith('PullToRefresh'),
        };
        return options;
      });
  });

	// Learn how to customize:
	// https://docs.nativescript.org/webpack

	return webpack.resolveConfig();
};