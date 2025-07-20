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
import { ref } from 'nativescript-vue';
import { Bluetooth, Peripheral } from '@nativescript-community/ble';
import { isAndroid, Device } from '@nativescript/core';
import { check, request } from '@nativescript-community/perms';

// Nordic UART Service (NUS) UUID
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TARGET_DEVICE_NAME = 'KeyPass';

const bluetooth = new Bluetooth();
const isScanning = ref(false);
const discoveredDevices = ref<Partial<Peripheral>[]>([]);
const statusMessage = ref('Choose a discovery method.');

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

const connectToDevice = async (device: Partial<Peripheral>) => {
    try {
        statusMessage.value = `Connecting to ${device.name || device.UUID}...`;
        console.log(`Attempting to connect to ${device.UUID}`);

        await bluetooth.connect({
            UUID: device.UUID,
            onConnected: (peripheral: Peripheral) => {
                console.log(`Connected to ${peripheral.UUID}`);
                statusMessage.value = `Successfully connected to ${peripheral.name}!`;
            },
            onDisconnected: (peripheral: Peripheral) => {
                console.log(`Disconnected from ${peripheral.UUID}`);
                statusMessage.value = `Disconnected from ${peripheral.name}.`;
            }
        });
    } catch (err) {
        console.error(`Error connecting to device: ${err}`);
        statusMessage.value = `Failed to connect: ${err.message}`;
    }
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
    try {
        await requestPermissions();
        const isEnabled = await bluetooth.isBluetoothEnabled();
        if (!isEnabled) {
            alert('Bluetooth is not enabled.');
            return;
        }

        discoveredDevices.value = [];
        isScanning.value = true;
        statusMessage.value = 'Scanning for advertising devices...';
        let totalDiscovered = 0;

        await bluetooth.startScanning({
            serviceUUIDs: [],
            seconds: 5,
            onDiscovered: (peripheral: Peripheral) => {
                totalDiscovered++;
                const services = (peripheral.advertismentData?.services || []).map(s => s.toLowerCase());
                const hasNusService = services.includes(NUS_SERVICE_UUID);
                const hasTargetName = peripheral.name === TARGET_DEVICE_NAME || peripheral.localName === TARGET_DEVICE_NAME;

                if (hasNusService || hasTargetName) {
                    if (!discoveredDevices.value.some(d => d.UUID === peripheral.UUID)) {
                        discoveredDevices.value.push(peripheral);
                    }
                }
            },
        });

        isScanning.value = false;
        statusMessage.value = `Scan complete. Found ${totalDiscovered} total devices and ${discoveredDevices.value.length} matching devices.`;
    } catch (err) {
        isScanning.value = false;
        statusMessage.value = 'Error while scanning.';
        console.error('Error while scanning for BLE devices:', err);
        alert({ title: 'Scanning Error', message: err.message, okButtonText: 'OK' });
    }
};
</script>

<style>
    .action-bar {
        background-color: #4F46E5;
        color: white;
    }
    .page-container {
        padding: 16;
    }
    .button-grid {
        margin-bottom: 16;
    }
    .btn {
        border-radius: 8;
        font-size: 16;
        padding: 12;
    }
    .btn-primary {
        background-color: #4F46E5;
        color: white;
        margin-right: 8;
    }
    .btn-secondary {
        background-color: #6B7280;
        color: white;
        margin-left: 8;
    }
    .status-label {
        font-size: 16;
        text-align: center;
        color: #6B7280;
        margin-bottom: 16;
    }
    .list-container {
        border-width: 1;
        border-color: #E5E7EB;
        border-radius: 8;
    }
    .list-item {
        padding: 16;
        border-bottom-width: 1;
        border-bottom-color: #E5E7EB;
    }
    .list-item-name {
        font-size: 18;
        font-weight: bold;
        color: #111827;
    }
    .list-item-uuid {
        font-size: 14;
        color: #6B7280;
    }
</style>