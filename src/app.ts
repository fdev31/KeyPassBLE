import { createApp } from 'nativescript-vue';
import AppRoot from './AppRoot.vue';
import { Trace } from '@nativescript/core';


if (__DEV__) {
    // Enable specific trace categories for debugging
    Trace.addCategories(Trace.categories.Navigation);
    Trace.addCategories(Trace.categories.ViewHierarchy);
    Trace.enable();
}
const app = createApp(AppRoot);

app.start();
