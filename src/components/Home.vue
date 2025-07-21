<template>
    <Page @navigatedTo="onNavigatedTo">
        <ActionBar :title="actionBarTitle" class="action-bar">
        </ActionBar>
        <GridLayout rows="auto, *, auto" class="page-container">

        <!-- Home View (Disconnected/Connecting/List Modes) -->

            <!-- Disconnected Mode -->
            <template v-if="currentMode === 'disconnected' || currentMode === 'connecting'">
                <GridLayout row="0" columns="*,*" class="button-grid">
                    <Button col="0" text="Scan" @tap="startScan" :isEnabled="!isScanning" class="btn btn-primary"></Button>
                    <Button col="1" text="Paired Devices" @tap="listPairedDevices" :isEnabled="!isScanning" class="btn btn-secondary"></Button>
                </GridLayout>

                <ScrollView row="1" class="list-container">
                    <StackLayout>
                        <StackLayout v-for="device in discoveredDevices" :key="device.UUID" @tap="connectToDevice(device)" class="list-item">
                            <Label :text="device.name || 'Unknown Device'" class="list-item-name"></Label>
                            <Label :text="device.UUID" class="list-item-uuid"></Label>
                        </StackLayout>
                    </StackLayout>
                </ScrollView>

                <Label row="2" :text="statusMessage" textWrap="true" class="status-label"></Label>
            </template>

            <!-- List Mode -->
            <template v-if="currentMode === 'list'">
                <Label row="0" :text="statusMessage" textWrap="true" class="status-label"></Label>

                <!-- Password List -->
                <ScrollView row="1" class="list-container">
                    <StackLayout>
                        <StackLayout v-for="entry in passwordStore.entries" :key="entry.uid" @tap="onPasswordSelected(entry)" @longPress="onEditPassword(entry)" class="list-item" :class="{ 'selected': selectedPasswordEntry && selectedPasswordEntry.uid === entry.uid }">
                            <Label :text="entry.name" class="list-item-name"></Label>
                        </StackLayout>
                        <Label v-if="passwordStore.entries.length === 0" text="No passwords found." class="status-label"></Label>
                    </StackLayout>
                </ScrollView>

                <StackLayout row="2">
                    <!-- Advanced Options -->
                    <StackLayout class="advanced-options-container">
                        <Button text="Toggle Advanced Options" @tap="showAdvancedOptions = !showAdvancedOptions" class="btn btn-secondary"></Button>
                        <StackLayout :class="['advanced-options-content', { 'advanced-options-content-hidden': !showAdvancedOptions }]">
                            <Label text="End with Return Key" class="option-label"></Label>
                            <Switch v-model="endWithReturn" class="option-switch"></Switch>

                            <Label text="Use Layout Override" class="option-label"></Label>
                            <Switch v-model="useLayoutOverride" class="option-switch"></Switch>

                            <Label text="Keyboard Layout" class="option-label"></Label>
                            <SegmentedBar v-model="selectedLayout" :isEnabled="useLayoutOverride">
                                <SegmentedBarItem v-for="layout in LAYOUT_OPTIONS" :key="layout.value" :title="layout.label"></SegmentedBarItem>
                            </SegmentedBar>
                        </StackLayout>
                    </StackLayout>

                    <!-- Action Buttons -->
                    <GridLayout columns="*, *" class="action-buttons-container">
                        <Button col="0" text="+ Add New" @tap="onAddNewPassword" class="btn btn-primary icon-button"></Button>
                        <Button col="1" text="⚙�� Settings" @tap="onSettings" class="btn btn-secondary icon-button"></Button>
                    </GridLayout>
                </StackLayout>
            </template>

    </GridLayout>
    </Page>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed, watch, $navigateTo } from 'nativescript-vue';
import { Peripheral } from '@nativescript-community/ble';
import { isAndroid, Device, ApplicationSettings, Frame } from '@nativescript/core';
import { deviceAPI } from '../services/device-api';
import Settings from './Settings.vue';
import PassEditPage from './PassEditPage.vue';
import { passwordStore } from '../services/store';

interface PasswordEntry {
    uid: string;
    name: string;
}

const isScanning = ref(false);
const discoveredDevices = ref<Partial<Peripheral>[]>([]);
const statusMessage = ref('App started. Loading...');
const currentMode = ref<'disconnected' | 'connecting' | 'list'>('disconnected');
const selectedPasswordEntry = ref<PasswordEntry | null>(null);

// Reconnection Logic
const isReconnecting = ref(false);
const reconnectAttempts = ref(0);
const maxReconnectAttempts = 5; // Max attempts before giving up
const reconnectDelayMs = 5000; // 5 seconds delay between attempts

// Advanced Options
const showAdvancedOptions = ref(false);
const endWithReturn = ref(true); // Default to true
const useLayoutOverride = ref(false); // Default to false
const selectedLayout = ref(0); // Default to FR (0)

const LAYOUT_OPTIONS = [
    { label: 'Bitlocker', value: -1 },
    { label: 'FR', value: 0 },
    { label: 'US', value: 1 },
    // Add more layouts as needed
];

// Application Settings Keys
const SETTING_END_WITH_RETURN = 'settingEndWithReturn';
const SETTING_USE_LAYOUT_OVERRIDE = 'settingUseLayoutOverride';
const SETTING_SELECTED_LAYOUT = 'settingSelectedLayout';

const actionBarTitle = computed(() => {
    switch (currentMode.value) {
        case 'disconnected':
        case 'connecting':
            return 'KeyPass Connector';
        case 'list':
            return 'Your Passwords';
        default:
            return 'KeyPass';
    }
});
const reconnectLast = () => {
    const lastDeviceUUID = ApplicationSettings.getString('lastDeviceUUID');
    console.log(`[Home.vue] reconnect: lastDeviceUUID = ${lastDeviceUUID}`);
    if (lastDeviceUUID) {
        setTimeout(() => connectToDevice({ UUID: lastDeviceUUID, name: 'Last Device' }), 500);
        return true;
    }
    return false;
}
import { eventBus } from '../services/event-bus';

onMounted(() => {
    if (reconnectLast()) {
        statusMessage.value = `Found last device. Connecting...`;
        currentMode.value = 'connecting';
    } else {
        statusMessage.value = 'Last device not found. Please connect or select another.';
        currentMode.value = 'disconnected';
    }
    // Load cached passwords on startup
    const cachedPasswords = ApplicationSettings.getString('cachedPasswords');
    if (cachedPasswords) {
        try {
            passwordStore.entriesRef.value = JSON.parse(cachedPasswords);
        } catch (e) {
            console.error("Failed to parse cached passwords:", e);
            ApplicationSettings.remove('cachedPasswords');
        }
    }

    // Load advanced settings
    const savedEndWithReturn = ApplicationSettings.getBoolean(SETTING_END_WITH_RETURN, true);
    endWithReturn.value = savedEndWithReturn;

    const savedUseLayoutOverride = ApplicationSettings.getBoolean(SETTING_USE_LAYOUT_OVERRIDE, false);
    useLayoutOverride.value = savedUseLayoutOverride;

    const savedSelectedLayout = ApplicationSettings.getNumber(SETTING_SELECTED_LAYOUT, 0);
    selectedLayout.value = savedSelectedLayout;

    eventBus.on('list-needs-refresh', () => {
        setTimeout(() => {
            loadPasswordList(true);
        }, 1000);
    });
});

watch(endWithReturn, (newValue) => {
    ApplicationSettings.setBoolean(SETTING_END_WITH_RETURN, newValue);
});

watch(useLayoutOverride, (newValue) => {
    ApplicationSettings.setBoolean(SETTING_USE_LAYOUT_OVERRIDE, newValue);
});

watch(selectedLayout, (newValue) => {
    ApplicationSettings.setNumber(SETTING_SELECTED_LAYOUT, newValue);
});

const disconnectAndGoHome = () => {
    deviceAPI.disconnect();
    currentMode.value = 'disconnected';
    statusMessage.value = 'Disconnected. Please select a device.';
    discoveredDevices.value = [];
    selectedPasswordEntry.value = null; // Clear selected password on disconnect
    isReconnecting.value = false; // Reset reconnection state
    reconnectAttempts.value = 0; // Reset reconnection attempts
};

const loadPasswordList = async (forced) => {
    if (!forced && passwordStore.entries.length > 0) {
        statusMessage.value = `Using cached passwords (${passwordStore.entries.length} entries).`;
        return; // Use cached passwords if available
    }
    statusMessage.value = 'Loading passwords...';
    try {
        const response = await deviceAPI.list();
        const parsedResponse = JSON.parse(response);
        const parsedList: PasswordEntry[] = parsedResponse.passwords;
        passwordStore.entriesRef.value = parsedList;
        ApplicationSettings.setString('cachedPasswords', JSON.stringify(parsedList));
        statusMessage.value = `Loaded ${parsedList.length} passwords.`;
    } catch (err) {
        console.error(`Failed to load password list: ${err}`);
        statusMessage.value = `Failed to load passwords: ${err.message}`;
    }
};

const onPasswordSelected = async (entry: PasswordEntry) => {
    selectedPasswordEntry.value = entry;
    statusMessage.value = `Selected password: ${entry.name} (UID: ${entry.uid}). Typing...`;
    await typeSelectedPassword();
};

const typeSelectedPassword = async () => {
    if (!selectedPasswordEntry.value) {
        alert("No password selected.");
        return;
    }

    statusMessage.value = `Typing password: ${selectedPasswordEntry.value.name}...`;
    try {
        const layoutToUse = useLayoutOverride.value ? selectedLayout.value : undefined;
        const response = await deviceAPI.typePass(
            selectedPasswordEntry.value.uid,
            layoutToUse,
            endWithReturn.value
        );
        statusMessage.value = `Password typed: ${response}`;
    } catch (err) {
        console.error(`Failed to type password: ${err}`);
        statusMessage.value = `Failed to type password: ${err.message}`;
    }
};

const attemptReconnect = (device: Partial<Peripheral>) => {
    if (reconnectAttempts.value < maxReconnectAttempts) {
        reconnectAttempts.value++;
        isReconnecting.value = true;
        statusMessage.value = `Connection lost. Attempting to reconnect (${reconnectAttempts.value}/${maxReconnectAttempts})...`;
        setTimeout(() => connectToDevice(device, true), reconnectDelayMs);
    } else {
        statusMessage.value = `Failed to reconnect after ${maxReconnectAttempts} attempts. Disconnecting.`;
        disconnectAndGoHome();
    }
};

const connectToDevice = async (device: Partial<Peripheral>, isReconnect: boolean = false) => {
    try {
        await deviceAPI.requestPermissions();
        const isEnabled = await deviceAPI.isBluetoothEnabled();
        if (!isEnabled) {
            alert('Bluetooth is not enabled.');
            currentMode.value = 'disconnected';
            return;
        }

        statusMessage.value = `Connecting to ${device.name || device.UUID}...`;
        currentMode.value = 'connecting';

        await deviceAPI.connect(
            { UUID: device.UUID },
            async (peripheral: Peripheral) => {
                console.log(`Connected to ${peripheral.UUID}`);
                statusMessage.value = `Connected to ${peripheral.name}!`;
                isReconnecting.value = false; // Reset reconnection state on successful connection
                reconnectAttempts.value = 0; // Reset attempts
                try {
                    const authResponse = await deviceAPI.authenticate();
                    statusMessage.value = `Authentication: ${authResponse}`;
                    currentMode.value = 'list';
                    setTimeout(() => {
                        statusMessage.value = 'Loading password list...';
                        loadPasswordList(true);
                    }, 200);
                } catch (authErr) {
                    console.error(`Authentication failed: ${authErr}`);
                    statusMessage.value = `Authentication failed: ${authErr.message}`;
                    disconnectAndGoHome();
                }
            },
            (peripheral: Peripheral) => {
                console.log(`Disconnected from ${peripheral.UUID}`);
                statusMessage.value = `Disconnected from ${peripheral.name}.`;
                // Only attempt reconnect if it was not a user-initiated disconnect
                if (currentMode.value === 'list') { // Assuming 'list' mode means we were actively connected
                    attemptReconnect(peripheral);
                } else {
                    disconnectAndGoHome();
                }
            }
        );
    } catch (err) {
        console.error(`Error connecting to device:`, err);
        console.error(`Type of error: ${typeof err}`);
        statusMessage.value = `Failed to connect: ${err ? err.message : 'Unknown error'}`;
        if (!isReconnect) { // Only remove last device if it's not a reconnection attempt
            ApplicationSettings.remove('lastDeviceUUID');
            // If it's an initial connection attempt and it fails, go back to disconnected mode
            currentMode.value = 'disconnected';
            isReconnecting.value = false; // Ensure reconnection state is reset on hard failure
            reconnectAttempts.value = 0; // Reset attempts
        } else if (currentMode.value === 'list') { // If it's a reconnection attempt and fails, try again
            attemptReconnect(device);
        } else {
            // If it's a reconnection attempt but not in list mode (e.g., failed initial connect and then tried reconnecting)
            currentMode.value = 'disconnected';
            isReconnecting.value = false; // Ensure reconnection state is reset on hard failure
            reconnectAttempts.value = 0; // Reset attempts
        }
    }
};

const listPairedDevices = async () => {
    try {
        const devices = await deviceAPI.listPairedDevices();
        if (devices.length > 0) {
            reconnectLast(); // Try to reconnect to last device after listing
            discoveredDevices.value.length = 0;
            devices.forEach(d => discoveredDevices.value.push(d));
            statusMessage.value = `Found ${devices.length} paired devices. Tap one to connect.`;
        } else {
            statusMessage.value = 'No paired devices found.';
            discoveredDevices.value = [];
        }
    } catch (err) {
        console.error('Error listing paired devices:', err);
        alert('Error listing paired devices: ' + err.message);
    }
};

const startScan = async () => {
    isScanning.value = true;
    discoveredDevices.value = [];
    statusMessage.value = 'Scanning for devices...';
    try {
        await deviceAPI.requestPermissions();
        const isEnabled = await deviceAPI.isBluetoothEnabled();
        if (!isEnabled) {
            alert('Bluetooth is not enabled.');
            isScanning.value = false;
            return;
        }
        await deviceAPI.startScan((peripheral) => {
            const existing = discoveredDevices.value.find(d => d.UUID === peripheral.UUID);
            if (!existing) {
                discoveredDevices.value.push(peripheral);
            }
        });
        statusMessage.value = `Scan complete. Found ${discoveredDevices.value.length} devices.`;
        reconnectLast(); // Try to reconnect to last device after scan
    } catch (err) {
        console.error(`Error during scan: ${err}`);
        statusMessage.value = `Scan failed: ${err.message}`;
    } finally {
        isScanning.value = false;
    }
};

const onAddNewPassword = () => {
    $navigateTo(PassEditPage, {
        transition: {
            name: 'slideRight',
            duration: 150,
            curve: 'easeOut'
        },
        context: {
            propsData: {
                passwordEntry: {
                    name: '',
                    layout: 0,
                    uid: passwordStore.entries.length.toString()
                }
            }
        }
    });
};

const onEditPassword = (entry: PasswordEntry) => {
    $navigateTo(PassEditPage, {
        transition: {
            name: 'slideRight',
            duration: 150,
            curve: 'easeOut'
        },
        context: {
            propsData: {
                passwordEntry: entry
            }
        }
    });
};

const onSettings = () => {
    $navigateTo(Settings, {
        transition: {
            name: 'slideLeft',
            duration: 150,
            curve: 'easeOut'
        }
    });
};

const onNavigatedTo = () => {
    // When navigating back to this page, refresh the password list if we are in list mode.
    if (currentMode.value === 'list') {
        loadPasswordList();
    }
};
</script>


<style>
    .action-bar { background-color: #4F46E5; color: white; }
    .page-container { padding: 16; }
    .button-grid { margin-bottom: 16; }
    .btn { border-radius: 8; font-size: 16; padding: 12; }
    .btn-primary { background-color: #4F46E5; color: white; margin-right: 8; }
    .btn-secondary { background-color: #6B7280; color: white; margin-left: 8; }
    .status-label { font-size: 16; text-align: center; color: #6B7280; margin-bottom: 16; }
    .list-container { border-width: 1; border-color: #E5E7EB; border-radius: 8; }
    .list-item {
        padding: 16;
        border-bottom-width: 1;
        border-bottom-color: #E5E7EB;
        animation-name: fadeIn;
        animation-duration: 0.5s;
        animation-fill-mode: forwards;
    }
    .list-item-name { font-size: 18; font-weight: bold; color: #111827; }
    .list-item-uuid { font-size: 14; color: #6B7280; }
    .list-item.selected { background-color: #E0E7FF; }
    .type-button { margin-bottom: 16; }
    .advanced-options-container { margin-top: 8; padding: 0; }
    .advanced-options-content {
        margin-top: 16;
        transition: all 0.3s ease-in-out;
        transform: scaleY(1);
        transform-origin: top;
        opacity: 1;
    }
    .advanced-options-content-hidden {
        transform: scaleY(0);
        transform-origin: top;
        opacity: 0;
        height: 0;
        margin-top: 0;
    }
    .option-label { font-size: 16; font-weight: bold; margin-bottom: 8; color: #111827; }
    .option-switch { margin-bottom: 16; }
    .action-buttons-container { margin-top: 16; margin-bottom: 16; }
    .icon-button { font-size: 24; padding: 8; width: 50; height: 50; border-radius: 25; text-align: center; vertical-align: center; }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
</style>
