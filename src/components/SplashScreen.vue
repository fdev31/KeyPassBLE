<template>
    <GridLayout class="splash-container">
        <Label class="splash-label">
            <FormattedString>
                <Span v-for="(char, index) in textChars" :key="index" :text="char" :style="{ color: charColors[index] }" />
            </FormattedString>
        </Label>
    </GridLayout>
</template>

<script lang="ts" setup>
import { localize as L } from '@nativescript/localize';
import { ref, onMounted, onUnmounted } from 'vue';

const text = L('keypass');
const textChars = text.split('');
const charColors = ref(Array(text.length).fill('#F5F5F5'));

const baseColor = '#F5F5F5';
const peakColor = '#FFFFFF';
const midColor = '#DDDDDD';

let animationInterval: any = null;
let shinePosition = -2; // Start off-screen to the left

const animateShine = () => {
    const newColors = Array(text.length).fill(baseColor);
    
    // Position of the main shine
    if (shinePosition >= 0 && shinePosition < text.length) {
        newColors[shinePosition] = peakColor;
    }
    // Edges of the shine
    if (shinePosition - 1 >= 0 && shinePosition - 1 < text.length) {
        newColors[shinePosition - 1] = midColor;
    }
    if (shinePosition + 1 >= 0 && shinePosition + 1 < text.length) {
        newColors[shinePosition + 1] = midColor;
    }
    
    charColors.value = newColors;
    
    shinePosition++;
    
    // Reset the loop
    if (shinePosition > text.length + 2) {
        shinePosition = -2;
    }
};

onMounted(() => {
    console.log('SplashScreen.vue: Component mounted, starting character animation.');
    animationInterval = setInterval(animateShine, 100);
});

onUnmounted(() => {
    console.log('SplashScreen.vue: Component unmounted, stopping character animation.');
    if (animationInterval) {
        clearInterval(animationInterval);
    }
});
</script>

<style scoped>
.splash-container {
    background-color: #333333; /* Dark Grey */
}
.splash-label {
    font-size: 48;
    font-weight: bold;
    text-align: center;
    vertical-align: middle;
}
</style>
