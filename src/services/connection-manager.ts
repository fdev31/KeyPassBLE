import { Observable, ApplicationSettings } from '@nativescript/core';
import { Peripheral } from '@nativescript-community/ble';
import { deviceAPI } from './device-api';
import { LAST_DEVICE_KEY } from './settings';

export enum ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
}

class ConnectionManager extends Observable {
    private _state: ConnectionState = ConnectionState.DISCONNECTED;
    private _connectedPeripheral: Peripheral | null = null;
    private _lastConnectedDeviceUUID: string | null = ApplicationSettings.getString(LAST_DEVICE_KEY) || null;

    constructor() {
        super();
        this.init();
    }

    private async init() {
        await deviceAPI.requestPermissions();
        if (await deviceAPI.isBluetoothEnabled() && this._lastConnectedDeviceUUID) {
            this.reconnect();
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

    get connectedPeripheral(): Peripheral | null {
        return this._connectedPeripheral;
    }

    private setConnectedPeripheral(peripheral: Peripheral | null) {
        this._connectedPeripheral = peripheral;
        this.notifyPropertyChange('connectedPeripheral', peripheral);
    }

    async startScan(onDeviceDiscovered: (p: Peripheral) => void): Promise<void> {
        if (this.state !== ConnectionState.DISCONNECTED) {
            return;
        }
        return deviceAPI.startScan(onDeviceDiscovered);
    }

    async connect(peripheral: Peripheral): Promise<void> {
        if (this.state !== ConnectionState.DISCONNECTED) {
            return;
        }

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
        }
    }

    disconnect(): void {
        if (this.state === ConnectionState.CONNECTED && this._connectedPeripheral) {
            deviceAPI.disconnect();
        }
    }
    
    private onConnected(peripheral: Peripheral) {
        this.setConnectedPeripheral(peripheral);
        this.setState(ConnectionState.CONNECTED);
        this._lastConnectedDeviceUUID = peripheral.UUID;
        ApplicationSettings.setString(LAST_DEVICE_KEY, peripheral.UUID);
    }

    private onDisconnected(peripheral: Peripheral) {
        this.setConnectedPeripheral(null);
        this.setState(ConnectionState.DISCONNECTED);
    }

    private async reconnect() {
        if (!this._lastConnectedDeviceUUID) {
            return;
        }
        // This is a simplified reconnect. A more robust implementation
        // would involve scanning for the specific device UUID.
        // For now, we assume the device is advertising and connectable.
        console.log(`[ConnectionManager] Attempting to reconnect to ${this._lastConnectedDeviceUUID}`);
        // This is a placeholder for the actual reconnect logic,
        // which would likely involve scanning and then connecting.
    }
}

export const connectionManager = new ConnectionManager();
