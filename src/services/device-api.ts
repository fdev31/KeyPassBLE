import { Dialogs, ApplicationSettings } from '@nativescript/core';
import { Peripheral } from '@nativescript-community/ble';
import { PASSPHRASE_KEY } from './settings';
import { BLEBackend } from './backends/ble-backend';

class DeviceAPI {
    private backend: BLEBackend;

    constructor() {
        this.backend = new BLEBackend();
    }

    // Backend access
    getBackend = () => this.backend;

    // Direct delegation (no wrapper methods needed)
    requestPermissions = () => this.backend.requestPermissions();
    ensureBluetoothEnabled = () => this.backend.ensureBluetoothEnabled();
    startScan = (onDeviceDiscovered: (p: Peripheral) => void) => this.backend.startScan(onDeviceDiscovered);
    stopScan = () => this.backend.stopScan();
    listPairedDevices = () => this.backend.listPairedDevices();
    connect = (peripheral: Peripheral, onConnected: (p: Peripheral) => void, onDisconnected: (p: Peripheral) => void) =>
        this.backend.connect(peripheral, onConnected, onDisconnected);
    disconnect = () => this.backend.disconnect();

    // Authentication (only method with custom logic)
    async authenticate(): Promise<string> {
        const passphrase = ApplicationSettings.getString(PASSPHRASE_KEY);
        if (!passphrase) {
            return Promise.reject("Passphrase not found.");
        }
        return this.backend.sendCommand({ cmd: "passphrase", p: passphrase });
    }

    // Generic command helpers
    private cmd = (command: string, params: any = {}, timeout?: number, responseType?: "json" | "text" | undefined) =>
        this.backend.sendCommand({ cmd: command, ...params }, timeout, responseType);

    typeRaw = (text: string, layout?: number, ret = true) =>
        this.cmd("typeRaw", { text, layout, ret: ret ? "true" : "false" });

    typePass = (id: number, layout?: number, ret = true) =>
        this.cmd("typePass", { id, layout, ret: ret ? "true" : "false" });

    fetchPass = (id: number) => this.cmd("fetchPass", { id });

    editPass = (id: number, name?: string, password?: string, layout?: number) =>
        this.cmd("editPass", { id, ...(name && { name }), ...(password && { password }), ...(layout && { layout }) });

    list = () => this.cmd("list");
    reset = () => this.cmd("reset");
    updateWifiPass = (newPass: string) => this.cmd("updateWifiPass", { newPass });
    passphrase = (p: string) => this.cmd("passphrase", { p });
    dump = () => this.cmd("dump", {}, 10000, 'text');
    dumpOne = (uid: number) => this.cmd("dumpOne", { uid }, 10000, 'text');
    restore = (data: string) => this.cmd("restore", { data });
    restoreOne = (uid: number, data: string) => this.cmd("restoreOne", { uid, data });
}

export const deviceAPI = new DeviceAPI();
