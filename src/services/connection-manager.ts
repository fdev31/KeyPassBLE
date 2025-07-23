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
    private isConnecting = false; // Flag to prevent concurrent connection attempts

    constructor() {
        super();
        this.init();
    }

    private async init() {
        await deviceAPI.requestPermissions();
        if (await deviceAPI.isBluetoothEnabled() && this._lastConnectedDeviceUUID) {
            this.connect({ UUID: this._lastConnectedDeviceUUID } as Peripheral);
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
        // Guard against connecting if already connected or a connection is in progress.
        if (
            (this.state === ConnectionState.CONNECTED && this._connectedPeripheral?.UUID === peripheral.UUID) ||
            this.isConnecting
        ) {
            console.log('[ConnectionManager] Connect called while already connected or connecting. Ignoring.');
            return;
        }

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
        } finally {
            this.isConnecting = false;
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
        console.log(`[ConnectionManager] Disconnected from ${peripheral.UUID}.`);
    }
}

export const connectionManager = new ConnectionManager();