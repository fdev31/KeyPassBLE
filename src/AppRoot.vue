<template>
    <GridLayout>
        <Frame>
            <Home />
        </Frame>
        <SplashScreen v-if="showSplash" />
    </GridLayout>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed, watchEffect } from 'nativescript-vue';
import Home from './components/Home.vue';
import SplashScreen from './components/SplashScreen.vue';
import { appStore } from './services/store';

const timerElapsed = ref(false);

onMounted(() => {
    console.log('AppRoot.vue: onMounted');
    setTimeout(() => {
        console.log('AppRoot.vue: 2-second timer elapsed.');
        timerElapsed.value = true;
    }, 2000);
});

const showSplash = computed(() => {
    const shouldShow = !timerElapsed.value || !appStore.isInitialLoadComplete.value;
    console.log(`AppRoot.vue: showSplash computed: timerElapsed=${timerElapsed.value}, isInitialLoadComplete=${appStore.isInitialLoadComplete.value}, showSplash=${shouldShow}`);
    return shouldShow;
});
</script>
