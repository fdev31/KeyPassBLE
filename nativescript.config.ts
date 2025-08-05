import { NativeScriptConfig } from '@nativescript/core';

export default {
  id: 'site.fdev31.keypass',
  appPath: 'src',
  appResourcesPath: 'App_Resources',
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none'
  }
} as NativeScriptConfig;