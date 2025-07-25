import { createApp } from 'nativescript-vue';
import AppRoot from './AppRoot.vue';
import { Trace } from '@nativescript/core';
import {DEVMODE} from './services/settings';

if (DEVMODE) {
    // Enable specific trace categories for debugging
    Trace.addCategories(Trace.categories.Error);
    Trace.addCategories('ns-android-bt'); // Category for the BLE plugin
    Trace.addCategories(Trace.categories.Debug);
    Trace.enable();

    console.log('Trace module enabled for debugging.');
}
const app = createApp(AppRoot);

app.start();