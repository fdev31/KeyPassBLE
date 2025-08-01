import { ApplicationSettings } from '@nativescript/core';
import { Peripheral } from '@nativescript-community/ble';
import { PASSPHRASE_KEY } from './settings';
import { BLEBackend } from './backends/ble-backend';

// Define the interface for backend methods we want to expose
interface BackendMethods {
    requestPermissions(): Promise<boolean>;
    ensureConnectivity(): Promise<boolean>;
    startScan(onDeviceDiscovered: (p: Peripheral) => void): Promise<void>;
    stopScan(): Promise<void>;
    listPairedDevices(): Promise<Peripheral[]>;
    connect(peripheral: Peripheral, onConnected: (p: Peripheral) => void, onDisconnected: (p: Peripheral) => void): Promise<void>;
    disconnect(): void;
}

class DeviceAPI implements BackendMethods {
    private backend: BLEBackend; // | HTTPBackend in future

    constructor() {
        this.backend = new BLEBackend();
    }

    getBackend() { return this.backend; }

    // Backend method implementations - direct delegation
    requestPermissions() { return this.backend.requestPermissions(); }
    ensureConnectivity() { return this.backend.ensureConnectivity(); }
    startScan(onDeviceDiscovered: (p: Peripheral) => void) { return this.backend.startScan(onDeviceDiscovered); }
    stopScan() { return this.backend.stopScan(); }
    listPairedDevices() { return this.backend.listPairedDevices(); }
    connect(peripheral: Peripheral, onConnected: (p: Peripheral) => void, onDisconnected: (p: Peripheral) => void) {
        return this.backend.connect(peripheral, onConnected, onDisconnected);
    }
    disconnect() { return this.backend.disconnect(); }

    async authenticate(): Promise<string> {
        const passphrase = ApplicationSettings.getString(PASSPHRASE_KEY);
        if (!passphrase) throw new Error("Passphrase not found.");
        return this.backend.sendCommand({ cmd: "passphrase", p: passphrase });
    }

    private cmd(cmd: string, params = {}, timeout?: number, type?: 'json' | 'text') {
        return this.backend.sendCommand({ cmd, ...params }, timeout, type);
    }

    typeRaw(text: string, layout?: number, ret = true) {
        return this.cmd("typeRaw", { text, layout, ret: ret ? "true" : "false" });
    }

    typePass(id: number, layout?: number, ret = true) {
        return this.cmd("typePass", { id, layout, ret: ret ? "true" : "false" });
    }

    fetchPass(id: number) { return this.cmd("fetchPass", { id }); }

    editPass(id: number, name?: string, password?: string, layout?: number) {
        return this.cmd("editPass", { id, ...name && { name }, ...password && { password }, ...layout && { layout } });
    }

    list() { return this.cmd("list"); }
    reset() { return this.cmd("reset"); }
    updateWifiPass(newPass: string) { return this.cmd("updateWifiPass", { newPass }); }
    passphrase(p: string) { return this.cmd("passphrase", { p }); }
    // dump() { return this.cmd("dump", {}, 10000, 'text'); }
    dumpOne(uid: number) { return this.cmd("dumpOne", { uid }, 10000, 'text'); }
    // restore(data: string) { return this.cmd("restore", { data }); }
    restoreOne(uid: number, data: string) { return this.cmd("restoreOne", { uid, data }); }
}

export const deviceAPI = new DeviceAPI();
