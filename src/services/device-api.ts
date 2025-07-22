import { Dialogs, ApplicationSettings } from '@nativescript/core';
import { Peripheral } from '@nativescript-community/ble';

import { PASSPHRASE_KEY } from './settings';
import { BLEBackend } from './backends/ble-backend';

// In the future, we could have an HTTPBackend as well
// import { HTTPBackend } from './backends/http-backend';

class DeviceAPI {
    private backend: BLEBackend; // or BLEBackend | HTTPBackend

    constructor() {
        // For now, we are only using BLE
        this.backend = new BLEBackend();
    }

    // --- Backend specific methods ---
    // These methods are specific to the BLE backend and the UI will
    // need to check the backend type before calling them.

    public getBackend(): BLEBackend { // In future: BLEBackend | HTTPBackend
        return this.backend;
    }

    public async requestPermissions(): Promise<boolean> {
        return this.backend.requestPermissions();
    }

    public async isBluetoothEnabled(): Promise<boolean> {
        return this.backend.isBluetoothEnabled();
    }

    public startScan(onDeviceDiscovered: (p: Peripheral) => void): Promise<void> {
        return this.backend.startScan(onDeviceDiscovered);
    }

    public async listPairedDevices(): Promise<Peripheral[]> {
        return this.backend.listPairedDevices();
    }

    public async connect(peripheral: Peripheral, onConnected: (p: Peripheral) => void, onDisconnected: (p: Peripheral) => void): Promise<void> {
        return this.backend.connect(peripheral, onConnected, onDisconnected);
    }

    public disconnect(): void {
        return this.backend.disconnect();
    }

    // --- Authentication ---
    async authenticate(): Promise<string> {
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


    // --- Generic API Methods ---
    typeRaw(text: string, layout?: number, ret: boolean = true): Promise<string> {
        const cmd = { cmd: "typeRaw", text, layout, ret: ret ? "true" : "false" };
        return this.backend.sendCommand(cmd);
    }

    typePass(id: number, layout?: number, ret: boolean = true): Promise<string> {
        const cmd = { cmd: "typePass", id, layout, ret: ret ? "true" : "false" };
        return this.backend.sendCommand(cmd);
    }

    fetchPass(id: number): Promise<string> {
        return this.backend.sendCommand({ cmd: "fetchPass", id });
    }

    editPass(id: number, name?: string, password?: string, layout?: number): Promise<string> {
        const cmd: { cmd: string; id: number; name?: string; password?: string; layout?: number } = { cmd: "editPass", id };
        if (name) cmd.name = name;
        if (password) cmd.password = password;
        if (layout) cmd.layout = layout;
        return this.backend.sendCommand(cmd);
    }

    list(): Promise<string> {
        return this.backend.sendCommand({ cmd: "list" });
    }

    reset(): Promise<string> {
        return this.backend.sendCommand({ cmd: "reset" });
    }

    updateWifiPass(newPass: string): Promise<string> {
        return this.backend.sendCommand({ cmd: "updateWifiPass", newPass });
    }

    passphrase(p: string): Promise<string> {
        return this.backend.sendCommand({ cmd: "passphrase", p });
    }

    dump(): Promise<string> {
        return this.backend.sendCommand({ cmd: "dump" });
    }

    restore(data: string): Promise<string> {
        return this.backend.sendCommand({ cmd: "restore", data });
    }
}

export const deviceAPI = new DeviceAPI();
