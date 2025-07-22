import { Bluetooth, Peripheral } from '@nativescript-community/ble';
import { ApplicationSettings, isAndroid, Device } from '@nativescript/core';
import { check, request } from '@nativescript-community/perms';

import { LAST_DEVICE_KEY } from '../settings';

// --- Nordic UART Service (NUS) ---
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write
const NUS_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notifications

interface Command {
    cmd: string;
    [key: string]: any;
}

export class BLEBackend {
    private bluetooth: Bluetooth;
    private peripheral: Peripheral | null = null;
    private responseResolver: ((value: string | PromiseLike<string>) => void) | null = null;
    private responseRejecter: ((reason?: any) => void) | null = null;

    // --- State for chunked response handling ---
    private responseBuffer = '';
    private totalChunks = 0;
    private chunksReceived = 0;
    private isAwaitingHeader = true;
    private pendingCommandsQueue: Array<() => Promise<string>> = [];
    private isProcessingCommand = false;

    private async processCommandQueue(): Promise<void> {
        if (this.isProcessingCommand || this.pendingCommandsQueue.length === 0) {
            return;
        }

        this.isProcessingCommand = true;
        try {
            const nextCommand = this.pendingCommandsQueue.shift()!;
            await this.sleep(200); // Small delay to prevent overwhelming the device
            await nextCommand();
        } finally {
            this.isProcessingCommand = false;
            // Process next command if any
            if (this.pendingCommandsQueue.length > 0) {
                await this.processCommandQueue();
            }
        }
    }

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
                console.log(`[BLEBackend] Connected and saved last device: ${p.UUID}`);
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

    sendCommand(command: object, timeout = 10000): Promise<string> {

        return new Promise<string>((resolveQueue, rejectQueue) => {
            // Create a function that will execute the actual command
            const executeCommand = async (): Promise<string> => {
                console.log(`[BLEBackend] Sending command: ${JSON.stringify(command)}`);
                if (!this.peripheral) {
                    throw new Error("Not connected to a device.");
                }

                return new Promise(async (resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        reject(new Error(`Command timed out after ${timeout}ms`));
                    }, timeout);

                    this.responseResolver = (value) => {
                        clearTimeout(timeoutId);
                        resolve(value);
                    };
                    this.responseRejecter = (reason) => {
                        clearTimeout(timeoutId);
                        reject(reason);
                    };

                    this.isAwaitingHeader = true;
                    this.responseBuffer = '';
                    this.totalChunks = 0;
                    this.chunksReceived = 0;

                    try {
                        await this.bluetooth.startNotifying({
                            peripheralUUID: this.peripheral!.UUID,
                            serviceUUID: NUS_SERVICE_UUID,
                            characteristicUUID: NUS_RX_CHARACTERISTIC_UUID,
                            onNotify: ({ value }) => this.handleNotification(value)
                        });

                        const cmdString = JSON.stringify(command);
                        if ((command as Command).cmd === 'restore') {
                            await this.chunkAndSend(cmdString);
                        } else {
                            await this.bluetooth.write({
                                peripheralUUID: this.peripheral!.UUID,
                                serviceUUID: NUS_SERVICE_UUID,
                                characteristicUUID: NUS_TX_CHARACTERISTIC_UUID,
                                value: new TextEncoder().encode(cmdString)
                            });
                        }
                    } catch (error) {
                        this.responseRejecter(error);
                    }
                });
            }

            // Add the command to the queue
            this.pendingCommandsQueue.push(async () => {
                try {
                    const result = await executeCommand();
                    resolveQueue(result);
                    return result;
                } catch (error) {
                    rejectQueue(error);
                    throw error;
                }
            });

            // Start processing the queue
            this.processCommandQueue();
        });
    }

    public handleNotification(value: ArrayBuffer) {
        const chunkText = new TextDecoder().decode(value);
        if (this.isAwaitingHeader) {
            const headerMatch = chunkText.match(/^(\d+),(\d+),(\d+)\n/);
            if (headerMatch) {
                this.isAwaitingHeader = false;
                const [, totalSize, numChunks, chunkSize] = headerMatch.map(Number);
                this.totalChunks = numChunks;
                this.responseBuffer = chunkText.substring(headerMatch[0].length);
                this.chunksReceived = 1;

                if (this.totalChunks === 1) {
                    this.processFinalResponse(this.responseBuffer);
                }
            } else {
                this.isAwaitingHeader = false;
                this.processFinalResponse(chunkText);
            }
        } else {
            this.responseBuffer += chunkText;
            this.chunksReceived++;
            if (this.chunksReceived >= this.totalChunks) {
                this.processFinalResponse(this.responseBuffer);
            }
        }
    }

    private async chunkAndSend(data: string): Promise<void> {
        const mtu = this.peripheral?.mtu || 20; // Default to 20 if MTU is not available
        const chunkSize = mtu - 3; // 3 bytes for BLE headers

        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.substring(i, i + chunkSize);
            const dataChunk = new TextEncoder().encode(chunk);

            await this.bluetooth.write({
                peripheralUUID: this.peripheral!.UUID,
                serviceUUID: NUS_SERVICE_UUID,
                characteristicUUID: NUS_TX_CHARACTERISTIC_UUID,
                value: dataChunk
            });
            await this.sleep(50); // Small delay to prevent overwhelming the device
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
}
