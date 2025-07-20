<template>
    <Page>
        <ActionBar :title="actionBarTitle" class="action-bar">
            <NavigationButton v-if="currentMode === 'list'" text="Back" @tap="disconnectAndGoHome" />
        </ActionBar>
        <GridLayout rows="auto, auto, *" class="page-container">

            <!-- Disconnected Mode -->
            <template v-if="currentMode === 'disconnected' || currentMode === 'connecting'">
                <GridLayout row="0" columns="*,*" class="button-grid">
                    <Button col="0" text="Scan" @tap="startScan" :isEnabled="!isScanning" class="btn btn-primary"></Button>
                    <Button col="1" text="Paired Devices" @tap="listPairedDevices" :isEnabled="!isScanning" class="btn btn-secondary"></Button>
                </GridLayout>

                <Label row="1" :text="statusMessage" textWrap="true" class="status-label"></Label>

                <ScrollView row="2" class="list-container">
                    <StackLayout>
                        <StackLayout v-for="device in discoveredDevices" :key="device.UUID" @tap="connectToDevice(device)" class="list-item">
                            <Label :text="device.name || 'Unknown Device'" class="list-item-name"></Label>
                            <Label :text="device.UUID" class="list-item-uuid"></Label>
                        </StackLayout>
                    </StackLayout>
                </ScrollView>
            </template>

            <!-- List Mode -->
            <template v-if="currentMode === 'list'">
                <Label row="0" :text="statusMessage" textWrap="true" class="status-label"></Label>
                <ScrollView row="1" colSpan="2" class="list-container">
                    <StackLayout>
                        <StackLayout v-for="entry in passwordEntries" :key="entry.uid" @tap="onPasswordSelected(entry)" class="list-item">
                            <Label :text="entry.name" class="list-item-name"></Label>
                        </StackLayout>
                        <Label v-if="passwordEntries.length === 0" text="No passwords found." class="status-label"></Label>
                    </StackLayout>
                </ScrollView>
            </template>

        </GridLayout>
    </Page>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed } from 'nativescript-vue';
import { Peripheral } from '@nativescript-community/ble';
import { isAndroid, Device, ApplicationSettings } from '@nativescript/core';
import { DeviceAPI } from '../services/device-api';

interface PasswordEntry {
    uid: string;
    name: string;
}

const deviceAPI = new DeviceAPI();
const isScanning = ref(false);
const discoveredDevices = ref<Partial<Peripheral>[]>([]);
const statusMessage = ref('App started. Loading...');
const currentMode = ref<'disconnected' | 'connecting' | 'list'>('disconnected');
const passwordEntries = ref<PasswordEntry[]>([]);

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

onMounted(() => {
    const lastDeviceUUID = ApplicationSettings.getString('lastDeviceUUID');
    if (lastDeviceUUID) {
        statusMessage.value = `Found last device. Connecting...`;
        currentMode.value = 'connecting';
        setTimeout(() => connectToDevice({ UUID: lastDeviceUUID, name: 'Last Device' }), 500);
    } else {
        statusMessage.value = 'No last device found. Please select one.';
        currentMode.value = 'disconnected';
    }
    // Load cached passwords on startup
    const cachedPasswords = ApplicationSettings.getString('cachedPasswords');
    if (cachedPasswords) {
        try {
            passwordEntries.value = JSON.parse(cachedPasswords);
        } catch (e) {
            console.error("Failed to parse cached passwords:", e);
            ApplicationSettings.remove('cachedPasswords');
        }
    }
});

const disconnectAndGoHome = () => {
    deviceAPI.disconnect();
    currentMode.value = 'disconnected';
    statusMessage.value = 'Disconnected. Please select a device.';
    discoveredDevices.value = [];
};

const loadPasswordList = async () => {
    statusMessage.value = 'Loading passwords...';
    try {
        const response = await deviceAPI.list();
        console.log("Raw response from deviceAPI.list():", response);
        const parsedList: PasswordEntry[] = JSON.parse(response);
        console.log("Parsed list:", parsedList);
        passwordEntries.value = parsedList;
        ApplicationSettings.setString('cachedPasswords', JSON.stringify(parsedList));
        statusMessage.value = `Loaded ${parsedList.length} passwords.`;
    } catch (err) {
        console.error(`Failed to load password list: ${err}`);
        statusMessage.value = `Failed to load passwords: ${err.message}`;
    }
};

const onPasswordSelected = (entry: PasswordEntry) => {
    statusMessage.value = `Selected password: ${entry.name} (UID: ${entry.uid})`;
    // In a real app, you'd navigate to a detail view or perform an action here
};

const connectToDevice = async (device: Partial<Peripheral>) => {
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
                try {
                    const authResponse = await deviceAPI.authenticate();
                    statusMessage.value = `Authentication: ${authResponse}`;
                    currentMode.value = 'list';
                    loadPasswordList();
                } catch (authErr) {
                    console.error(`Authentication failed: ${authErr}`);
                    statusMessage.value = `Authentication failed: ${authErr.message}`;
                    disconnectAndGoHome();
                }
            },
            (peripheral: Peripheral) => {
                console.log(`Disconnected from ${peripheral.UUID}`);
                statusMessage.value = `Disconnected from ${peripheral.name}.`;
                disconnectAndGoHome();
            }
        );
    } catch (err) {
        console.error(`Error connecting to device: ${err}`);
        statusMessage.value = `Failed to connect: ${err.message}`;
        ApplicationSettings.remove('lastDeviceUUID');
        currentMode.value = 'disconnected';
    }
};

const listPairedDevices = async () => {
    try {
        const devices = await deviceAPI.listPairedDevices();
        if (devices.length > 0) {
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
    } catch (err) {
        console.error(`Error during scan: ${err}`);
        statusMessage.value = `Scan failed: ${err.message}`;
    } finally {
        isScanning.value = false;
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
    .list-item { padding: 16; border-bottom-width: 1; border-bottom-color: #E5E7EB; }
    .list-item-name { font-size: 18; font-weight: bold; color: #111827; }
    .list-item-uuid { font-size: 14; color: #6B7280; }
</style>
