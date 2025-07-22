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
        console.log(`[ConnectionManager] Disconnected from ${peripheral.UUID}. Attempting to reconnect...`);
        this.reconnect();
    }

    private async reconnect() {
        if (!this._lastConnectedDeviceUUID) {
            return;
        }

        this.setState(ConnectionState.CONNECTING);
        console.log(`[ConnectionManager] Attempting to reconnect to ${this._lastConnectedDeviceUUID}`);

        let foundAndConnected = false;
        try {
            await deviceAPI.startScan(async (peripheral) => {
                if (peripheral.UUID === this._lastConnectedDeviceUUID) {
                    console.log(`[ConnectionManager] Found last connected device: ${peripheral.name || peripheral.UUID}`);
                    try {
                        await deviceAPI.connect(
                            peripheral,
                            (p) => this.onConnected(p),
                            (p) => this.onDisconnected(p)
                        );
                        foundAndConnected = true;
                    } catch (error) {
                        console.error(`[ConnectionManager] Reconnection error: ${error}`);
                        this.setState(ConnectionState.DISCONNECTED);
                    }
                }
            });
        } catch (error) {
            console.error(`[ConnectionManager] Scan for reconnect error: ${error}`);
            this.setState(ConnectionState.DISCONNECTED);
        } finally {
            // The scan automatically stops after the duration set in ble-backend.ts (4 seconds)
            // If we haven't connected by now, set state to disconnected.
            if (!foundAndConnected) {
                console.log(`[ConnectionManager] Could not reconnect to ${this._lastConnectedDeviceUUID} within scan period.`);
                this.setState(ConnectionState.DISCONNECTED);
            }
        }
    }
}

export const connectionManager = new ConnectionManager();
