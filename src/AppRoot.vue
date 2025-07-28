<template>
    <GridLayout>
        <Frame>
            <Home />
        </Frame>
        <SplashScreen v-if="showSplash" />
    </GridLayout>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed } from 'nativescript-vue';
import Home from './components/Home.vue';
import SplashScreen from './components/SplashScreen.vue';
import { appStore } from './services/store';

const minTimeElapsed = ref(false);
const maxTimeElapsed = ref(false);

onMounted(() => {
    console.log('AppRoot.vue: onMounted');
    setTimeout(() => {
        console.log('AppRoot.vue: 500ms minimum timer elapsed.');
        minTimeElapsed.value = true;
    }, 500);

    setTimeout(() => {
        console.log('AppRoot.vue: 3-second maximum timer elapsed.');
        maxTimeElapsed.value = true;
    }, 3000);
});

const showSplash = computed(() => {
    // Force hide after 3 seconds
    if (maxTimeElapsed.value) {
        console.log(`AppRoot.vue: showSplash computed: maxTimeElapsed is true, hiding splash.`);
        return false;
    }

    // Otherwise, wait for both the minimum time and the initial load to complete
    const shouldShow = !minTimeElapsed.value || !appStore.isInitialLoadComplete.value;
    console.log(`AppRoot.vue: showSplash computed: minTimeElapsed=${minTimeElapsed.value}, isInitialLoadComplete=${appStore.isInitialLoadComplete.value}, showSplash=${shouldShow}`);
    return shouldShow;
});
</script>
