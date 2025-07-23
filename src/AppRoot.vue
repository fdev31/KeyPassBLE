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

const showSplash = ref(true);

onMounted(() => {
    // The splash screen will be visible for a minimum of 1 second.
    setTimeout(() => {
        showSplash.value = false;
    }, 1000);
});
</script>

