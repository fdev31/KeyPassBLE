<template>
    <Page>
        <ActionBar title="KeyPass Connector" class="action-bar"></ActionBar>
        <GridLayout rows="auto, auto, *" class="page-container">

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

        </GridLayout>
    </Page>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'nativescript-vue';
import { Bluetooth, Peripheral } from '@nativescript-community/ble';
import { isAndroid, Device, ApplicationSettings, Dialogs } from '@nativescript/core';
import { check, request } from '@nativescript-community/perms';

// --- Storage Keys ---
const LAST_DEVICE_KEY = 'lastDeviceUUID';
const PASSPHRASE_KEY = 'passphrase';

// --- Nordic UART Service (NUS) ---
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write
const NUS_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notifications

const bluetooth = new Bluetooth();
const isScanning = ref(false);
const discoveredDevices = ref<Partial<Peripheral>[]>([]);
const statusMessage = ref('App started. Loading...');

// --- State for chunked response handling ---
let responseBuffer = '';
let totalChunks = 0;
let chunksReceived = 0;
let isAwaitingHeader = true;

onMounted(() => {
    const lastDeviceUUID = ApplicationSettings.getString(LAST_DEVICE_KEY);
    if (lastDeviceUUID) {
        statusMessage.value = `Found last device. Connecting...`;
        setTimeout(() => connectToDevice({ UUID: lastDeviceUUID, name: 'Last Device' }), 500);
    } else {
        statusMessage.value = 'No last device found. Please select one.';
    }
});

const processFinalResponse = (response: string) => {
    console.log(`Processing final response: ${response}`);
    statusMessage.value = `Device Response: ${response.trim()}`;
    isAwaitingHeader = true;
    responseBuffer = '';
    totalChunks = 0;
    chunksReceived = 0;
};

const authenticateDevice = async (peripheral: Peripheral) => {
    try {
        let passphrase = ApplicationSettings.getString(PASSPHRASE_KEY);
        if (!passphrase) {
            const result = await Dialogs.prompt({
                title: "Enter Passphrase",
                message: "Please enter the passphrase for your device.",
                okButtonText: "Save",
                cancelButtonText: "Cancel",
                inputType: "password"
            });

            if (result.result && result.text) {
                passphrase = result.text;
                ApplicationSettings.setString(PASSPHRASE_KEY, passphrase);
            } else {
                statusMessage.value = 'Authentication cancelled.';
                bluetooth.disconnect({ UUID: peripheral.UUID });
                return;
            }
        }

        statusMessage.value = 'Authenticating...';
        isAwaitingHeader = true;
        responseBuffer = '';
        totalChunks = 0;
        chunksReceived = 0;

        await bluetooth.startNotifying({
            peripheralUUID: peripheral.UUID,
            serviceUUID: NUS_SERVICE_UUID,
            characteristicUUID: NUS_RX_CHARACTERISTIC_UUID,
            onNotify: ({ value }) => {
                const chunkText = new TextDecoder().decode(value);
                if (isAwaitingHeader) {
                    isAwaitingHeader = false;
                    const headerParts = chunkText.split(',').map(Number);
                    if (headerParts.length === 3 && !headerParts.some(isNaN)) {
                        const [size, numChunks, chunkSize] = headerParts;
                        totalChunks = numChunks;
                        chunksReceived = 0;
                        responseBuffer = '';
                        statusMessage.value = `Receiving ${numChunks} chunks...`;
                    } else {
                        processFinalResponse(chunkText);
                    }
                } else {
                    responseBuffer += chunkText;
                    chunksReceived++;
                    statusMessage.value = `Receiving chunk ${chunksReceived} of ${totalChunks}...`;
                    if (chunksReceived === totalChunks) {
                        processFinalResponse(responseBuffer);
                    }
                }
            }
        });

        const command = JSON.stringify({ cmd: "passphrase", p: passphrase });
        // FIX: Pass the Uint8Array directly, not the .buffer
        const data = new TextEncoder().encode(command);

        await bluetooth.write({
            peripheralUUID: peripheral.UUID,
            serviceUUID: NUS_SERVICE_UUID,
            characteristicUUID: NUS_TX_CHARACTERISTIC_UUID,
            value: data
        });

    } catch (err) {
        console.error(`Authentication failed: ${err}`);
        statusMessage.value = `Authentication failed: ${err.message}`;
    }
};

const connectToDevice = async (device: Partial<Peripheral>) => {
    try {
        await requestPermissions();
        const isEnabled = await bluetooth.isBluetoothEnabled();
        if (!isEnabled) {
            alert('Bluetooth is not enabled.');
            return;
        }

        statusMessage.value = `Connecting to ${device.name || device.UUID}...`;

        await bluetooth.connect({
            UUID: device.UUID,
            onConnected: (peripheral: Peripheral) => {
                console.log(`Connected to ${peripheral.UUID}`);
                statusMessage.value = `Connected to ${peripheral.name}!`;
                ApplicationSettings.setString(LAST_DEVICE_KEY, peripheral.UUID);
                // Add a small delay before authenticating
                setTimeout(() => authenticateDevice(peripheral), 500);
            },
            onDisconnected: (peripheral: Peripheral) => {
                console.log(`Disconnected from ${peripheral.UUID}`);
                statusMessage.value = `Disconnected from ${peripheral.name}.`;
            }
        });
    } catch (err) {
        console.error(`Error connecting to device: ${err}`);
        statusMessage.value = `Failed to connect: ${err.message}`;
        ApplicationSettings.remove(LAST_DEVICE_KEY);
    }
};

// --- Other functions (listPairedDevices, startScan, requestPermissions) remain the same ---
const requestPermissions = async () => {
    if (!isAndroid) return true;
    if (parseInt(Device.sdkVersion, 10) >= 31) {
        const scanResult = await check('bluetoothScan');
        if (scanResult[0] !== 'authorized') await request('bluetoothScan');
        const connectResult = await check('bluetoothConnect');
        if (connectResult[0] !== 'authorized') await request('bluetoothConnect');
    } else {
        const locationResult = await check('location');
        if (locationResult[0] !== 'authorized') await request('location');
    }
    return true;
};

const listPairedDevices = async () => {
    if (!isAndroid) {
        alert('This feature is only available on Android.');
        return;
    }
    try {
        await requestPermissions();
        const isEnabled = await bluetooth.isBluetoothEnabled();
        if (!isEnabled) {
            alert('Bluetooth is not enabled.');
            return;
        }

        const adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter();
        if (adapter) {
            const bondedDevices = adapter.getBondedDevices();
            if (bondedDevices && bondedDevices.size() > 0) {
                const devices = [];
                const iterator = bondedDevices.iterator();
                while (iterator.hasNext()) {
                    const device = iterator.next();
                    devices.push({
                        name: device.getName(),
                        UUID: device.getAddress()
                    });
                }

                discoveredDevices.value.length = 0;
                devices.forEach(d => discoveredDevices.value.push(d));
                statusMessage.value = `Found ${devices.length} paired devices. Tap one to connect.`;
            } else {
                statusMessage.value = 'No paired devices found.';
                discoveredDevices.value = [];
            }
        }
    } catch (err) {
        console.error('Error listing paired devices:', err);
        alert('Error listing paired devices: ' + err.message);
    }
};

const startScan = async () => {
    // This function remains the same
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
