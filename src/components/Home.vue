<template>
    <Page>
        <ActionBar title="NUS BLE Scanner"></ActionBar>
        <GridLayout rows="auto, auto, *">
            <GridLayout row="0" columns="*,*">
                <Button col="0" text="Scan for BLE Devices" @tap="startScan" :isEnabled="!isScanning"></Button>
                <Button col="1" text="List Paired Devices" @tap="listPairedDevices" :isEnabled="!isScanning"></Button>
            </GridLayout>
            <Label row="1" :text="statusMessage" textWrap="true" class="text-center my-2"></Label>
            <ScrollView row="2">
                <StackLayout>
                    <StackLayout v-for="device in discoveredDevices" :key="device.UUID" class="p-4 border-b-2 border-gray-200">
                        <Label :text="device.name || 'Unknown Device'" class="text-lg font-bold"></Label>
                        <Label :text="device.UUID" class="text-sm"></Label>
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

        console.log('Getting bonded devices using native Android API...');
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

                statusMessage.value = `Found ${devices.length} paired devices.`;
                console.log(`Found ${devices.length} bonded devices.`);
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
                console.log(`Discovered peripheral: ${peripheral.name} (${peripheral.UUID}), Data: ${JSON.stringify(peripheral.advertismentData)}`);
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