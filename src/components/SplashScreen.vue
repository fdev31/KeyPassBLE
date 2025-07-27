<template>
    <GridLayout class="splash-container">
        <Label :text="L('keypass')" class="splash-text"></Label>
    </GridLayout>
</template>
<script lang="ts" setup>
import { localize as L } from '@nativescript/localize';
</script>

<style scoped>
.splash-container {
    background-color: #333333; /* Dark Grey */
}
.splash-text {
    color: #F5F5F5; /* Almost White */
    font-size: 48;
    font-weight: bold;
    text-align: center;
    vertical-align: middle;
}
</style>
