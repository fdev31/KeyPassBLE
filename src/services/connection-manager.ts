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
    private isConnecting = false;
    private reconnectTimer: any = null;

    constructor() {
        super();
        this.init();
    }

    private async init() {
        await deviceAPI.requestPermissions();
        if (await deviceAPI.isBluetoothEnabled()) {
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
        // Stop the reconnect timer when a manual scan is initiated
        this.stopReconnectTimer();
        return deviceAPI.startScan(onDeviceDiscovered);
    }

    async connect(peripheral: Peripheral): Promise<void> {
        if (
            (this.state === ConnectionState.CONNECTED && this._connectedPeripheral?.UUID === peripheral.UUID) ||
            this.isConnecting
        ) {
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
        this.stopReconnectTimer();
        this.setConnectedPeripheral(peripheral);
        this.setState(ConnectionState.CONNECTED);
        this._lastConnectedDeviceUUID = peripheral.UUID;
        ApplicationSettings.setString(LAST_DEVICE_KEY, peripheral.UUID);
    }

    private onDisconnected(peripheral: Peripheral) {
        this.setConnectedPeripheral(null);
        this.setState(ConnectionState.DISCONNECTED);
        console.log(`[ConnectionManager] Disconnected from ${peripheral.UUID}.`);
        this.startReconnectTimer();
    }

    private startReconnectTimer() {
        if (this.reconnectTimer || !this._lastConnectedDeviceUUID) {
            return;
        }
        console.log('[ConnectionManager] Starting reconnect timer.');
        this.reconnectTimer = setInterval(() => {
            if (this.state === ConnectionState.DISCONNECTED && !this.isConnecting) {
                console.log('[ConnectionManager] Timer attempting to reconnect...');
                this.connect({ UUID: this._lastConnectedDeviceUUID } as Peripheral);
            }
        }, 2000);
    }

    private stopReconnectTimer() {
        if (this.reconnectTimer) {
            console.log('[ConnectionManager] Stopping reconnect timer.');
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}

export const connectionManager = new ConnectionManager();
