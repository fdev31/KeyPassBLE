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
    private responseTimeoutId: any | null = null;
    private _currentResponseType: 'json' | 'text' = 'json';
    private _isRestoring: boolean = false;

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
            await this.sleep(50); // Small delay to prevent overwhelming the device
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

    stopScan(): Promise<void> {
        return this.bluetooth.stopScanning();
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

    sendCommand(command: object, timeout = 10000, responseType: 'json' | 'text' = 'json'): Promise<string> {
        this._currentResponseType = responseType;

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
                        const cmdString = JSON.stringify(command);
                        await this.bluetooth.startNotifying({
                            peripheralUUID: this.peripheral!.UUID,
                            serviceUUID: NUS_SERVICE_UUID,
                            characteristicUUID: NUS_RX_CHARACTERISTIC_UUID,
                            onNotify: ({ value }) => this.handleNotification(value)
                        });
                        await this.bluetooth.write({
                            peripheralUUID: this.peripheral!.UUID,
                            serviceUUID: NUS_SERVICE_UUID,
                            characteristicUUID: NUS_TX_CHARACTERISTIC_UUID,
                            value: new TextEncoder().encode(cmdString)
                        });
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
        if (this._isRestoring) {
            console.log(`[BLEBackend] Ignoring notification during restore operation.`);
            return;
        }

        if (this.responseTimeoutId) {
            clearTimeout(this.responseTimeoutId);
        }

        const chunkText = new TextDecoder().decode(value);

        if (this.isAwaitingHeader) {
            const headerMatch = chunkText.match(/^(\d+),(\d+),(\d+)\n/);
            if (headerMatch) {
                this.isAwaitingHeader = false;
                const [, totalSize, numChunks, chunkSize] = headerMatch.map(Number);
                this.totalChunks = numChunks;
                this.responseBuffer = chunkText.substring(headerMatch[0].length);
                this.chunksReceived = 1;
            } else {
                // This case should ideally not happen if the device always sends a header.
                // If it does, we treat the first chunk as data and proceed.
                this.isAwaitingHeader = false;
                this.responseBuffer += chunkText;
                this.chunksReceived = 1;
            }
        } else {
            this.responseBuffer += chunkText;
            this.chunksReceived++;
        }

        // Set a timeout to process the response if no more chunks arrive
        this.responseTimeoutId = setTimeout(() => {
            this.processFinalResponse(this.responseBuffer);
        }, 200);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private processFinalResponse(response: string) {
        if (this.responseTimeoutId) {
            clearTimeout(this.responseTimeoutId);
            this.responseTimeoutId = null;
        }
        console.log(`[BLEBackend] Final response before trim: "${response}"`);
        const trimmedResponse = response.trim();
        if (this.responseResolver) {
            const trimmedResponse = response.trim();
            if (this._currentResponseType === 'json') {
                try {
                    const jsonResponse = JSON.parse(trimmedResponse);
                    this.responseResolver(jsonResponse);
                } catch (e: any) {
                    console.error(`[BLEBackend] Error parsing final JSON response: ${e.message}. Raw response: "${trimmedResponse}"`);
                    if (this.responseRejecter) {
                        this.responseRejecter(new Error(`Failed to parse JSON response: ${e.message}`));
                    }
                }
            } else { // responseType is 'text'
                this.responseResolver(trimmedResponse);
            }
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
        this.responseTimeoutId = null;
        this._currentResponseType = 'json';
    }
}
