import { Bluetooth, Peripheral } from '@nativescript-community/ble';
import { Dialogs, ApplicationSettings, isAndroid, Device } from '@nativescript/core';
import { check, request } from '@nativescript-community/perms';

import { LAST_DEVICE_KEY, PASSPHRASE_KEY } from './settings';

// --- Nordic UART Service (NUS) ---
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write
const NUS_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notifications

class DeviceAPI {
    private bluetooth: Bluetooth;
    private peripheral: Peripheral | null = null;
    private responseResolver: ((value: string | PromiseLike<string>) => void) | null = null;
    private responseRejecter: ((reason?: any) => void) | null = null;

    // --- State for chunked response handling ---
    private responseBuffer = '';
    private totalChunks = 0;
    private chunksReceived = 0;
    private isAwaitingHeader = true;

    constructor() {
        this.bluetooth = new Bluetooth();
    }

    async isBluetoothEnabled(): Promise<boolean> {
        return this.bluetooth.isBluetoothEnabled();
    }

    async requestPermissions(): Promise<boolean> {
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
    }

    startScan(onDeviceDiscovered: (p: Peripheral) => void): Promise<void> {
        return this.bluetooth.startScanning({

            seconds: 4,
            onDiscovered: onDeviceDiscovered
        });
    }

    async listPairedDevices(): Promise<Peripheral[]> {
        if (!isAndroid) {
            return [];
        }
        await this.requestPermissions();
        const isEnabled = await this.isBluetoothEnabled();
        if (!isEnabled) {
            return Promise.reject("Bluetooth is not enabled.");
        }

        const adapter = (global as any).android.bluetooth.BluetoothAdapter.getDefaultAdapter();
        if (adapter) {
            const bondedDevices = adapter.getBondedDevices();
            if (bondedDevices && bondedDevices.size() > 0) {
                const devices: Peripheral[] = [];
                const iterator = bondedDevices.iterator();
                while (iterator.hasNext()) {
                    const device = iterator.next();
                    devices.push({
                        name: device.getName(),
                        UUID: device.getAddress(),
                        // Add other properties if needed, though name and UUID are usually sufficient for listing
                    });
                }
                return devices;
            }
        }
        return [];
    }

    async connect(peripheral: Peripheral, onConnected: (p: Peripheral) => void, onDisconnected: (p: Peripheral) => void): Promise<void> {
        await this.bluetooth.connect({
            UUID: peripheral.UUID,
            onConnected: (p) => {
                this.peripheral = p;
                ApplicationSettings.setString(LAST_DEVICE_KEY, p.UUID);
                console.log(`[DeviceAPI] Connected and saved last device: ${p.UUID}`);
                onConnected(p);
            },
            onDisconnected: (p) => {
                this.peripheral = null;
                onDisconnected(p);
            }
        });
    }

    disconnect() {
        if (this.peripheral) {
            this.bluetooth.disconnect({ UUID: this.peripheral.UUID });
        }
    }

    async authenticate(): Promise<string> {
        if (!this.peripheral) {
            return Promise.reject("Not connected to a device.");
        }

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
                this.disconnect();
                return Promise.reject("Authentication cancelled.");
            }
        }

        return this.passphrase(passphrase);
    }

    private async sendCommand(command: object): Promise<string> {
        console.log(`[DeviceAPI] Sending command: ${JSON.stringify(command)}`);
        if (!this.peripheral) {
            return Promise.reject("Not connected to a device.");
        }

        return new Promise(async (resolve, reject) => {
            this.responseResolver = resolve;
            this.responseRejecter = reject;

            this.isAwaitingHeader = true;
            this.responseBuffer = '';
            this.totalChunks = 0;
            this.chunksReceived = 0;

            await this.bluetooth.startNotifying({
                peripheralUUID: this.peripheral!.UUID,
                serviceUUID: NUS_SERVICE_UUID,
                characteristicUUID: NUS_RX_CHARACTERISTIC_UUID,
                onNotify: ({ value }) => {
                    const chunkText = new TextDecoder().decode(value);
                    if (this.isAwaitingHeader) {
                        const headerMatch = chunkText.match(/^(\d+),(\d+),(\d+)\n$/);
                        if (headerMatch) {
                            this.isAwaitingHeader = false;
                            const [, totalSize, numChunks, chunkSize] = headerMatch.map(Number);
                            this.totalChunks = numChunks;
                            this.responseBuffer = chunkText.substring(headerMatch[0].length); // Start buffer after header
                            this.chunksReceived = this.responseBuffer.length > 0 ? 1 : 0; // If there's data after header, it's the first chunk

                            if (this.totalChunks === 1 && this.chunksReceived === 1) { // Handle single chunk response with header
                                this.processFinalResponse(this.responseBuffer);
                            }
                        } else {
                            // If no header, assume it's a single-chunk response without a header
                            this.isAwaitingHeader = false; // No longer awaiting header
                            this.processFinalResponse(chunkText);
                        }
                    } else {
                        this.responseBuffer += chunkText;
                        this.chunksReceived++;
                        if (this.chunksReceived >= this.totalChunks) { // Use >= to be safe
                            this.processFinalResponse(this.responseBuffer);
                        }
                    }
                }
            });

            const cmdString = JSON.stringify(command);
            const data = new TextEncoder().encode(cmdString);

            if (!this.peripheral) {
                reject("Not connected to a device.");
                return;
            }

            await this.bluetooth.write({
                peripheralUUID: this.peripheral!.UUID,
                serviceUUID: NUS_SERVICE_UUID,
                characteristicUUID: NUS_TX_CHARACTERISTIC_UUID,
                value: data
            });
        });
    }

    private processFinalResponse(response: string) {
        if (this.responseResolver) {
            this.responseResolver(response.trim());
        }
        this.resetResponseHandling();
    }

    private resetResponseHandling() {
        this.isAwaitingHeader = true;
        this.responseBuffer = '';
        this.totalChunks = 0;
        this.chunksReceived = 0;
        this.responseResolver = null;
        this.responseRejecter = null;
    }

    // API Methods
    typeRaw(text: string, layout?: number, ret: boolean = true): Promise<string> {
        const cmd = { cmd: "typeRaw", text, layout, ret: ret ? "true" : "false" };
        return this.sendCommand(cmd);
    }

    typePass(id: number, layout?: number, ret: boolean = true): Promise<string> {
        const cmd = { cmd: "typePass", id, layout, ret: ret ? "true" : "false" };
        return this.sendCommand(cmd);
    }

    fetchPass(id: number): Promise<string> {
        return this.sendCommand({ cmd: "fetchPass", id });
    }

    editPass(id: number, name?: string, password?: string, layout?: number): Promise<string> {
        const cmd: { cmd: string; id: number; name?: string; password?: string; layout?: number } = { cmd: "editPass", id };
        if (name) cmd.name = name;
        if (password) cmd.password = password;
        if (layout) cmd.layout = layout;
        return this.sendCommand(cmd);
    }

    list(): Promise<string> {
        return this.sendCommand({ cmd: "list" });
    }

    reset(): Promise<string> {
        return this.sendCommand({ cmd: "reset" });
    }

    updateWifiPass(newPass: string): Promise<string> {
        return this.sendCommand({ cmd: "updateWifiPass", newPass });
    }

    passphrase(p: string): Promise<string> {
        return this.sendCommand({ cmd: "passphrase", p });
    }

    dump(): Promise<string> {
        return this.sendCommand({ cmd: "dump" });
    }

    restore(data: string): Promise<string> {
        return this.sendCommand({ cmd: "restore", data });
    }
}

export const deviceAPI = new DeviceAPI();
