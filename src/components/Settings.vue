<template>
    <Page>
        <ActionBar title="Settings" class="action-bar">
            <NavigationButton text="Back" />
        </ActionBar>
        <GridLayout rows="*" columns="*">
            <ScrollView row="0" col="0">
                <StackLayout class="page-container">

                    <Label text="Device Name" class="setting-label"></Label>
                    <TextField v-model="deviceName" hint="Enter device name" class="setting-input"></TextField>

                    <Label text="Passphrase" class="setting-label"></Label>
                    <GridLayout columns="*, auto" verticalAlignment="center">
                        <TextField col="0" v-model="passphrase" :secure="!showPassphrase" hint="Enter passphrase" class="setting-input" style="margin-bottom: 0;"></TextField>
                        <Button col="1" :text="showPassphrase ? 'Hide' : 'Show'" @tap="togglePassphraseVisibility" class="btn btn-secondary toggle-button"></Button>
                    </GridLayout>

                    <Button text="Save Settings" @tap="saveSettings" class="btn btn-primary save-button"></Button>
                    <Button text="Set WiFi Password" @tap="setWifiPassword" class="btn btn-secondary wifi-button"></Button>

                    <Label text="Backup and Restore" class="setting-label"></Label>
                    <StackLayout>
                        <Button text="Backup" @tap="backup" class="btn btn-secondary backup-button"></Button>
                        
                        <Label text="Recent Backups" class="setting-label" v-if="backups.length > 0"></Label>
                        <ListView :items="backups" class="backup-list">
                            <template v-slot:default="{ item }">
                                <StackLayout class="backup-item" @tap="selectBackup(item)">
                                    <Label :text="`Backup from ${new Date(item.date).toLocaleString()}`" />
                                </StackLayout>
                            </template>
                        </ListView>

                        <Button :text="backupButtonText" @tap="restore" class="btn btn-secondary"></Button>
                        <TextView
                            v-model="restoreData"
                            hint="Paste backup data here for restore..."
                            class="setting-input"
                            :height="isRestoreDataFocused || restoreData.length > 0 ? 120 : 50"
                            @focus="isRestoreDataFocused = true"
                            @blur="isRestoreDataFocused = false"
                        ></TextView>
                    </StackLayout>

                    <Label text="Danger Zone" class="setting-label danger-zone-label"></Label>
                    <Button text="Factory Reset" @tap="factoryReset" class="btn btn-danger"></Button>
                </StackLayout>
            </ScrollView>
            <GridLayout row="0" col="0" v-if="isBusy" class="overlay" rows="*, auto, *" columns="*" height="100%">
                <StackLayout row="1" class="progress-container" horizontalAlignment="center">
                    <Label :text="progressTitle" class="progress-title"></Label>
                    <Progress :value="progress" maxValue="100" class="progress-bar"></Progress>
                    <Label :text="`${Math.round(progress)}%`" class="progress-label"></Label>
                </StackLayout>
            </GridLayout>
        </GridLayout>
    </Page>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed } from 'nativescript-vue';
import { ApplicationSettings, Dialogs } from '@nativescript/core';
import { deviceAPI } from '../services/device-api';
import { PASSPHRASE_KEY, SETTING_DEVICE_NAME } from '../services/settings';
import * as Clipboard from 'nativescript-clipboard';
import { passwordStore } from '../services/store';

const BACKUPS_KEY = 'password_backups';

const deviceName = ref('');
const passphrase = ref('');
const showPassphrase = ref(false);
const restoreData = ref('');
const isRestoreDataFocused = ref(false);
const isBusy = ref(false);
const progress = ref(0);
const progressTitle = ref('');
const backups = ref([]);
const selectedBackup = ref(null);

const originalPassphrase = ref(''); // To track if passphrase changed

const backupButtonText = computed(() => {
    return selectedBackup.value !== null ? `Restore from this backup` : 'Restore';
});

// Application Settings Keys

onMounted(() => {
    // Load existing settings
    deviceName.value = ApplicationSettings.getString(SETTING_DEVICE_NAME, 'KeyPass');
    passphrase.value = ApplicationSettings.getString(PASSPHRASE_KEY, '');
    originalPassphrase.value = passphrase.value; // Store original passphrase
    loadBackups();
});

const loadBackups = () => {
    const storedBackups = ApplicationSettings.getString(BACKUPS_KEY);
    console.log('Attempting to load backups from ApplicationSettings...');
    if (storedBackups) {
        console.log('Found stored backups:', storedBackups);
        try {
            const parsedBackups = JSON.parse(storedBackups);
            if (Array.isArray(parsedBackups)) {
                backups.value = parsedBackups;
                console.log('Successfully parsed and loaded backups:', backups.value);
            } else {
                console.error('Parsed backups are not an array:', parsedBackups);
                backups.value = [];
            }
        } catch (error) {
            console.error('Error parsing backups from ApplicationSettings:', error);
            backups.value = [];
        }
    } else {
        console.log('No backups found in ApplicationSettings.');
        backups.value = [];
    }
};

const saveBackups = () => {
    try {
        const stringifiedBackups = JSON.stringify(backups.value);
        ApplicationSettings.setString(BACKUPS_KEY, stringifiedBackups);
        console.log('Successfully saved backups:', stringifiedBackups);
    } catch (error) {
        console.error('Error saving backups to ApplicationSettings:', error);
    }
};

const addBackup = (dumpData) => {
    const newBackup = {
        date: new Date().toISOString(),
        data: dumpData,
    };
    backups.value.unshift(newBackup);
    if (backups.value.length > 3) {
        backups.value.pop();
    }
    saveBackups();
};

const selectBackup = (backup) => {
    console.log('Backup item selected:', JSON.stringify(backup));
    if (backup && typeof backup.data !== 'undefined') {
        selectedBackup.value = backup;
        restoreData.value = backup.data;
        console.log('restoreData has been set.');
    } else {
        console.error('Selected backup item is invalid or has no data:', backup);
        restoreData.value = ''; // Set to empty string to avoid crash
    }
};

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

const setWifiPassword = async () => {
    const result = await Dialogs.prompt({
        title: "Set WiFi Password",
        message: "Enter the new WiFi password:",
        okButtonText: "Set",
        cancelButtonText: "Cancel",
        inputType: "password",
    });

    if (result.result && result.text) {
        isBusy.value = true;
        progressTitle.value = 'Updating WiFi Password...';
        try {
            await deviceAPI.updateWifiPass(result.text);
            alert('WiFi password updated successfully!');
        } catch (error) {
            console.error("Failed to update WiFi password:", error);
            alert(`Failed to update WiFi password: ${error.message || error}`);
        } finally {
            isBusy.value = false;
        }
    }
};

const backup = async () => {
    isBusy.value = true;
    progress.value = 0;
    progressTitle.value = 'Backing up...';
    try {
        let fullDump = [];
        let index = 0;
        let expectedLength = -1;
        const totalPasswords = passwordStore.entries.length;

        while (true) {
            const entry = await deviceAPI.dumpOne(index);
            if (index === 0) {
                if (!entry) break;
                expectedLength = entry.length;
            } else {
                if (!entry || entry.length < expectedLength) {
                    break;
                }
            }
            
            fullDump.push(entry);
            if (totalPasswords > 0) {
                progress.value = Math.min(100, ((index + 1) / totalPasswords) * 100);
            }
            index++;
        }
        const dumpData = fullDump.join('\n');
        addBackup(dumpData);
        await Clipboard.setText(dumpData);
        alert(`${index} passwords dumped and copied to clipboard!`);
    } catch (error) {
        console.error("Backup failed:", error);
        alert(`Backup failed: ${error.message || error}`);
    } finally {
        isBusy.value = false;
    }
};

import { eventBus } from '../services/event-bus';

const restore = async () => {
    isBusy.value = true;
    progress.value = 0;
    progressTitle.value = 'Restoring...';
    try {
        let dumpData = restoreData.value.trim();

        if (!dumpData) {
            dumpData = await Clipboard.getText();
        }

        if (!dumpData) {
            alert('Clipboard is empty and no data in text area. Copy backup data to clipboard or paste in text area first.');
            return;
        }
        
        const lines = dumpData.split('\n').filter(line => {
            const trimmedLine = line.trim();
            return trimmedLine && !trimmedLine.startsWith('#');
        });

        const totalLines = lines.length;
        alert(`Starting restoration of ${totalLines} entries, this will take a while...`);

        let index = 0;
        for (const line of lines) {
            const trimmedLine = line.trim();
            console.log(`restore entry ${index}: ${trimmedLine}`);
            await deviceAPI.restoreOne(index, trimmedLine);
            index++;
            progress.value = (index / totalLines) * 100;
        }
        alert('Restore successful!');
        eventBus.notify({ eventName: 'list-needs-refresh' });
    } catch (error) {
        console.error("Restore failed:", error);
        alert(`Restore failed: ${error.message || error}`);
    } finally {
        isBusy.value = false;
    }
};

const factoryReset = async () => {
    const result = await Dialogs.confirm({
        title: "Confirm Factory Reset",
        message: "Are you sure you want to factory reset the device? This will erase all data.",
        okButtonText: "Yes, Reset",
        cancelButtonText: "Cancel",
    });

    if (result) {
        isBusy.value = true;
        progressTitle.value = 'Factory Resetting...';
        progress.value = 0; // or some indeterminate state if possible
        try {
            await deviceAPI.reset();
            progress.value = 100;
            alert('Factory reset successful!');
            // Optionally, navigate away or clear settings
        } catch (error) {
            console.error("Factory reset failed:", error);
            alert(`Factory reset failed: ${error.message || error}`);
        } finally {
            isBusy.value = false;
        }
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

.backup-list {
    height: 180;
    margin-bottom: 8;
    border-width: 1;
    border-color: #E5E7EB;
    border-radius: 8;
}

.backup-item {
    padding: 12;
    border-bottom-width: 1;
    border-bottom-color: #E5E7EB;
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

.wifi-button {
    margin-top: 8;
}

.danger-zone-label {
    color: #DC2626; /* Red-600 */
}

.btn-danger {
    background-color: #DC2626; /* Red-600 */
    color: white;
    margin-top: 8;
}

.overlay {
    background-color: rgba(0, 0, 0, 0.7);
}

.progress-container {
    background-color: #F3F4F6;
    border-radius: 8;
    padding: 24;
    margin: 16;
}

.progress-title {
    font-size: 18;
    font-weight: bold;
    color: #111827;
    text-align: center;
    margin-bottom: 16;
}

.progress-bar {
    color: #4F46E5;
    height: 10; /* Make it thicker */
}

.progress-label {
    font-size: 14;
    color: #4B5563;
    text-align: center;
    margin-top: 8;
}
</style>
