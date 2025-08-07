<template>
    <Page>
        <ActionBar :title="L('settings')" class="action-bar">
            <NavigationButton :text="L('back')" />
            <ActionItem v-if="isIOS" @tap="saveSettings"
                ios.systemIcon="16" ios.position="right">
            </ActionItem>
            <ActionItem v-if="!isIOS" @tap="saveSettings"
                android.systemIcon="ic_menu_save" android.position="actionBar">
            </ActionItem>
        </ActionBar>
        <GridLayout rows="*" columns="*">
            <ScrollView row="0" col="0">
                <StackLayout class="page-container">

                    <Label :text="L('device_name')" class="setting-label"></Label>
                    <TextField v-model="deviceName" :hint="L('enter_device_name')" class="setting-input"></TextField>

                    <Label :text="L('passphrase')" class="setting-label"></Label>
                    <GridLayout columns="*, auto" class="input-with-icon">
                        <TextField col="0" v-model="passphrase" :secure="!showPassphrase" :hint="L('enter_passphrase')" class="setting-input-transparent"></TextField>
                        <Label col="1" text="👁️" @tap="blink($event, togglePassphraseVisibility)" class="icon-button"></Label>
                    </GridLayout>

                    <Label :text="L('wifi_connectivity')" class="setting-label"></Label>
                    <Button :text="L('set_wifi_password')" @tap="blink($event, setWifiPassword)" class="btn btn-secondary"></Button>

                    <Label :text="L('backup_and_restore')" class="setting-label"></Label>
                    <StackLayout>
                        <Button :text="L('backup')" @tap="blink($event, backup)" class="btn btn-secondary backup-button"></Button>

                        <Label :text="L('recent_backups')" class="setting-label" v-if="backups.length > 0"></Label>
                        <ListView :key="listKey" :items="backups" class="backup-list">
                            <template v-slot:default="{ item }">
                                <StackLayout class="backup-item" @tap="selectBackup(item)">
                                    <Label :text="`${L('backup_from')}${formatBackupDate(item.date)}`" />
                                </StackLayout>
                            </template>
                        </ListView>

                        <Button :text="backupButtonText" @tap="blink($event, restore)" class="btn btn-secondary"></Button>
                        <TextView
                            v-model="restoreData"
                            :hint="L('paste_backup_data')"
                            class="setting-input"
                            :height="isRestoreDataFocused || restoreData.length > 0 ? 120 : 50"
                            @focus="isRestoreDataFocused = true"
                            @blur="isRestoreDataFocused = false"
                        ></TextView>
                    </StackLayout>

                    <Label :text="L('danger_zone')" class="setting-label danger-zone-label"></Label>
                    <Button :text="L('factory_reset')" @tap="blink($event, factoryReset)" class="btn btn-danger"></Button>

                    <Label :text="`Version: ${version}`" class="version-label"></Label>
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
import { ApplicationSettings, Dialogs, isIOS } from '@nativescript/core';
import { deviceAPI } from '../services/device-api';
import { PASSPHRASE_KEY, SETTING_DEVICE_NAME } from '../services/settings';
import * as Clipboard from 'nativescript-clipboard';
import { passwordStore } from '../services/store';
import { localize as L } from '@nativescript/localize';
import { SecureStorage } from '@heywhy/ns-secure-storage';
import packageInfo from '../../package.json';
import { blink } from '../services/domUtils';


const version = computed(() => packageInfo.version);

const secureStorage = new SecureStorage();

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
const listKey = ref(0);

const originalPassphrase = ref(''); // To track if passphrase changed

const backupButtonText = computed(() => {
    return selectedBackup.value !== null ? L('restore_from_this_backup') : L('restore');
});

// Application Settings Keys

onMounted(async () => {
    // Load existing settings
    deviceName.value = ApplicationSettings.getString(SETTING_DEVICE_NAME, 'KeyPass');
    passphrase.value = await secureStorage.get({ key: PASSPHRASE_KEY }) || '';
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
    listKey.value++;
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

    // Filter out any existing backup with the exact same data to avoid duplicates
    const otherBackups = backups.value.filter(b => b.data !== dumpData);

    // Create a new array with the new backup at the top
    let newBackups = [newBackup, ...otherBackups];

    // Ensure we only keep the 3 most recent backups
    if (newBackups.length > 3) {
        newBackups = newBackups.slice(0, 3);
    }

    // Assign the new array directly to the ref's value to ensure reactivity
    backups.value = newBackups;
    saveBackups();
    listKey.value++;
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

/*
 * Replaces placeholders in a template string with corresponding values from an object
 * @param str - Template string containing placeholders in format {key}
 * @param values - Object containing key-value pairs for replacement
 * @returns The interpolated string with placeholders replaced by values
 */
function templateL(str: string, values: Record<string, string | number | boolean>): string {
  return L(str).replace(/{([^{}]+)}/g, (match: string, key: string): string => {
    const value = values[key];
    return value !== undefined ? String(value) : match;
  });
}


const formatBackupDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    const diffMonths = now.getMonth() - date.getMonth() + (12 * (now.getFullYear() - date.getFullYear()));

    // Manually format time to HH:MM to avoid timezone strings
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;

    if (diffMonths < 3) {
        let relativeDate;
        if (diffDays === 0) {
            relativeDate = L('today');
        } else if (diffDays === 1) {
            relativeDate = L('yesterday');
        } else if (diffDays < 7) {
            relativeDate = templateL('days_ago', {days: diffDays});
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            relativeDate = weeks === 1 ? L('a_week_ago') : templateL('weeks_ago', {weeks});
        } else {
            const months = Math.floor(diffDays / 30);
            relativeDate = months <= 1 ? L('a_month_ago') : templateL("months_ago", {months});
        }
        return `${relativeDate} ${L('at')} ${time}`;
    } else {
        // For older dates, show full local date and time in a consistent format
        return date.toLocaleString([], {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }
};

const togglePassphraseVisibility = async () => {
    showPassphrase.value = !showPassphrase.value;
    if (passphrase.value.length == 0) {
        passphrase.value = await secureStorage.get({ key: PASSPHRASE_KEY }) || 'N/A';
    }
};

const saveSettings = async () => {
    ApplicationSettings.setString(SETTING_DEVICE_NAME, deviceName.value);
    await secureStorage.set({ key: PASSPHRASE_KEY, value: passphrase.value });

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

        addBackup(dumpData);
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
        addBackup(dumpData);
        alert('Restore successful!');
        eventBus.notify({ eventName: 'list-needs-refresh' });
        restoreData.value = '';
        selectedBackup.value = null;
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
    margin-top: 8;
    margin-bottom: 8;
    horizontal-align: center;
    width: 90%;
}

.btn-secondary {
    background-color: #6B7280;
    color: white;
}

.setting-input-transparent {
    border-width: 0;
    background-color: transparent;
    padding: 12;
    font-size: 16;
    color: #374151;
}

.input-with-icon {
    border-width: 1;
    border-color: #E5E7EB;
    border-radius: 8;
    margin-bottom: 8;
    padding-right: 8;
}

.icon-button {
    font-size: 24;
    color: #6B7280;
    padding: 8;
    vertical-align: middle;
}

.danger-zone-label {
    color: #DC2626; /* Red-600 */
}

.btn-danger {
    background-color: #DC2626; /* Red-600 */
    color: white;
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

.version-label {
    font-size: 12;
    color: #9CA3AF; /* Gray-400 */
    text-align: center;
    margin-top: 16;
}
</style>
