<template>
    <SplashScreen v-if="showSplash" />
    <Frame v-else>
        <Home />
    </Frame>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'nativescript-vue';
import Home from './components/Home.vue';
import SplashScreen from './components/SplashScreen.vue';
import { eventBus } from './services/event-bus';

const showSplash = ref(true);

onMounted(() => {
    let timerElapsed = false;
    let loadComplete = false;

    function hideSplashScreenIfReady() {
        if (timerElapsed && loadComplete) {
            showSplash.value = false;
        }
    }

    setTimeout(() => {
        timerElapsed = true;
        hideSplashScreenIfReady();
    }, 2000);

    eventBus.on('initial-load-complete', () => {
        loadComplete = true;
        hideSplashScreenIfReady();
    });
});
</script>