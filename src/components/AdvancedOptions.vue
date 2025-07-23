<template>
    <GridLayout verticalAlignment="center" class="modal-container-wrapper" row="0" col="0" rows="*, auto, *" columns="*">
        <StackLayout class="modal-container" row="1" horizontalAlignment="center" verticalAlignment="center">
            <Label text="Advanced Options" class="modal-title"></Label>

            <GridLayout columns="*, auto" class="option-container">
                <Label col="0" text="End with Return Key" class="option-label"></Label>
                <Switch col="1" v-model="localEndWithReturn" class="option-switch"></Switch>
            </GridLayout>

            <GridLayout columns="*, auto" class="option-container">
                <Label col="0" text="Use Layout Override" class="option-label"></Label>
                <Switch col="1" v-model="localUseLayoutOverride" class="option-switch"></Switch>
            </GridLayout>

            <Label text="Keyboard Layout" class="option-label"></Label>
            <ListPicker :items="layoutLabels" v-model="localSelectedLayout" :isEnabled="localUseLayoutOverride" class="list-picker" />

            <GridLayout columns="*, *" class="action-buttons">
                <Button col="0" text="Cancel" @tap="closeModal" class="btn btn-secondary"></Button>
                <Button col="1" text="Apply" @tap="applyAndClose" class="btn btn-primary"></Button>
            </GridLayout>
        </StackLayout>
    </GridLayout>
</template>

<script lang="ts" setup>
import { ref, computed } from 'nativescript-vue';
import { $closeModal } from 'nativescript-vue';

const props = defineProps({
    endWithReturn: Boolean,
    useLayoutOverride: Boolean,
    selectedLayout: Number,
});

const localEndWithReturn = ref(props.endWithReturn);
const localUseLayoutOverride = ref(props.useLayoutOverride);
const localSelectedLayout = ref(props.selectedLayout);

const LAYOUT_OPTIONS = [
    { label: 'Bitlocker', value: -1 },
    { label: 'FR', value: 0 },
    { label: 'US', value: 1 },
];

const layoutLabels = computed(() => LAYOUT_OPTIONS.map(opt => opt.label));

const applyAndClose = () => {
    $closeModal({
        endWithReturn: localEndWithReturn.value,
        useLayoutOverride: localUseLayoutOverride.value,
        selectedLayout: localSelectedLayout.value,
    });
};

const closeModal = () => {
    $closeModal();
};
</script>

<style scoped>
.modal-container-wrapper {
    margin: 16;
}
.modal-container {
    padding: 16;
    background-color: white;
    border-radius: 8;
}
.modal-title {
    font-size: 20;
    font-weight: bold;
    text-align: center;
    margin-bottom: 16;
}
.option-container {
    margin-top: 8;
    margin-bottom: 8;
}
.option-label {
    font-size: 16;
    font-weight: bold;
    color: #111827;
    vertical-align: middle;
}
.option-switch {
    vertical-align: middle;
}
.list-picker { height: 120; }
.action-buttons { margin-top: 16; }
.btn {
    font-size: 16;
    padding: 8;
    border-radius: 8;
}
.btn-primary { background-color: #4F46E5; color: white; }
.btn-secondary { background-color: #6B7280; color: white; margin-right: 8; }
</style>
