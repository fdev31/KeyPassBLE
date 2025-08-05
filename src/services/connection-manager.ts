import { Observable, ApplicationSettings } from '@nativescript/core';
import { Peripheral } from '@nativescript-community/ble';
import { deviceAPI } from './device-api';
import { LAST_DEVICE_KEY, PASSPHRASE_KEY } from './settings';
import { SecureStorage } from '@heywhy/ns-secure-storage';

export enum ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
}

class ConnectionManager extends Observable {
    private _state: ConnectionState = ConnectionState.DISCONNECTED;
    private _connectedPeripheral: Peripheral | null = null;
    private _lastConnectedDeviceUUID: string | null = ApplicationSettings.getString(LAST_DEVICE_KEY) || null;
    private isConnecting = false;
    private reconnectTimer: any = null;
    private _isScanning = false;
    public discoveredPeripherals: Peripheral[] = [];
    private secureStorage: SecureStorage;

    constructor() {
        super();
        this.secureStorage = new SecureStorage();
        this.init();
    }

    private async init() {
        await deviceAPI.requestPermissions();
        const bluetoothOk = await deviceAPI.ensureConnectivity();
        if (bluetoothOk) {
            this.startReconnectTimer();
        }
    }

    get state(): ConnectionState {
        return this._state;
    }

    private setState(state: ConnectionState) {
        if (this._state !== state) {
            this._state = state;
            this.notifyPropertyChange('state', state);
        }
    }

    get isScanning(): boolean {
        return this._isScanning;
    }

    private setScanning(isScanning: boolean) {
        if (this._isScanning !== isScanning) {
            this._isScanning = isScanning;
            this.notifyPropertyChange('isScanning', isScanning);
        }
    }

    get connectedPeripheral(): Peripheral | null {
        return this._connectedPeripheral;
    }

    private setConnectedPeripheral(peripheral: Peripheral | null) {
        this._connectedPeripheral = peripheral;
        this.notifyPropertyChange('connectedPeripheral', peripheral);
    }

    async startScan(): Promise<void> {
        if (this.state !== ConnectionState.DISCONNECTED) {
            return;
        }

        const permissionsGranted = await deviceAPI.requestPermissions();
        if (!permissionsGranted) {
            console.log("[ConnectionManager] Bluetooth permissions not granted. Cannot start scan.");
            return;
        }

        const bluetoothOk = await deviceAPI.ensureConnectivity();
        if (!bluetoothOk) {
            return;
        }

        // Stop the reconnect timer when a manual scan is initiated
        this.stopReconnectTimer();
        this.setScanning(true);
        this.discoveredPeripherals = [];
        this.notifyPropertyChange('discoveredPeripherals', []);

        return deviceAPI.startScan((p: Peripheral) => {
            const existingPeripheral = this.discoveredPeripherals.find(
                (existing) => existing.UUID === p.UUID
            );
            if (!existingPeripheral) {
                this.discoveredPeripherals.push(p);
                this.notifyPropertyChange('discoveredPeripherals', this.discoveredPeripherals);
            }
        });
    }

    async stopScan(): Promise<void> {
        await deviceAPI.stopScan();
        this.setScanning(false);
        this.startReconnectTimer();
    }

    async connect(peripheral: Peripheral): Promise<void> {
        if (
            (this.state === ConnectionState.CONNECTED && this._connectedPeripheral?.UUID === peripheral.UUID) ||
            this.isConnecting ||
            this.isScanning
        ) {
            return;
        }

        const bluetoothOk = await deviceAPI.ensureConnectivity();
        if (!bluetoothOk) {
            return;
        }

        this.stopReconnectTimer();
        this.isConnecting = true;
        this.setState(ConnectionState.CONNECTING);

        try {
            await deviceAPI.connect(
                peripheral,
                (p) => this.onConnected(p),
                (p) => this.onDisconnected(p)
            );
        } catch (error) {
            console.error(`[ConnectionManager] Connection error: ${error}`);
            this.setState(ConnectionState.DISCONNECTED);
            this.startReconnectTimer(); // Restart the timer on a failed connection
            throw error; // Re-throw the error to notify the caller
        } finally {
            this.isConnecting = false;
        }
    }

    disconnect(): void {
        if (this.state === ConnectionState.CONNECTED && this._connectedPeripheral) {
            deviceAPI.disconnect();
        }
    }

    private async onConnected(peripheral: Peripheral) {
        this.stopReconnectTimer();
        this.setConnectedPeripheral(peripheral);
        this.setState(ConnectionState.CONNECTED);
        this._lastConnectedDeviceUUID = peripheral.UUID;
        ApplicationSettings.setString(LAST_DEVICE_KEY, peripheral.UUID);
        try {
            const passphrase = (await this.secureStorage.get({ key: PASSPHRASE_KEY }) || '') as string;
            await deviceAPI.authenticate(passphrase);
            console.log(`[ConnectionManager] Authenticated with ${peripheral.UUID}.`);
        } catch (error) {
            console.error(`[ConnectionManager] Authentication failed for ${peripheral.UUID}: ${error}`);
            // Optionally, disconnect or show an error to the user if authentication is critical
            this.disconnect();
            // Re-throw to propagate the error if needed, or handle it gracefully
            throw error;
        }
    }

    private onDisconnected(peripheral: Peripheral) {
        this.setConnectedPeripheral(null);
        this.setState(ConnectionState.DISCONNECTED);
        console.log(`[ConnectionManager] Disconnected from ${peripheral.UUID}.`);
        this.startReconnectTimer();
    }

    private async startBackgroundScan() {
        // Don't start a background scan if already connected or scanning
        if (this.state !== ConnectionState.DISCONNECTED || this.isScanning) {
            return;
        }

        const permissionsGranted = await deviceAPI.requestPermissions();
        if (!permissionsGranted) {
            console.log("[ConnectionManager] Bluetooth permissions not granted. Cannot start background scan.");
            return;
        }

        const bluetoothOk = await deviceAPI.ensureConnectivity();
        if (!bluetoothOk) {
            return;
        }

        deviceAPI.startScan((p: Peripheral) => {
            const existingPeripheral = this.discoveredPeripherals.find(
                (existing) => existing.UUID === p.UUID
            );
            if (!existingPeripheral) {
                this.discoveredPeripherals.push(p);
                this.notifyPropertyChange('discoveredPeripherals', this.discoveredPeripherals);
            }

            // If we found the last connected device, try to reconnect
            if (p.UUID === this._lastConnectedDeviceUUID) {
                this.connect(p);
            }
        });
    }

    private startReconnectTimer() {
        if (this.reconnectTimer) {
            return;
        }
        console.log('[ConnectionManager] Starting reconnect timer.');
        this.reconnectTimer = setInterval(() => {
            if (this.state === ConnectionState.DISCONNECTED && !this.isConnecting) {
                this.startBackgroundScan().catch(error => {
                    console.error("[ConnectionManager] Error in background scan:", error);
                });
            }
        }, 2000);
    }

    private stopReconnectTimer() {
        if (this.reconnectTimer) {
            console.log('[ConnectionManager] Stopping reconnect timer.');
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        // Also stop the background scan
        deviceAPI.stopScan();
    }
}

export const connectionManager = new ConnectionManager();
