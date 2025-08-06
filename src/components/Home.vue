<template>
    <Page @navigatedTo="onNavigatedTo">
        <ActionBar :title="actionBarTitle" class="action-bar">
            <ActionItem @tap="onSettings" ios:position="right" android:position="actionBar">
                <Label text="⚙️" fontSize="24" verticalAlignment="center" padding="0 10 0 0" />
            </ActionItem>
        </ActionBar>
        <GridLayout rows="auto, *, auto" class="page-container">

        <!-- Home View (Disconnected/Connecting/List Modes) -->

            <!-- Disconnected Mode -->
            <template v-if="currentMode === 'disconnected' || currentMode === 'connecting'">
                <GridLayout row="0" columns="*,*" class="button-grid">
                    <Button col="0" :text="isScanning ? L('stop_scan') : L('scan')" @tap="toggleScan" class="btn btn-primary"></Button>
                    <Button col="1" :text="L('paired_devices')" @tap="listPairedDevices" :isEnabled="!isScanning" class="btn btn-secondary"></Button>
                </GridLayout>

                <ScrollView row="1" class="list-container">
                    <StackLayout>
                        <StackLayout v-for="device in discoveredDevices" :key="device.UUID" @tap="connectToDevice(device)" class="list-item">
                            <Label :text="device.name || L('unknown_device')" class="list-item-name"></Label>
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
                        <Label v-if="passwordStore.entries.length === 0" :text="L('no_passwords_found')" class="status-label"></Label>
                    </StackLayout>
                </ScrollView>

                <StackLayout row="2">
                    <!-- Action Buttons -->
                    <GridLayout columns="*, *" class="action-buttons-container">
                        <Button col="0" text="➕" @tap="onAddNewPassword" class="btn btn-secondary icon-button"></Button>
                        <Button col="1" text="📎" @tap="openAdvancedOptions" class="btn btn-primary icon-button"></Button>
                    </GridLayout>
                </StackLayout>
            </template>

    </GridLayout>
    </Page>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed, watch, $navigateTo, $showModal } from 'nativescript-vue';
import { connectionManager, ConnectionState } from '../services/connection-manager';
import { Peripheral } from '@nativescript-community/ble';
import { ApplicationSettings, Dialogs } from '@nativescript/core';
import { deviceAPI } from '../services/device-api';
import { PASSPHRASE_KEY, LAST_DEVICE_KEY } from '../services/settings';
import Settings from './Settings.vue';
import PassEditPage from './PassEditPage.vue';
import AdvancedOptions from './AdvancedOptions.vue';
import { passwordStore, appStore } from '../services/store';
import { localize as L } from '@nativescript/localize';
import { SecureStorage } from '@heywhy/ns-secure-storage';

const secureStorage = new SecureStorage();

interface PasswordEntry {
    uid: string;
    name: string;
}

const isScanning = ref(connectionManager.isScanning);
const discoveredDevices = ref<Peripheral[]>(connectionManager.discoveredPeripherals);
const statusMessage = ref(L('app_started_loading'));
const currentMode = ref<'disconnected' | 'connecting' | 'list'>('disconnected');
const selectedPasswordEntry = ref<PasswordEntry | null>(null);
const startupLogicHasRun = ref(false);

// Advanced Options
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
            return L('keypass_connector');
        case 'list':
            return L('your_passwords');
        default:
            return L('keypass');
    }
});

const runStartupLogic = async () => {
    if (startupLogicHasRun.value) {
        return;
    }
    startupLogicHasRun.value = true;

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

    // Auto-connect to the last device
    const lastDeviceUUID = ApplicationSettings.getString(LAST_DEVICE_KEY);
    if (lastDeviceUUID) {
        try {
            await connectToDevice({ UUID: lastDeviceUUID });
        } catch (e) {
            console.log("Initial connection failed, will rely on reconnect timer.");
            // Set as complete so the splash screen hides
            appStore.isInitialLoadComplete.value = true;
        }
    } else {
        // No last device, so we are done with the initial load.
        appStore.isInitialLoadComplete.value = true;
    }
};

onMounted(() => {
    console.log('Home.vue: onMounted');
    connectionManager.on('propertyChange', (args) => {
        if (args.propertyName === 'state') {
            handleConnectionStateChange(args.value);
        } else if (args.propertyName === 'isScanning') {
            isScanning.value = args.value;
            statusMessage.value = args.value ? L('scanning_for_devices') : L('scan_stopped');
        } else if (args.propertyName === 'discoveredPeripherals') {
            // Create a new array to ensure Vue's reactivity is triggered
            discoveredDevices.value = [...args.value];
        }
    });
    runStartupLogic();
});

const onNavigatedTo = () => {
    // When navigating back to this page, refresh the password list if we are in list mode.
    if (currentMode.value === 'list') {
        loadPasswordList(false);
    }
};

const handleConnectionStateChange = (newState: ConnectionState) => {
    switch (newState) {
        case ConnectionState.DISCONNECTED:
            currentMode.value = 'disconnected';
            statusMessage.value = L('disconnected_select_device');
            selectedPasswordEntry.value = null;
            break;
        case ConnectionState.CONNECTING:
            currentMode.value = 'connecting';
            statusMessage.value = L('connecting');
            break;
        case ConnectionState.CONNECTED:
            statusMessage.value = `${L('connected_to')} ${connectionManager.connectedPeripheral?.name}!`;
            authenticateAndLoadList();
            break;
    }
};

const askPassPhrase = async () : Promise<string> => {
    let passphrase = await secureStorage.get({ key: PASSPHRASE_KEY }) || '';
    if (!passphrase) {
        const result = await Dialogs.prompt({
            title: L('enter_passphrase_title'),
            message: L('enter_passphrase_message'),
            okButtonText: L('save'),
            cancelButtonText: L('cancel'),
            inputType: "password"
        });

        if (result.result && result.text) {
            passphrase = result.text;
            await secureStorage.set({ key: PASSPHRASE_KEY, value: passphrase });
        } else {
            connectionManager.disconnect();
            console.error("No text was entered");
            return;
        }
    }
    return passphrase;
}

const authenticateAndLoadList = async () => {
    await askPassPhrase();
    try {
        const authResponse = await deviceAPI.authenticate(await askPassPhrase());
        statusMessage.value = authResponse.m;
        currentMode.value = 'list';
        setTimeout(() => {
            statusMessage.value = L('loading_password_list');
            loadPasswordList(true);
        }, 600);
    } catch (authErr) {
        console.error(`Authentication failed: ${authErr}`);
        statusMessage.value = `${L('authentication_failed')} ${authErr.message}`;
        connectionManager.disconnect();
    } finally {
        appStore.isInitialLoadComplete.value = true;
    }
};


watch(endWithReturn, (newValue) => {
    ApplicationSettings.setBoolean(SETTING_END_WITH_RETURN, newValue);
});

watch(useLayoutOverride, (newValue) => {
    ApplicationSettings.setBoolean(SETTING_USE_LAYOUT_OVERRIDE, newValue);
});

watch(selectedLayout, (newValue) => {
    ApplicationSettings.setNumber(SETTING_SELECTED_LAYOUT, newValue);
});

const loadPasswordList = async (forced) => {
    if (!forced && passwordStore.entries.length > 0) {
        statusMessage.value = L('using_cached_passwords', passwordStore.entries.length);
        return; // Use cached passwords if available
    }
    statusMessage.value = L('loading_passwords');
    try {
        const response = await deviceAPI.list();
        const parsedResponse = response;
        const parsedList: PasswordEntry[] = parsedResponse.passwords;
        passwordStore.entriesRef.value = parsedList;
        ApplicationSettings.setString('cachedPasswords', JSON.stringify(parsedList));
        statusMessage.value = L('loaded_passwords', parsedList.length);
    } catch (err) {
        console.error(`Failed to load password list: ${err}`);
        statusMessage.value = `${L('failed_to_load_passwords')} ${err.message}`;
    }
};

const onPasswordSelected = async (entry: PasswordEntry) => {
    selectedPasswordEntry.value = entry;
    statusMessage.value = L('selected_password_typing', entry.name, entry.uid);
    await typeSelectedPassword();
};

const typeSelectedPassword = async () => {
    if (!selectedPasswordEntry.value) {
        alert(L('no_password_selected'));
        return;
    }

    statusMessage.value = L('typing_password', selectedPasswordEntry.value.name);
    try {
        const layoutToUse = useLayoutOverride.value ? selectedLayout.value - 1: undefined;
        const response = await deviceAPI.typePass(
            selectedPasswordEntry.value.uid,
            layoutToUse,
            endWithReturn.value
        );
        statusMessage.value = response.m;
    } catch (err) {
        console.error(`Failed to type password: ${err}`);
        statusMessage.value = `${L('failed_to_type_password')} ${err.message}`;
    }
};

const connectToDevice = async (device: Partial<Peripheral>) => {
    if (isScanning.value) {
        await connectionManager.stopScan();
    }
    await askPassPhrase();
    console.log("Passphrase is", await secureStorage.get({ key: PASSPHRASE_KEY }));
    await connectionManager.connect(device as Peripheral);
};

const listPairedDevices = async () => {
    try {
        const devices = await deviceAPI.listPairedDevices();
        if (devices.length > 0) {
            discoveredDevices.value.length = 0;
            devices.forEach(d => discoveredDevices.value.push(d));
            statusMessage.value = L('found_paired_devices', devices.length);
        } else {
            statusMessage.value = L('no_paired_devices_found');
            discoveredDevices.value = [];
        }
    } catch (err) {
        console.error('Error listing paired devices:', err);
        alert(`${L('error_listing_paired_devices')} ${err.message}`);
    }
};

const toggleScan = async () => {
    if (isScanning.value) {
        await connectionManager.stopScan();
    } else {
        await deviceAPI.ensureConnectivity();
        await connectionManager.startScan();
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

const openAdvancedOptions = async () => {
    const result = await $showModal(AdvancedOptions, {
        props: {
            endWithReturn: endWithReturn.value,
            useLayoutOverride: useLayoutOverride.value,
            selectedLayout: selectedLayout.value
        }
    });

    if (result) {
        endWithReturn.value = result.endWithReturn;
        useLayoutOverride.value = result.useLayoutOverride;
        selectedLayout.value = result.selectedLayout;
    }
};
</script>


<style>
    .action-bar { background-color: #4F46E5; color: white; }
    .page-container { padding: 16; }
    .button-grid { margin-bottom: 16; }
    .btn { border-radius: 8; font-size: 16; padding: 12; }
    .btn-primary { background-color: #4F46E5; color: white; margin-right: 8; }
    .btn-secondary { background-color: #b2b2b0; color: white; margin-left: 8; }
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
    .option-label { font-size: 16; font-weight: bold; margin-bottom: 8; color: #111827; }
    .option-switch { margin-bottom: 16; }
    .action-buttons-container { margin-top: 16; margin-bottom: 16; }
    .icon-button { font-size: 24; padding: 8; width: 50; height: 50; border-radius: 25; text-align: center; vertical-align: center; }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .slide-enter-active, .slide-leave-active {
        transition: all 0.3s ease;
    }
    .slide-enter-from, .slide-leave-to {
        transform: translateY(-20px);
        opacity: 0;
    }
</style>
