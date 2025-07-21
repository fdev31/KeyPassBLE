<template>
    <Page>
        <ActionBar title="Settings" class="action-bar">
            <NavigationButton text="Back" />
        </ActionBar>
        <ScrollView>
        <StackLayout class="page-container">

            <Label text="Device Name" class="setting-label"></Label>
            <TextField v-model="deviceName" hint="Enter device name" class="setting-input"></TextField>

            <Label text="Passphrase" class="setting-label"></Label>
            <GridLayout columns="*, auto" verticalAlignment="center">
                <TextField col="0" v-model="passphrase" :secure="!showPassphrase" hint="Enter passphrase" class="setting-input" style="margin-bottom: 0;"></TextField>
                <Button col="1" :text="showPassphrase ? 'Hide' : 'Show'" @tap="togglePassphraseVisibility" class="btn btn-secondary toggle-button"></Button>
            </GridLayout>

            <Button text="Save Settings" @tap="saveSettings" class="btn btn-primary save-button"></Button>

            <Label text="Backup and Restore" class="setting-label"></Label>
            <StackLayout>
                <Button text="Backup" @tap="backup" class="btn btn-secondary backup-button"></Button>
                <TextView
                    v-model="restoreData"
                    hint="Paste backup data here for restore..."
                    class="setting-input"
                    :height="isRestoreDataFocused || restoreData.length > 0 ? 120 : 50"
                    @focus="isRestoreDataFocused = true"
                    @blur="isRestoreDataFocused = false"
                ></TextView>
                <Button text="Restore" @tap="restore" class="btn btn-secondary"></Button>
            </StackLayout>
        </StackLayout>
        </ScrollView>
    </Page>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'nativescript-vue';
import { ApplicationSettings } from '@nativescript/core';
import { deviceAPI } from '../services/device-api';
import { PASSPHRASE_KEY, SETTING_DEVICE_NAME } from '../services/settings';
import * as Clipboard from 'nativescript-clipboard';


const deviceName = ref('');
const passphrase = ref('');
const showPassphrase = ref(false);
const restoreData = ref('');
const isRestoreDataFocused = ref(false);

const originalPassphrase = ref(''); // To track if passphrase changed

// Application Settings Keys

onMounted(() => {
    // Load existing settings
    deviceName.value = ApplicationSettings.getString(SETTING_DEVICE_NAME, 'KeyPass');
    passphrase.value = ApplicationSettings.getString(PASSPHRASE_KEY, '');
    originalPassphrase.value = passphrase.value; // Store original passphrase
});

const togglePassphraseVisibility = () => {
    showPassphrase.value = !showPassphrase.value;
    if (passphrase.value.length == 0) {
        passphrase.value = ApplicationSettings.getString(PASSPHRASE_KEY, 'N/A');
    }
};

const saveSettings = async () => {
    ApplicationSettings.setString(SETTING_DEVICE_NAME, deviceName.value);
    ApplicationSettings.setString(PASSPHRASE_KEY, passphrase.value);

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

const backup = async () => {
    try {
        const dumpData = await deviceAPI.dump();
        await Clipboard.setText(dumpData);
        alert('Backup data copied to clipboard!');
    } catch (error) {
        console.error("Backup failed:", error);
        alert(`Backup failed: ${error.message || error}`);
    }
};

import { eventBus } from '../services/event-bus';

const restore = async () => {
    try {
        let dumpData = restoreData.value.trim();

        if (!dumpData) {
            dumpData = await Clipboard.getText();
        }

        if (!dumpData) {
            alert('Clipboard is empty and no data in text area. Copy backup data to clipboard or paste in text area first.');
            return;
        }
        await deviceAPI.restore(dumpData);
        alert('Restore successful!');
        eventBus.notify({ eventName: 'list-needs-refresh' });
    } catch (error) {
        console.error("Restore failed:", error);
        alert(`Restore failed: ${error.message || error}`);
    }
};
</script>

<style scoped>
.page-container {
    padding: 16;
}

.backup-button {
    margin-bottom: 8;
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