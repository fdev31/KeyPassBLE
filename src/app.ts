import { createApp } from 'nativescript-vue';
import AppRoot from './AppRoot.vue';
import Home from './components/Home.vue';
import Settings from './components/Settings.vue';
import TestPage from './components/TestPage.vue';
import { Trace } from '@nativescript/core';

// Enable specific trace categories for debugging
Trace.addCategories(Trace.categories.Error);
Trace.addCategories('ns-android-bt'); // Category for the BLE plugin
Trace.addCategories(Trace.categories.Debug);
Trace.enable();

console.log('Trace module enabled for debugging.');

const app = createApp(AppRoot);

app.start();
