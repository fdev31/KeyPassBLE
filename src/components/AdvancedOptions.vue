<template>
    <Page>
        <ActionBar :title="L('advanced_options')" class="action-bar">
            <NavigationButton :text="L('back')" />
            <ActionItem @tap="save" v-if="isIOS"
                ios.systemIcon="16" ios.position="right">
            </ActionItem>
            <ActionItem @tap="save" v-if="!isIOS"
                android.systemIcon="ic_menu_save" android.position="actionBar">
            </ActionItem>
        </ActionBar>
        <ScrollView>
            <StackLayout class="page-container">

                <GridLayout columns="*, auto" class="option-container">
                    <Label col="0" :text="L('end_with_return_key')" class="option-label"></Label>
                    <Switch col="1" v-model="localEndWithReturn" class="option-switch"></Switch>
                </GridLayout>

                <GridLayout columns="*, auto" class="option-container">
                    <Label col="0" :text="L('use_layout_override')" class="option-label"></Label>
                    <Switch col="1" v-model="localUseLayoutOverride" class="option-switch"></Switch>
                </GridLayout>

                <ListPicker :items="layoutLabels" v-model="localSelectedLayout" :isEnabled="localUseLayoutOverride" class="list-picker" />

            </StackLayout>
        </ScrollView>
    </Page>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'nativescript-vue';
import { $navigateBack } from 'nativescript-vue';
import { localize as L } from '@nativescript/localize';
import { ApplicationSettings, isIOS } from '@nativescript/core';

// Application Settings Keys
const SETTING_END_WITH_RETURN = 'settingEndWithReturn';
const SETTING_USE_LAYOUT_OVERRIDE = 'settingUseLayoutOverride';
const SETTING_SELECTED_LAYOUT = 'settingSelectedLayout';

const localEndWithReturn = ref(true);
const localUseLayoutOverride = ref(false);
const localSelectedLayout = ref(0);

const LAYOUT_OPTIONS = [
    { label: 'Bitlocker', value: -1 },
    { label: 'FR', value: 0 },
    { label: 'US', value: 1 },
];

const layoutLabels = computed(() => LAYOUT_OPTIONS.map(opt => opt.label));

onMounted(() => {
    localEndWithReturn.value = ApplicationSettings.getBoolean(SETTING_END_WITH_RETURN, true);
    localUseLayoutOverride.value = ApplicationSettings.getBoolean(SETTING_USE_LAYOUT_OVERRIDE, false);
    localSelectedLayout.value = ApplicationSettings.getNumber(SETTING_SELECTED_LAYOUT, 0);
});

const save = () => {
    ApplicationSettings.setBoolean(SETTING_END_WITH_RETURN, localEndWithReturn.value);
    ApplicationSettings.setBoolean(SETTING_USE_LAYOUT_OVERRIDE, localUseLayoutOverride.value);
    ApplicationSettings.setNumber(SETTING_SELECTED_LAYOUT, localSelectedLayout.value);
    $navigateBack();
};

const cancel = () => {
    $navigateBack();
};
</script>

<style scoped>
.action-bar {
    background-color: #4F46E5;
    color: white;
}
.page-container {
    padding: 16;
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
.list-picker {
    height: 120;
    margin-top: 8;
}
.action-buttons {
    margin-top: 16;
}
.btn {
    font-size: 16;
    padding: 12;
    border-radius: 8;
}
.btn-primary {
    background-color: #4F46E5;
    color: white;
    margin-left: 8;
}
.btn-secondary {
    background-color: #6B7280;
    color: white;
    margin-right: 8;
}
</style>
