<template>
    <Page>
        <ActionBar title="Settings" class="action-bar">
            <NavigationButton text="Back" />
        </ActionBar>
        <StackLayout class="page-container">

            <Label text="Device Name" class="setting-label"></Label>
            <TextField v-model="deviceName" hint="Enter device name" class="setting-input"></TextField>

            <Label text="Passphrase" class="setting-label"></Label>
            <GridLayout columns="*, auto">
                <TextField col="0" v-model="passphrase" :secure="!showPassphrase" hint="Enter passphrase" class="setting-input"></TextField>
                <Button col="1" :text="showPassphrase ? 'Hide' : 'Show'" @tap="togglePassphraseVisibility" class="btn btn-secondary toggle-button"></Button>
            </GridLayout>

            <Button text="Save Settings" @tap="saveSettings" class="btn btn-primary save-button"></Button>
        </StackLayout>
    </Page>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'nativescript-vue';
import { ApplicationSettings } from '@nativescript/core';
import { deviceAPI } from '../services/device-api';


const deviceName = ref('');
const passphrase = ref('');
const showPassphrase = ref(false);

const originalPassphrase = ref(''); // To track if passphrase changed

// Application Settings Keys
const SETTING_DEVICE_NAME = 'settingDeviceName';
const SETTING_PASSPHRASE = 'settingPassphrase';

onMounted(() => {
    // Load existing settings
    deviceName.value = ApplicationSettings.getString(SETTING_DEVICE_NAME, 'KeyPass');
    passphrase.value = ApplicationSettings.getString(SETTING_PASSPHRASE, '');
    originalPassphrase.value = passphrase.value; // Store original passphrase
});

const togglePassphraseVisibility = () => {
    showPassphrase.value = !showPassphrase.value;
};

const saveSettings = async () => {
    ApplicationSettings.setString(SETTING_DEVICE_NAME, deviceName.value);
    ApplicationSettings.setString(SETTING_PASSPHRASE, passphrase.value);

    // Only update device passphrase if it has changed
    if (passphrase.value !== originalPassphrase.value) {
        try {
            await deviceAPI.passphrase(passphrase.value);
            alert('Passphrase updated on device and settings saved!');
            originalPassphrase.value = passphrase.value; // Update original after successful save
        } catch (error) {
            console.error("Failed to set passphrase on device:", error);
            alert(`Failed to update passphrase on device: ${error.message || error}`);
        }
    } else {
        alert('Settings saved!');
    }
};
</script>

<style scoped>
.page-container {
    padding: 16;
}

.action-bar {
    background-color: #4F46E5;
    color: white;
}

.setting-label {
    font-size: 18;
    font-weight: bold;
    margin-top: 16;
    margin-bottom: 8;
    color: #111827;
}

.setting-input {
    border-width: 1;
    border-color: #E5E7EB;
    border-radius: 8;
    padding: 12;
    font-size: 16;
    color: #374151;
    margin-bottom: 8;
}

.btn {
    border-radius: 8;
    font-size: 16;
    padding: 12;
}

.btn-primary {
    background-color: #4F46E5;
    color: white;
    margin-top: 16;
}

.btn-secondary {
    background-color: #6B7280;
    color: white;
}

.toggle-button {
    margin-left: 8;
    width: auto; /* Adjust width to content */
}

.save-button {
    margin-top: 24;
}
</style>
