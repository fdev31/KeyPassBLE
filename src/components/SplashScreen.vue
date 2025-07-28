<template>
    <GridLayout class="splash-container">
        <Label :text="L('keypass')" class="splash-text"></Label>
        <GridLayout class="reflection" ref="reflection"></GridLayout>
    </GridLayout>
</template>
<script lang="ts" setup>
import { localize as L } from '@nativescript/localize';
import { onMounted, ref } from 'vue';
import { CoreTypes, Screen } from '@nativescript/core';

const reflection = ref();

onMounted(() => {
    if (reflection.value) {
        const reflectionView = reflection.value.nativeView;
        const screenWidth = Screen.mainScreen.widthDIPs;

        // Start from left of the screen
        reflectionView.translateX = -screenWidth;

        reflectionView.animate({
            translate: { x: screenWidth * 2, y: 0 },
            duration: 1500,
            curve: CoreTypes.AnimationCurve.easeInOut,
        });
    }
});

</script>

<style scoped>
.splash-container {
    background-color: #333333; /* Dark Grey */
    overflow: hidden;
}
.splash-text {
    color: #F5F5F5; /* Almost White */
    font-size: 48;
    font-weight: bold;
    text-align: center;
    vertical-align: middle;
}
.reflection {
    width: 100;
    height: 300;
    background: linear-gradient(to right, transparent, white, transparent);
    transform: skewX(-20deg);
    opacity: 0.6;
}
</style>
