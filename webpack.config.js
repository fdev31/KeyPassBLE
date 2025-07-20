const webpack = require("@nativescript/webpack");
const { VueLoaderPlugin } = require('vue-loader');

module.exports = (env) => {
	webpack.init(env);

	webpack.chainWebpack((config) => {
    config.plugin('VueLoaderPlugin').use(VueLoaderPlugin);

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