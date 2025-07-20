<template>
    <Page>
        <ActionBar title="NUS BLE Scanner"></ActionBar>
        <StackLayout>
            <Button text="Scan for Nordic UART Devices" @tap="startScan" :isEnabled="!isScanning" class="m-4 px-4 py-2 bg-blue-500 text-white rounded-lg"></Button>
            <Label :text="statusMessage" textWrap="true" class="text-center my-2 text-gray-500"></Label>
            <ListView for="device in discoveredDevices" class="border-t border-gray-200">
                <v-template>
                    <StackLayout class="p-4 border-b border-gray-200">
                        <Label :text="device.name || 'Unknown Device'" class="text-lg font-bold"></Label>
                        <Label :text="device.UUID" class="text-sm text-gray-500"></Label>
                    </StackLayout>
                </v-template>
            </ListView>
        </StackLayout>
    </Page>
</template>

<script lang="ts" setup>
import { ref } from 'nativescript-vue';
import { Bluetooth, Peripheral } from '@nativescript-community/ble';
import { isAndroid, Device } from '@nativescript/core';
import { check, request } from '@nativescript-community/perms';

// Nordic UART Service (NUS) UUID
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

const bluetooth = new Bluetooth();
const isScanning = ref(false);
const discoveredDevices = ref<Peripheral[]>([]);
const statusMessage = ref('Tap the button to start scanning.');

const requestPermissions = async () => {
    if (!isAndroid) {
        return true;
    }

    if (parseInt(Device.sdkVersion, 10) >= 31) { // Android 12+
        // Request permissions one by one to avoid the array conversion error
        const scanResult = await check('bluetoothScan');
        if (scanResult[0] !== 'authorized') {
            await request('bluetoothScan');
        }

        const connectResult = await check('bluetoothConnect');
        if (connectResult[0] !== 'authorized') {
            await request('bluetoothConnect');
        }

    } else { // Android 11 and below
        const locationResult = await check('location');
        if (locationResult[0] !== 'authorized') {
            await request('location');
        }
    }
    return true;
};

const startScan = async () => {
    try {
        await requestPermissions();

        const isEnabled = await bluetooth.isBluetoothEnabled();
        if (!isEnabled) {
            alert('Bluetooth is not enabled. Please enable it.');
            return;
        }

        discoveredDevices.value = [];
        isScanning.value = true;
        statusMessage.value = 'Scanning for devices...';

        await bluetooth.startScanning({
            serviceUUIDs: [], // Use an empty array to avoid a potential plugin crash
            seconds: 5,
            onDiscovered: (peripheral: Peripheral) => {
                // Manually filter for the NUS service UUID in the advertisement data
                const services = peripheral.advertismentData?.services || [];
                if (services.includes(NUS_SERVICE_UUID)) {
                    if (!discoveredDevices.value.some(d => d.UUID === peripheral.UUID)) {
                        discoveredDevices.value.push(peripheral);
                    }
                }
            },
        });

        isScanning.value = false;
        statusMessage.value = `Scan complete. Found ${discoveredDevices.value.length} NUS devices.`;

    } catch (err) {
        isScanning.value = false;
        statusMessage.value = 'Error while scanning.';
        console.error('Error while scanning for BLE devices:', err);
        alert({
            title: 'Scanning Error',
            message: err.message,
            okButtonText: 'OK',
        });
    }
};
</script>