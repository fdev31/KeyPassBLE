import { createApp } from 'nativescript-vue';
import Home from './components/Home.vue';
import { Trace } from '@nativescript/core';

// Enable specific trace categories for debugging
Trace.addCategories(Trace.categories.Error);
Trace.addCategories('ns-android-bt'); // Category for the BLE plugin
Trace.addCategories(Trace.categories.Debug);
Trace.enable();

console.log('Trace module enabled for debugging.');

const app = createApp(Home);

app.start();
